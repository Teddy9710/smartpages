/**
 * CSS selector helpers for the recorder content script.
 * Loaded before recorder.js and shared through the isolated-world global.
 */
(function registerRecorderSelectorHelpers(globalScope) {
  'use strict';

  const SELECTOR_MAX_DEPTH = 5;

  function escapeSelectorPart(value) {
    const text = String(value ?? '');
    if (globalScope.CSS?.escape) return globalScope.CSS.escape(text);
    let escaped = '';
    for (let index = 0; index < text.length; index += 1) {
      const char = text[index];
      const code = char.charCodeAt(0);
      const isLeadingDigit = index === 0 && code >= 48 && code <= 57;
      const isSecondDigitAfterDash = index === 1 && text[0] === '-' && code >= 48 && code <= 57;
      if (code === 0) escaped += '\uFFFD';
      else if (isLeadingDigit || isSecondDigitAfterDash) escaped += `\\${code.toString(16)} `;
      else if (code >= 128 || char === '-' || char === '_' || /[A-Za-z0-9]/.test(char)) escaped += char;
      else escaped += `\\${char}`;
    }
    return escaped;
  }

  function datasetKeyToAttributeName(key) {
    return `data-${String(key).replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)}`;
  }

  function isUniqueSelector(selector) {
    try { return document.querySelectorAll(selector).length === 1; } catch (_error) { return false; }
  }

  function buildSelectorPath(element) {
    const path = [];
    let current = element;
    while (current && current !== document.body && path.length < SELECTOR_MAX_DEPTH) {
      let selector = current.tagName.toLowerCase();
      if (current.id) {
        const idSelector = `#${escapeSelectorPart(current.id)}`;
        if (isUniqueSelector(idSelector)) { path.unshift(idSelector); break; }
      }
      if (current.className && typeof current.className === 'string') {
        const classes = current.className.split(/\s+/).filter(value => value && value.length < 20)
          .slice(0, 3).map(escapeSelectorPart).join('.');
        if (classes) selector += `.${classes}`;
      }
      if (current.parentElement) {
        const index = Array.from(current.parentElement.children).indexOf(current);
        if (index >= 0) selector += `:nth-child(${index + 1})`;
      }
      path.unshift(selector);
      current = current.parentElement;
    }
    return path.join(' > ');
  }

  function generateSelector(element) {
    if (!element) return '';
    if (element.id) {
      const selector = `#${escapeSelectorPart(element.id)}`;
      if (isUniqueSelector(selector)) return selector;
    }
    if (element.dataset) {
      for (const [key, value] of Object.entries(element.dataset)) {
        if (value && value.length < 50) {
          const selector = `[${datasetKeyToAttributeName(key)}="${escapeSelectorPart(value)}"]`;
          if (isUniqueSelector(selector)) return selector;
        }
      }
    }
    if (element.className && typeof element.className === 'string') {
      const classes = element.className.split(/\s+/).filter(value => value && value.length < 20);
      if (classes.length > 0 && classes.length < 5) {
        const selector = `${element.tagName.toLowerCase()}.${classes.map(escapeSelectorPart).join('.')}`;
        if (isUniqueSelector(selector)) return selector;
      }
    }
    return buildSelectorPath(element);
  }

  globalScope.SmartPagesRecorderSelector = Object.freeze({
    escapeSelectorPart, datasetKeyToAttributeName, generateSelector, buildSelectorPath
  });
})(globalThis);
