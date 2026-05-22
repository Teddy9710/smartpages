/**
 * SmartPages - Content Script (Recorder)
 *
 * This script runs in the context of web pages to record user interactions.
 * Designed for minimal performance impact on the host page.
 *
 * Features:
 * - Click recording with element selection
 * - Navigation tracking (including SPA routes)
 * - Debounced/throttled event handling
 * - Visual feedback for recorded actions
 * - Singleton pattern to prevent duplicate initialization
 *
 * @module content/recorder
 */

// ============================================================================
// IIFE FOR SCOPE ISOLATION
// ============================================================================

(function() {
  'use strict';

  // Import common utilities (content scripts can import from utils)
  // Note: In content scripts, we need to use the full URL or rely on
  // the fact that utils are loaded separately. For now, we'll define
  // what we need locally to minimize overhead.

  // ==========================================================================
  // CONSTANTS
  // ==========================================================================

  /** @constant {number} DEBOUNCE_DELAY - Debounce delay for rapid clicks */
  const DEBOUNCE_DELAY = 500;

  /** @constant {number} THROTTLE_DELAY - Throttle delay for event frequency */
  const THROTTLE_DELAY = 200;

  /** @constant {number} SCROLL_DEBOUNCE_DELAY - Wait for scrolling to settle */
  const SCROLL_DEBOUNCE_DELAY = 700;

  /** @constant {number} MIN_SCROLL_DELTA - Minimum movement before recording scroll */
  const MIN_SCROLL_DELTA = 120;

  /** @constant {number} POINTER_FALLBACK_DELAY - Wait for click after pointerdown */
  const POINTER_FALLBACK_DELAY = 350;

  /** @constant {number} SELECTOR_MAX_DEPTH - Maximum depth for selector path */
  const SELECTOR_MAX_DEPTH = 5;

  /** @constant {number} FEEDBACK_DURATION - Duration of visual feedback (ms) */
  const FEEDBACK_DURATION = 500;

  /** @constant {number} MAX_TEXT_LENGTH - Maximum text content length */
  const MAX_TEXT_LENGTH = 50;

  /** @constant {number} PAGE_SNAPSHOT_LIMIT - Maximum items per snapshot group */
  const PAGE_SNAPSHOT_LIMIT = 12;

  // ==========================================================================
  // STATE
  // ==========================================================================

  /** @type {boolean} Whether currently listening for events */
  let isListening = false;

  /** @type {Element|null} Last clicked element (for debouncing) */
  let lastElement = null;

  /** @type {number} Timestamp of last click */
  let lastClickTime = 0;

  /** @type {number} Timestamp of last recorded action */
  let lastRecordedAction = 0;

  /** @type {{x:number,y:number}} Last recorded scroll position */
  let lastRecordedScroll = { x: window.scrollX || 0, y: window.scrollY || 0 };

  /** @type {{target: Element, timerId: number}|null} Pending pointer fallback */
  let pendingPointerFallback = null;

  /** @type {Map<Element, number>} Last input record time by element */
  const lastInputRecordTimes = new Map();

  /** @type {string} Last URL for navigation tracking */
  let lastUrl = location.href;

  /** @type {Element|null} Cached feedback style element */
  let feedbackStyleElement = null;

  // ==========================================================================
  // UTILITY FUNCTIONS
  // ==========================================================================

  /**
   * Debounces a function call
   * @param {Function} func - Function to debounce
   * @param {number} delay - Delay in milliseconds
   * @returns {Function} Debounced function
   */
  function debounce(func, delay) {
    let timeoutId;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeoutId);
        func(...args);
      };
      clearTimeout(timeoutId);
      timeoutId = setTimeout(later, delay);
    };
  }

  /**
   * Throttles a function call
   * @param {Function} func - Function to throttle
   * @param {number} delay - Delay in milliseconds
   * @returns {Function} Throttled function
   */
  function throttle(func, delay) {
    let lastCall = 0;
    return function executedFunction(...args) {
      const now = Date.now();
      if (now - lastCall >= delay) {
        lastCall = now;
        return func(...args);
      }
    };
  }

  /**
   * Safely sends a message to background script
   * @param {Object} message - Message to send
   */
  function sendMessage(message) {
    if (!chrome?.runtime?.id) {
      console.warn('[Scribe:Content] Extension context invalidated; refresh the page to continue recording.');
      stopListening();
      return;
    }
    chrome.runtime.sendMessage(message).catch(error => {
      console.error('[Scribe:Content] Failed to send message:', error);
      if (String(error?.message || '').includes('Extension context invalidated')) {
        stopListening();
      }
    });
  }

  function sendRecordedStep(step) {
    if (!step || !step.type) return;
    sendMessage({
      type: 'ADD_STEP',
      step
    });
  }

  // ==========================================================================
  // SELECTOR GENERATION
  // ==========================================================================

  /**
   * Generates a CSS selector for an element
   * Optimized to generate short, unique selectors
   * @param {Element} element - Target element
   * @returns {string} CSS selector
   */
  function generateSelector(element) {
    if (!element) return '';

    // Try ID first (shortest and most specific)
    if (element.id) {
      return `#${element.id}`;
    }

    // Try data attributes (common in modern frameworks)
    if (element.dataset) {
      for (const [key, value] of Object.entries(element.dataset)) {
        if (value && value.length < 50) {
          const selector = `[data-${key}="${value}"]`;
          if (isUniqueSelector(selector)) {
            return selector;
          }
        }
      }
    }

    // Try class name (if unique enough)
    if (element.className && typeof element.className === 'string') {
      const classes = element.className.split(' ').filter(c => c && c.length < 20);
      if (classes.length > 0 && classes.length < 5) {
        const selector = element.tagName.toLowerCase() + '.' + classes.join('.');
        if (isUniqueSelector(selector)) {
          return selector;
        }
      }
    }

    // Build path as fallback
    return buildSelectorPath(element);
  }

  /**
   * Checks if a selector is unique in the document
   * @param {string} selector - CSS selector
   * @returns {boolean} True if selector matches exactly one element
   */
  function isUniqueSelector(selector) {
    try {
      return document.querySelectorAll(selector).length === 1;
    } catch (e) {
      return false;
    }
  }

  /**
   * Builds a selector path from element to document
   * @param {Element} element - Target element
   * @returns {string} Selector path
   */
  function buildSelectorPath(element) {
    const path = [];
    let current = element;

    while (current && current !== document.body && path.length < SELECTOR_MAX_DEPTH) {
      let selector = current.tagName.toLowerCase();

      // Add ID if present
      if (current.id) {
        selector += '#' + current.id;
        path.unshift(selector);
        break;
      }

      // Add classes (limited)
      if (current.className && typeof current.className === 'string') {
        const classes = current.className.split(' ')
          .filter(c => c && c.length < 20)
          .slice(0, 3)
          .join('.');
        if (classes) {
          selector += '.' + classes;
        }
      }

      // Add nth-child for uniqueness
      if (current.parentElement) {
        const siblings = Array.from(current.parentElement.children);
        const index = siblings.indexOf(current);
        if (index >= 0) {
          selector += `:nth-child(${index + 1})`;
        }
      }

      path.unshift(selector);
      current = current.parentElement;
    }

    return path.join(' > ');
  }

  // ==========================================================================
  // ELEMENT DATA EXTRACTION
  // ==========================================================================

  /**
   * Finds the closest meaningful interactive element for a click target.
   * @param {Element} element - Raw clicked element
   * @returns {Element|null} Interactive element
   */
  function findInteractiveElement(element) {
    if (!element) return null;
    const selector = [
      'button',
      'a[href]',
      'input',
      'textarea',
      'select',
      'summary',
      '[role="button"]',
      '[role="tab"]',
      '[role="link"]',
      '[role="menuitem"]',
      '[role="option"]',
      '[role="checkbox"]',
      '[role="radio"]',
      '[role="switch"]',
      '[role="combobox"]',
      '[role="textbox"]',
      '[role="treeitem"]',
      '[role="gridcell"]',
      '[tabindex]:not([tabindex="-1"])',
      '[onclick]',
      '[data-testid]',
      '[data-test]',
      '[data-cy]'
    ].join(',');
    return element.closest?.(selector) || element;
  }

  function normalizeElementText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim().substring(0, MAX_TEXT_LENGTH);
  }

  function getAriaLabelledByText(element) {
    const ids = (element?.getAttribute('aria-labelledby') || '').split(/\s+/).filter(Boolean);
    return normalizeElementText(ids.map(id => document.getElementById(id)?.textContent || '').join(' '));
  }

  function getAssociatedLabelText(element) {
    if (!element) return '';
    if (element.labels?.length) {
      return normalizeElementText(Array.from(element.labels).map(label => label.textContent || '').join(' '));
    }
    if (element.id && window.CSS?.escape) {
      const label = document.querySelector(`label[for="${CSS.escape(element.id)}"]`);
      if (label) return normalizeElementText(label.textContent || '');
    }
    return normalizeElementText(element.closest?.('label')?.textContent || '');
  }

  /**
   * Extracts a stable human-readable name from an element.
   * @param {Element} element - Target element
   * @returns {string} Extracted text
   */
  function getElementText(element) {
    if (!element) return '';

    const tag = element.tagName || '';
    const inputType = (element.getAttribute('type') || '').toLowerCase();
    const canExposeValue = tag !== 'INPUT' || !['password', 'hidden'].includes(inputType);
    const candidates = [
      element.getAttribute('aria-label'),
      getAriaLabelledByText(element),
      getAssociatedLabelText(element),
      element.getAttribute('title'),
      element.getAttribute('alt'),
      element.getAttribute('placeholder'),
      canExposeValue ? element.getAttribute('value') : '',
      element.getAttribute('data-label'),
      element.getAttribute('data-title'),
      element.getAttribute('data-name'),
      element.getAttribute('data-testid'),
      element.getAttribute('data-test'),
      element.getAttribute('data-cy'),
      canExposeValue && (tag === 'INPUT' || tag === 'TEXTAREA') ? element.value : '',
      element.innerText,
      element.textContent
    ];

    for (const candidate of candidates) {
      const text = normalizeElementText(candidate);
      if (text) return text;
    }

    return '';
  }

  function getElementRole(element) {
    if (!element) return 'unknown';
    const explicitRole = element.getAttribute('role');
    if (explicitRole) return explicitRole;

    const tag = element.tagName ? element.tagName.toLowerCase() : '';
    const type = (element.getAttribute('type') || '').toLowerCase();
    if (tag === 'a') return 'link';
    if (tag === 'button') return 'button';
    if (tag === 'select') return 'combobox';
    if (tag === 'textarea') return 'textbox';
    if (tag === 'summary') return 'button';
    if (tag === 'input') {
      if (type === 'checkbox') return 'checkbox';
      if (type === 'radio') return 'radio';
      if (type === 'button' || type === 'submit' || type === 'reset') return 'button';
      return 'textbox';
    }
    return tag || 'unknown';
  }

  function shouldUsePointerFallback(element) {
    if (!element) return false;
    const role = getElementRole(element);
    const tag = element.tagName ? element.tagName.toLowerCase() : '';
    return [
      'button',
      'link',
      'tab',
      'menuitem',
      'option',
      'checkbox',
      'radio',
      'switch',
      'treeitem',
      'gridcell'
    ].includes(role) || ['button', 'a', 'summary'].includes(tag) || Boolean(element.getAttribute?.('onclick'));
  }

  function clearPointerFallback() {
    if (pendingPointerFallback?.timerId) {
      clearTimeout(pendingPointerFallback.timerId);
    }
    pendingPointerFallback = null;
  }

  function getElementState(element) {
    if (!element) return {};
    const state = {};
    ['aria-selected', 'aria-expanded', 'aria-checked', 'aria-pressed', 'aria-current'].forEach(attr => {
      const value = element.getAttribute(attr);
      if (value !== null) state[attr.replace('aria-', '')] = value;
    });
    if ('checked' in element) state.checked = Boolean(element.checked);
    if ('disabled' in element) state.disabled = Boolean(element.disabled);
    return state;
  }

  function getElementInfo(rawTarget) {
    const element = findInteractiveElement(rawTarget);
    return {
      element,
      name: getElementText(element),
      role: getElementRole(element),
      tagName: element?.tagName?.toLowerCase() || 'unknown',
      inputType: (element?.getAttribute?.('type') || '').toLowerCase(),
      selector: generateSelector(element),
      state: getElementState(element)
    };
  }

  function isVisibleElement(element) {
    if (!element || !(element instanceof Element)) return false;
    const style = window.getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 &&
      rect.bottom >= 0 && rect.right >= 0 &&
      rect.top <= window.innerHeight && rect.left <= window.innerWidth;
  }

  function collectVisibleTexts(selector, mapper, limit = PAGE_SNAPSHOT_LIMIT) {
    const items = [];
    const seen = new Set();
    document.querySelectorAll(selector).forEach(element => {
      if (items.length >= limit || !isVisibleElement(element)) return;
      const value = mapper(element);
      const text = typeof value === 'string' ? normalizeElementText(value) : value;
      const key = JSON.stringify(text);
      if (!text || seen.has(key)) return;
      seen.add(key);
      items.push(text);
    });
    return items;
  }

  function summarizeTables(limit = 4) {
    const tables = [];
    document.querySelectorAll('table').forEach(table => {
      if (tables.length >= limit || !isVisibleElement(table)) return;
      const caption = normalizeElementText(table.querySelector('caption')?.textContent || '');
      const headers = [];
      const seen = new Set();
      table.querySelectorAll('th').forEach(th => {
        if (headers.length >= 12 || !isVisibleElement(th)) return;
        const text = normalizeElementText(th.textContent || '');
        if (text && !seen.has(text)) {
          seen.add(text);
          headers.push(text);
        }
      });
      const rowCount = table.querySelectorAll('tbody tr, tr').length;
      tables.push({ caption, headers, rowCount });
    });
    return tables;
  }

  function getActiveTabs() {
    return collectVisibleTexts('[role="tab"][aria-selected="true"], .active[role="tab"], .selected[role="tab"], [aria-current="page"]', getElementText, 8);
  }

  function getDialogSummaries() {
    return collectVisibleTexts('[role="dialog"], dialog, .modal, .ant-modal, .el-dialog', element => {
      const title = normalizeElementText(
        element.querySelector('[role="heading"], h1, h2, h3, .modal-title, .ant-modal-title, .el-dialog__title')?.textContent || ''
      );
      const text = normalizeElementText(element.innerText || element.textContent || '');
      return title || text;
    }, 4);
  }

  function capturePageSnapshot() {
    try {
      const headings = collectVisibleTexts('h1, h2, h3, [role="heading"]', element => element.textContent, 10);
      const buttons = collectVisibleTexts('button, [role="button"], input[type="button"], input[type="submit"]', getElementText);
      const links = collectVisibleTexts('a[href], [role="link"]', getElementText, 10);
      const tabs = collectVisibleTexts('[role="tab"]', getElementText, 10);
      const inputs = collectVisibleTexts('input, textarea, [role="textbox"], [contenteditable="true"]', element => {
        const name = getElementText(element);
        const placeholder = element.getAttribute('placeholder') || '';
        return name || placeholder;
      }, 10);
      const selects = collectVisibleTexts('select, [role="combobox"], [role="listbox"]', getElementText, 8);
      const landmarks = collectVisibleTexts('main, nav, aside, header, footer, [role="main"], [role="navigation"], [role="complementary"]', element => {
        const role = element.getAttribute('role') || element.tagName.toLowerCase();
        const label = getElementText(element);
        return label ? role + ': ' + label : role;
      }, 8);
      const visibleText = normalizeElementText(document.body?.innerText || '');

      return {
        title: document.title || '',
        url: location.href,
        headings,
        landmarks,
        activeTabs: getActiveTabs(),
        tabs,
        buttons,
        links,
        inputs,
        selects,
        dialogs: getDialogSummaries(),
        tables: summarizeTables(),
        visibleTextSummary: visibleText.substring(0, 500)
      };
    } catch (error) {
      console.warn('[Scribe:Content] Failed to capture page snapshot:', error);
      return {
        title: document.title || '',
        url: location.href,
        snapshotError: String(error?.message || error)
      };
    }
  }

  /**
   * Gets safe coordinates from an event
   * @param {MouseEvent} event - Mouse event
   * @returns {{x: number, y: number}} Coordinates
   */
  function getEventCoordinates(event) {
    return {
      x: event.clientX || 0,
      y: event.clientY || 0
    };
  }

  function getScrollInfo() {
    const doc = document.documentElement || document.body;
    const maxX = Math.max(0, (doc.scrollWidth || 0) - window.innerWidth);
    const maxY = Math.max(0, (doc.scrollHeight || 0) - window.innerHeight);
    const x = Math.max(0, Math.round(window.scrollX || window.pageXOffset || 0));
    const y = Math.max(0, Math.round(window.scrollY || window.pageYOffset || 0));
    return {
      x,
      y,
      maxX,
      maxY,
      percentX: maxX ? Math.round((x / maxX) * 100) : 0,
      percentY: maxY ? Math.round((y / maxY) * 100) : 0,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      documentWidth: doc.scrollWidth || 0,
      documentHeight: doc.scrollHeight || 0
    };
  }

  function buildScrollActionDescription(scrollInfo, previousScroll) {
    const deltaY = scrollInfo.y - previousScroll.y;
    const deltaX = scrollInfo.x - previousScroll.x;
    if (Math.abs(deltaY) >= Math.abs(deltaX)) {
      if (deltaY > 0) return `向下滚动到页面约 ${scrollInfo.percentY}% 位置`;
      if (deltaY < 0) return `向上滚动到页面约 ${scrollInfo.percentY}% 位置`;
    }
    if (deltaX > 0) return `向右滚动到页面约 ${scrollInfo.percentX}% 位置`;
    if (deltaX < 0) return `向左滚动到页面约 ${scrollInfo.percentX}% 位置`;
    return `滚动到页面约 ${scrollInfo.percentY}% 位置`;
  }

  function maskSensitiveValue(value, inputType = '') {
    const text = String(value || '');
    if (!text) return '';
    if (['password', 'hidden'].includes(inputType)) return '[已脱敏]';
    return text
      .replace(/\b(?:sk|rk|pk)-[A-Za-z0-9_-]{8,}\b/g, '[API Key 已脱敏]')
      .replace(/\bgh[pousr]_[A-Za-z0-9_]{12,}\b/g, '[Token 已脱敏]')
      .replace(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{8,}\b/g, '[JWT 已脱敏]')
      .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[邮箱已脱敏]')
      .replace(/(^|[^\d])((?:\+?86[-\s]?)?1[3-9]\d{9})(?!\d)/g, '$1[手机号已脱敏]')
      .replace(/(^|[^\d])(\d{17}[\dXx])(?!\d)/g, '$1[身份证号已脱敏]');
  }

  function getFormValueSummary(element) {
    if (!element) return null;
    const tag = element.tagName ? element.tagName.toLowerCase() : '';
    const type = (element.getAttribute('type') || '').toLowerCase();

    if (tag === 'select') {
      const selectedOptions = Array.from(element.selectedOptions || []);
      return {
        kind: 'select',
        multiple: Boolean(element.multiple),
        selectedText: selectedOptions.map(option => normalizeElementText(option.textContent || option.label || option.value)).filter(Boolean),
        selectedValue: selectedOptions.map(option => maskSensitiveValue(option.value, type)).filter(Boolean)
      };
    }

    if (type === 'checkbox' || type === 'radio') {
      return {
        kind: type,
        checked: Boolean(element.checked),
        value: maskSensitiveValue(element.value, type),
        label: getElementText(element)
      };
    }

    if (tag === 'input' || tag === 'textarea' || element.getAttribute('contenteditable') === 'true') {
      const rawValue = element.getAttribute('contenteditable') === 'true'
        ? element.innerText || element.textContent || ''
        : element.value || '';
      const maskedValue = maskSensitiveValue(rawValue, type);
      return {
        kind: type || tag,
        value: maskedValue,
        valueLength: rawValue.length,
        isSensitive: ['password', 'hidden'].includes(type)
      };
    }

    return null;
  }

  function getSelectionSummary(element) {
    if (!element) return null;
    const role = getElementRole(element);
    const selectableRoles = ['option', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'treeitem', 'gridcell', 'tab'];
    if (!selectableRoles.includes(role)) return null;

    const parent = element.closest?.('[role="listbox"], [role="menu"], [role="tree"], [role="tablist"], [role="grid"], [role="combobox"]');
    const containerLabel = parent ? getElementText(parent) : '';
    const selected = element.getAttribute('aria-selected') ?? element.getAttribute('aria-checked') ?? element.getAttribute('aria-current');
    return {
      kind: role,
      selectedText: getElementText(element),
      selectedValue: maskSensitiveValue(element.getAttribute('data-value') || element.getAttribute('value') || element.getAttribute('aria-value text') || ''),
      selectedState: selected !== null ? selected : '',
      containerLabel
    };
  }

  /**
   * Builds a human-readable action description from a clicked element
   * @param {Element} element
   * @param {string} text
   * @returns {string}
   */
  function buildActionDescription(elementInfo) {
    var element = elementInfo.element;
    var text = elementInfo.name;
    var tag = elementInfo.tagName;
    var type = elementInfo.inputType;
    var role = elementInfo.role;
    if (role === 'tab') return text ? '点击了“' + text + '”页签' : '点击了页签';
    if (role === 'menuitem') return text ? '点击了“' + text + '”菜单项' : '点击了菜单项';
    if (role === 'option') return text ? '选择了“' + text + '”选项' : '选择了选项';
    if (role === 'switch') return text ? '点击了“' + text + '”开关' : '点击了开关';
    if (role === 'checkbox' || type === 'checkbox') return text ? '点击了“' + text + '”复选框' : '点击了复选框';
    if (role === 'radio' || type === 'radio') return text ? '点击了“' + text + '”单选项' : '点击了单选项';
    if (tag === 'a' || role === 'link') {
      var href = element.getAttribute('href') || '';
      return text ? '点击了“' + text + '”链接' + (href ? '（' + href + '）' : '') : '点击了链接 ' + href;
    }
    if (tag === 'button' || role === 'button' || type === 'button' || type === 'submit') {
      return text ? '点击了“' + text + '”按钮' : '点击了按钮';
    }
    if (tag === 'input') {
      var itype = type || 'text';
      var ph = element.getAttribute('placeholder') || '';
      if (ph) return '点击了“' + ph + '”输入框';
      return text ? '点击了“' + text + '”输入框' : '点击了' + itype + '输入框';
    }
    if (tag === 'textarea' || role === 'textbox') return text ? '点击了“' + text + '”文本框' : '点击了文本框';
    if (tag === 'select' || role === 'combobox') return text ? '点击了“' + text + '”下拉框' : '点击了下拉框';
    if (tag === 'nav' || role === 'navigation') return '点击了导航区域';
    if (text) return '点击了“' + text + '”';
    return '点击了 <' + tag + '> 元素';
  }

  function createInteractionStep(type, target, event) {
    const elementInfo = getElementInfo(target);
    const coords = event ? getEventCoordinates(event) : { x: 0, y: 0 };
    const formValue = ['input', 'change', 'submit'].includes(type)
      ? getFormValueSummary(elementInfo.element || target)
      : null;
    const selection = type === 'click' ? getSelectionSummary(elementInfo.element || target) : null;
    const action = type === 'input'
      ? buildInputActionDescription(elementInfo)
      : type === 'change'
        ? buildChangeActionDescription(elementInfo)
        : buildActionDescription(elementInfo);

    return {
      type,
      timestamp: Date.now(),
      selector: elementInfo.selector,
      rawSelector: generateSelector(target),
      tagName: elementInfo.tagName,
      text: elementInfo.name,
      elementName: elementInfo.name,
      elementRole: elementInfo.role,
      elementType: elementInfo.inputType || elementInfo.role,
      elementState: elementInfo.state,
      formValue,
      selection,
      pageSnapshot: capturePageSnapshot(),
      action,
      x: coords.x,
      y: coords.y
    };
  }

  function safeCreateInteractionStep(type, target, event) {
    try {
      return createInteractionStep(type, target, event);
    } catch (error) {
      console.warn('[Scribe:Content] Failed to create full interaction step, falling back to minimal step:', error);
      return {
        type,
        timestamp: Date.now(),
        tagName: target?.tagName?.toLowerCase?.() || 'unknown',
        text: normalizeElementText(target?.innerText || target?.textContent || ''),
        action: type === 'click' ? '点击页面元素' : '页面操作',
        pageSnapshot: {
          title: document.title || '',
          url: location.href,
          snapshotError: String(error?.message || error)
        },
        x: event?.clientX || 0,
        y: event?.clientY || 0
      };
    }
  }

  function buildInputActionDescription(elementInfo) {
    const name = elementInfo.name || '输入框';
    return '在“' + name + '”中输入内容';
  }

  function buildChangeActionDescription(elementInfo) {
    const name = elementInfo.name || '控件';
    if (elementInfo.role === 'combobox' || elementInfo.tagName === 'select') return '修改了“' + name + '”下拉选择';
    if (elementInfo.role === 'checkbox' || elementInfo.inputType === 'checkbox') return '切换了“' + name + '”复选框';
    if (elementInfo.role === 'radio' || elementInfo.inputType === 'radio') return '选择了“' + name + '”单选项';
    return '修改了“' + name + '”';
  }

  // ==========================================================================
  // VISUAL FEEDBACK
  // ==========================================================================

  /**
   * Shows visual feedback at the click position
   * @param {number} x - X coordinate
   * @param {number} y - Y coordinate
   */
  function showClickFeedback(x, y) {
    // Ensure feedback styles are injected
    if (!feedbackStyleElement) {
      feedbackStyleElement = document.createElement('style');
      feedbackStyleElement.id = 'scribe-feedback-style';
      feedbackStyleElement.textContent = `
        @keyframes scribe-ripple {
          0% { transform: scale(0.5); opacity: 1; }
          100% { transform: scale(2); opacity: 0; }
        }
        .scribe-click-feedback {
          position: fixed !important;
          pointer-events: none !important;
          z-index: 2147483647 !important;
          animation: scribe-ripple ${FEEDBACK_DURATION}ms ease-out forwards !important;
        }
      `;
      (document.head || document.documentElement).appendChild(feedbackStyleElement);
    }

    // Create and append feedback element
    const feedback = document.createElement('div');
    feedback.className = 'scribe-click-feedback';
    feedback.style.cssText = `
      left: ${x}px;
      top: ${y}px;
      width: 20px;
      height: 20px;
      border: 2px solid #ef4444;
      border-radius: 50%;
    `;

    (document.body || document.documentElement).appendChild(feedback);

    // Clean up after animation
    setTimeout(() => {
      feedback.remove();
    }, FEEDBACK_DURATION);
  }

  // ==========================================================================
  // EVENT HANDLERS
  // ==========================================================================

  /**
   * Records a click event
   * Throttled and debounced to prevent excessive recording
   * @param {MouseEvent} event - Click event
   */
  const recordClick = throttle(function(event) {
    if (!isListening) return;

    const now = Date.now();
    const target = event.target;
    const elementInfo = getElementInfo(target);
    if (pendingPointerFallback?.target === (elementInfo.element || target)) {
      clearPointerFallback();
    }

    // Debounce: prevent recording same element too quickly
    if (event.target === lastElement && now - lastClickTime < DEBOUNCE_DELAY) {
      console.log('[Scribe:Content] Click debounced (same element, too fast)');
      return;
    }

    // Throttle: prevent recording too frequently
    if (now - lastRecordedAction < THROTTLE_DELAY) {
      console.log('[Scribe:Content] Click throttled (too frequent)');
      return;
    }

    // Update tracking variables
    lastElement = elementInfo.element || target;
    lastClickTime = now;
    lastRecordedAction = now;

    const step = safeCreateInteractionStep('click', target, event);
    sendRecordedStep(step);

    // Show visual feedback
    showClickFeedback(step.x, step.y);
  }, THROTTLE_DELAY);

  const recordPointerDown = function(event) {
    if (!isListening || event.button !== 0) return;
    const target = event.target;
    const elementInfo = getElementInfo(target);
    const interactiveTarget = elementInfo.element || target;
    if (!shouldUsePointerFallback(interactiveTarget)) return;

    clearPointerFallback();
    pendingPointerFallback = {
      target: interactiveTarget,
      timerId: setTimeout(() => {
        if (!isListening) return;
        const now = Date.now();
        if (interactiveTarget === lastElement && now - lastClickTime < DEBOUNCE_DELAY) return;
        if (now - lastRecordedAction < THROTTLE_DELAY) return;

        lastElement = interactiveTarget;
        lastClickTime = now;
        lastRecordedAction = now;

        const step = safeCreateInteractionStep('click', target, event);
        step.action = step.action || '点击页面控件';
        step.triggerEvent = 'pointerdown';
        sendRecordedStep(step);
        showClickFeedback(step.x, step.y);
        pendingPointerFallback = null;
      }, POINTER_FALLBACK_DELAY)
    };
  };

  const recordInput = debounce(function(event) {
    if (!isListening) return;
    const target = event.target;
    if (!target || !['INPUT', 'TEXTAREA'].includes(target.tagName) && target.getAttribute?.('contenteditable') !== 'true') return;
    const now = Date.now();
    const lastTime = lastInputRecordTimes.get(target) || 0;
    if (now - lastTime < 800) return;
    lastInputRecordTimes.set(target, now);
    sendRecordedStep(safeCreateInteractionStep('input', target, event));
  }, 600);

  const recordChange = function(event) {
    if (!isListening) return;
    const target = event.target;
    if (!target || !['SELECT', 'INPUT', 'TEXTAREA'].includes(target.tagName)) return;
    sendRecordedStep(safeCreateInteractionStep('change', target, event));
  };

  const recordSubmit = function(event) {
    if (!isListening) return;
    const target = event.target;
    sendRecordedStep(safeCreateInteractionStep('submit', target, event));
  };

  const recordScroll = debounce(function() {
    if (!isListening) return;

    const scrollInfo = getScrollInfo();
    const deltaX = Math.abs(scrollInfo.x - lastRecordedScroll.x);
    const deltaY = Math.abs(scrollInfo.y - lastRecordedScroll.y);
    if (deltaX < MIN_SCROLL_DELTA && deltaY < MIN_SCROLL_DELTA) return;

    const previousScroll = lastRecordedScroll;
    lastRecordedScroll = { x: scrollInfo.x, y: scrollInfo.y };
    lastRecordedAction = Date.now();

    sendRecordedStep({
      type: 'scroll',
      timestamp: Date.now(),
      action: buildScrollActionDescription(scrollInfo, previousScroll),
      scroll: scrollInfo,
      pageSnapshot: capturePageSnapshot()
    });
  }, SCROLL_DEBOUNCE_DELAY);

  /**
   * Records a navigation event
   * @param {string} from - Source URL
   * @param {string} to - Destination URL
   */
  function recordNavigation(from, to) {
    if (!isListening || from === to) return;

    const step = {
      type: 'navigate',
      timestamp: Date.now(),
      from: from,
      to: to
    };

    sendRecordedStep(step);
  }

  // ==========================================================================
  // NAVIGATION TRACKING
  // ==========================================================================

  /**
   * Sets up URL change observers for SPA navigation
   */
  function observeUrlChanges() {
    // Hash changes
    window.addEventListener('hashchange', handleUrlChange, false);

    // Pop state (back/forward)
    window.addEventListener('popstate', handleUrlChange, false);

    // Override pushState and replaceState for SPA routing
    overrideHistoryMethods();
  }

  /**
   * Handles URL changes
   */
  function handleUrlChange() {
    const currentUrl = location.href;
    if (currentUrl !== lastUrl) {
      recordNavigation(lastUrl, currentUrl);
      lastUrl = currentUrl;
    }
  }

  /**
   * Overrides history.pushState and history.replaceState
   */
  function overrideHistoryMethods() {
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    history.pushState = function(...args) {
      originalPushState.apply(this, args);
      handleUrlChange();
    };

    history.replaceState = function(...args) {
      originalReplaceState.apply(this, args);
      handleUrlChange();
    };
  }

  /**
   * Removes URL change observers
   */
  function removeUrlObservers() {
    window.removeEventListener('hashchange', handleUrlChange, false);
    window.removeEventListener('popstate', handleUrlChange, false);

    // Note: We don't restore original history methods as it's complex
    // and the page will reload on next navigation anyway
  }

  // ==========================================================================
  // LISTENING CONTROL
  // ==========================================================================

  /**
   * Starts listening for user interactions
   */
  function startListening() {
    if (isListening) {
      console.log('[Scribe:Content] Already listening');
      return;
    }

    isListening = true;

    // Use capture phase for more reliable event interception
    document.addEventListener('pointerdown', recordPointerDown, true);
    document.addEventListener('click', recordClick, true);
    document.addEventListener('input', recordInput, true);
    document.addEventListener('change', recordChange, true);
    document.addEventListener('submit', recordSubmit, true);
    window.addEventListener('scroll', recordScroll, { passive: true });

    // Start URL observation
    observeUrlChanges();
    lastUrl = location.href;
    lastRecordedScroll = { x: window.scrollX || 0, y: window.scrollY || 0 };

    console.log('[Scribe:Content] Recording started');
  }

  /**
   * Stops listening for user interactions
   */
  function stopListening() {
    if (!isListening) {
      console.log('[Scribe:Content] Not listening');
      return;
    }

    isListening = false;

    document.removeEventListener('pointerdown', recordPointerDown, true);
    document.removeEventListener('click', recordClick, true);
    document.removeEventListener('input', recordInput, true);
    document.removeEventListener('change', recordChange, true);
    document.removeEventListener('submit', recordSubmit, true);
    window.removeEventListener('scroll', recordScroll);

    // Stop URL observation
    removeUrlObservers();

    // Reset tracking state
    lastElement = null;
    lastClickTime = 0;
    lastRecordedAction = 0;
    lastRecordedScroll = { x: window.scrollX || 0, y: window.scrollY || 0 };
    clearPointerFallback();
    lastInputRecordTimes.clear();

    console.log('[Scribe:Content] Recording stopped');
  }

  // ==========================================================================
  // MESSAGE HANDLING
  // ==========================================================================

  /**
   * Handles messages from background script
   * @param {Object} message - Message object
   * @param {Object} sender - Message sender
   * @param {Function} sendResponse - Response callback
   * @returns {boolean} True for async response
   */
  function messageHandler(message, sender, sendResponse) {
    switch (message.type) {
      case 'START_LISTENING':
        startListening();
        sendResponse({ success: true });
        break;

      case 'STOP_LISTENING':
        stopListening();
        sendResponse({ success: true });
        break;

      case 'IS_LISTENING':
        sendResponse({ isListening });
        break;

      default:
        sendResponse({ error: 'Unknown message type' });
    }

    return true;
  }

  // ==========================================================================
  // INITIALIZATION (Singleton Pattern)
  // ==========================================================================

  // Prevent multiple listeners if script is injected multiple times
  if (!window.scribeMessageListener) {
    window.scribeMessageListener = messageHandler;
    chrome.runtime.onMessage.addListener(messageHandler);
  }

  // Log initialization
  const logInit = () => {
    console.log('[Scribe:Content] Content script loaded', {
      version: '1.2.0',
      isListening
    });
  };

  // Wait for DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', logInit, { once: true });
  } else {
    logInit();
  }

})();
