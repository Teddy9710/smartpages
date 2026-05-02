/**
 * Smart Page Scribe - Content Script (Recorder)
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

  /** @constant {number} SELECTOR_MAX_DEPTH - Maximum depth for selector path */
  const SELECTOR_MAX_DEPTH = 5;

  /** @constant {number} FEEDBACK_DURATION - Duration of visual feedback (ms) */
  const FEEDBACK_DURATION = 500;

  /** @constant {number} MAX_TEXT_LENGTH - Maximum text content length */
  const MAX_TEXT_LENGTH = 50;

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
    chrome.runtime.sendMessage(message).catch(error => {
      console.error('[Scribe:Content] Failed to send message:', error);
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
   * Extracts text content from an element
   * @param {Element} element - Target element
   * @returns {string} Extracted text
   */
  function getElementText(element) {
    if (!element) return '';

    // Handle input/textarea elements
    if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
      return element.value || element.placeholder || '';
    }

    // Get text content, limited to prevent large strings
    const text = element.textContent?.trim() || '';
    return text.substring(0, MAX_TEXT_LENGTH);
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
    lastElement = event.target;
    lastClickTime = now;
    lastRecordedAction = now;

    const target = event.target;
    const coords = getEventCoordinates(event);

    // Build step object
    const step = {
      type: 'click',
      timestamp: now,
      selector: generateSelector(target),
      tagName: target.tagName?.toLowerCase() || 'unknown',
      text: getElementText(target),
      x: coords.x,
      y: coords.y
    };

    // Send to background (async, don't await)
    sendMessage({
      type: 'ADD_STEP',
      step: step
    });

    // Show visual feedback
    showClickFeedback(coords.x, coords.y);
  }, THROTTLE_DELAY);

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

    sendMessage({
      type: 'ADD_STEP',
      step: step
    });
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
    document.addEventListener('click', recordClick, true);

    // Start URL observation
    observeUrlChanges();

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

    document.removeEventListener('click', recordClick, true);

    // Stop URL observation
    removeUrlObservers();

    // Reset tracking state
    lastElement = null;
    lastClickTime = 0;
    lastRecordedAction = 0;

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
