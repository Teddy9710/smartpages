/**
 * Smart Page Scribe - Common Utilities
 *
 * This file contains shared utility functions used across the extension.
 * All functions are documented with JSDoc and include error handling.
 */

// ============================================================================
// CONSTANTS
// ============================================================================

/** @constant {number} DEFAULT_API_TIMEOUT - Default API request timeout in milliseconds */
const DEFAULT_API_TIMEOUT = 10000;

/** @constant {number} MAX_FILE_SIZE - Maximum file upload size in bytes (5MB) */
const MAX_FILE_SIZE = 5 * 1024 * 1024;

/** @constant {number} STORAGE_WARNING_THRESHOLD - Warn when storage exceeds this (8MB) */
const STORAGE_WARNING_THRESHOLD = 8 * 1024 * 1024;

/** @constant {string[]} SUPPORTED_FILE_FORMATS - Supported document formats for upload */
const SUPPORTED_FILE_FORMATS = ['.pdf', '.docx', '.txt', '.md', '.html', '.htm'];

/** @constant {number} SCREENSHOT_QUALITY - Default screenshot quality (0-100) */
const SCREENSHOT_QUALITY = 60;

/** @constant {number} DEBOUNCE_DELAY - Default debounce delay in milliseconds */
const DEBOUNCE_DELAY = 500;

/** @constant {number} THROTTLE_DELAY - Default throttle delay in milliseconds */
const THROTTLE_DELAY = 200;

/** @constant {number} DEFAULT_MAX_TOKENS - Default max tokens for LLM responses */
const DEFAULT_MAX_TOKENS = 4000;

/** @constant {number} MIN_MAX_TOKENS - Minimum configurable output tokens */
const MIN_MAX_TOKENS = 500;

/** @constant {number} MAX_MAX_TOKENS - Maximum configurable output tokens */
const MAX_MAX_TOKENS = 12000;

/** @constant {string} DEFAULT_PROMPT_MODE - Default prompt customization mode */
const DEFAULT_PROMPT_MODE = 'append';

/** @constant {string} DEFAULT_OUTPUT_FORMAT - Default generated document format */
const DEFAULT_OUTPUT_FORMAT = 'markdown';

/** @constant {string} DEFAULT_PROMPT_TEMPLATE - Default document generation prompt template */
const DEFAULT_PROMPT_TEMPLATE = `你是一名产品文档编辑。请根据录制到的网页操作，生成一份清晰、简洁、可直接使用的 Markdown 文档。

任务描述：
{{taskDescription}}

录制上下文：
{{sessionInfo}}

操作步骤原始记录：
{{steps}}

写作要求：
- 输出必须是标准 Markdown，不要输出解释性前言。
- 优先简洁，不要为每一步机械拆分“操作目标 / 具体操作 / 页面反馈 / 判断标准”。
- 每个操作步骤通常写 1-2 句话即可，只有复杂步骤才补充必要说明。
- 不确定的信息可以基于步骤合理推断，但不要编造具体账号、密码、金额、订单号、接口返回值等事实。
- 敏感信息必须脱敏：密码、令牌、验证码只写“输入密码/验证码”，不要写出录制中出现的具体值。
- 每个录制步骤都必须在对应步骤末尾单独保留 [截图N]，N 与步骤编号一致；不要写“截图占位”“步骤N截图”等字样。
- 对连续的细碎点击可以合并为一个小节，但不能遗漏对应的 [截图N]。
- 语言使用简体中文，面向非技术人员，表达清楚、可执行，避免空泛套话。

文档类型要求：
{{documentTypeInstructions}}`;

/** @constant {number} DOC_GEN_TIMEOUT - Timeout for document generation (120s) */
const DOC_GEN_TIMEOUT = 120000;

/** @constant {number} API_TEST_TIMEOUT - Timeout for API test calls (15s) */
const API_TEST_TIMEOUT = 15000;

/** @constant {boolean} DEBUG - Debug logging flag */
const DEBUG = false;

// ============================================================================
// ERROR HANDLING
// ============================================================================

/**
 * Custom error class for extension-specific errors
 * @extends Error
 */
class ExtensionError extends Error {
  /**
   * Creates a new ExtensionError
   * @param {string} message - Error message
   * @param {string} [code] - Error code for categorization
   */
  constructor(message, code = 'UNKNOWN_ERROR') {
    super(message);
    this.name = 'ExtensionError';
    this.code = code;
  }
}

/**
 * Safely executes an async function and handles errors
 * @template T
 * @param {Promise<T>} promise - The promise to execute
 * @param {string} [context='Operation'] - Context description for error messages
 * @param {(error: Error) => void} [onError] - Optional error callback
 * @returns {Promise<T|null>} Result or null on error
 */
async function safeExecute(promise, context = 'Operation', onError) {
  try {
    return await promise;
  } catch (error) {
    console.error(`[Scribe:${context}] Error:`, error);
    if (onError) {
      onError(error);
    }
    return null;
  }
}

/**
 * Wraps chrome.storage API in a Promise for cleaner async/await usage
 * @param {string} area - Storage area ('local' or 'sync')
 * @param {string} method - Method name ('get' or 'set')
 * @param {*} data - Data to pass to the method
 * @returns {Promise<*>} Storage operation result
 * @throws {ExtensionError} If chrome.storage is not available
 */
function storagePromise(area, method, data) {
  return new Promise((resolve, reject) => {
    if (!chrome?.storage?.[area]) {
      reject(new ExtensionError('chrome.storage is not available', 'STORAGE_UNAVAILABLE'));
      return;
    }

    chrome.storage[area][method](data, (result) => {
      if (chrome.runtime.lastError) {
        reject(new ExtensionError(chrome.runtime.lastError.message, 'STORAGE_ERROR'));
      } else {
        resolve(result);
      }
    });
  });
}

// ============================================================================
// STRING UTILITIES
// ============================================================================

/**
 * Escapes HTML to prevent XSS attacks
 * @param {string} text - Text to escape
 * @returns {string} Escaped HTML string
 * @example
 * escapeHtml('<script>alert("xss")</script>')
 * // returns: '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Truncates text to a specified maximum length
 * @param {string} text - Text to truncate
 * @param {number} [maxLength=50] - Maximum length
 * @param {string} [suffix='...'] - Suffix to add when truncated
 * @returns {string} Truncated text
 */
function truncateText(text, maxLength = 50, suffix = '...') {
  if (!text || text.length <= maxLength) return text || '';
  return text.substring(0, maxLength - suffix.length) + suffix;
}

/**
 * Masks an API key for display purposes
 * @param {string} apiKey - The API key to mask
 * @param {number} [visibleChars=7] - Number of characters to show at start
 * @param {number} [endChars=4] - Number of characters to show at end
 * @returns {string} Masked API key
 * @example
 * maskApiKey('sk-1234567890abcdef')
 * // returns: 'sk-1234...cdef'
 */
function maskApiKey(apiKey, visibleChars = 7, endChars = 4) {
  if (!apiKey || apiKey.length < 10) return apiKey || '';
  return apiKey.substring(0, visibleChars) + '...' + apiKey.substring(apiKey.length - endChars);
}

/**
 * Generates a unique session ID
 * @returns {string} Unique session identifier
 */
function generateSessionId() {
  return 'session_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
}

/**
 * Generates a unique document ID
 * @returns {string} Unique document identifier
 */
function generateDocumentId() {
  return Date.now().toString(36) + Math.random().toString(36).substring(2);
}

// ============================================================================
// FILE UTILITIES
// ============================================================================

/**
 * Formats a file size in bytes to human-readable format
 * @param {number} bytes - File size in bytes
 * @returns {string} Formatted file size
 * @example
 * formatFileSize(1536)
 * // returns: '1.5 KB'
 */
function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Checks if a file format is supported
 * @param {File} file - File to check
 * @param {string[]} [supportedFormats=SUPPORTED_FILE_FORMATS] - Array of supported extensions
 * @returns {boolean} True if format is supported
 */
function isSupportedFileFormat(file, supportedFormats = SUPPORTED_FILE_FORMATS) {
  if (!file) return false;
  const ext = '.' + file.name.split('.').pop().toLowerCase();
  return supportedFormats.includes(ext);
}

/**
 * Validates file size against maximum limit
 * @param {File} file - File to validate
 * @param {number} [maxSize=MAX_FILE_SIZE] - Maximum allowed size in bytes
 * @returns {boolean} True if file size is valid
 */
function isValidFileSize(file, maxSize = MAX_FILE_SIZE) {
  return file && file.size <= maxSize;
}

// ============================================================================
// DATE/TIME UTILITIES
// ============================================================================

/**
 * Formats a date to locale string (Chinese)
 * @param {Date|string|number} date - Date to format
 * @returns {string} Formatted date string
 */
function formatDate(date) {
  return new Date(date).toLocaleString('zh-CN');
}

/**
 * Gets a relative time string (e.g., "2 hours ago")
 * @param {Date|string|number} date - Date to compare
 * @returns {string} Relative time string
 */
function getRelativeTime(date) {
  const now = Date.now();
  const past = new Date(date).getTime();
  const diffMs = now - past;
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) return '刚刚';
  if (diffMins < 60) return `${diffMins}分钟前`;
  if (diffHours < 24) return `${diffHours}小时前`;
  if (diffDays < 7) return `${diffDays}天前`;
  return formatDate(date);
}

// ============================================================================
// DOM UTILITIES
// ============================================================================

/**
 * Safely sets innerHTML, sanitizing to prevent XSS
 * @param {HTMLElement} element - Target element
 * @param {string} html - HTML content
 * @param {boolean} [allowBasicFormatting=false] - Allow basic formatting tags
 */
function safeSetInnerHTML(element, html, allowBasicFormatting = false) {
  if (!element || !html) {
    element.innerHTML = '';
    return;
  }

  // Use DOMParser to parse and sanitize
  const doc = new DOMParser().parseFromString(html, 'text/html');

  // Remove dangerous elements
  const dangerousSelectors = ['script', 'iframe', 'object', 'embed', 'form', 'link', 'style'];
  doc.querySelectorAll(dangerousSelectors.join(',')).forEach(el => el.remove());

  // Remove event handlers from all elements
  doc.querySelectorAll('*').forEach(el => {
    for (const attr of Array.from(el.attributes)) {
      if (attr.name.startsWith('on')) {
        el.removeAttribute(attr.name);
      }
    }
  });

  // If basic formatting is not allowed, strip all tags
  if (!allowBasicFormatting) {
    element.textContent = doc.body.textContent;
  } else {
    element.innerHTML = doc.body.innerHTML;
  }
}

/**
 * Creates a DOM element with properties and children
 * @param {string} tag - HTML tag name
 * @param {Object} [properties={}] - Element properties
 * @param {string|HTMLElement|Array<string|HTMLElement>} [children] - Child elements or text
 * @returns {HTMLElement} Created element
 * @example
 * createElement('div', { className: 'test' }, 'Hello')
 * createElement('button', { onclick: () => {} }, ['Text', createElement('span')])
 */
function createElement(tag, properties = {}, children) {
  const element = document.createElement(tag);

  Object.entries(properties).forEach(([key, value]) => {
    if (key === 'className') {
      element.className = value;
    } else if (key === 'dataset') {
      Object.entries(value).forEach(([dataKey, dataValue]) => {
        element.dataset[dataKey] = dataValue;
      });
    } else if (key.startsWith('on') && typeof value === 'function') {
      element.addEventListener(key.substring(2).toLowerCase(), value);
    } else if (key in element) {
      element[key] = value;
    } else {
      element.setAttribute(key, value);
    }
  });

  if (children !== undefined) {
    const childrenArray = Array.isArray(children) ? children : [children];
    childrenArray.forEach(child => {
      if (typeof child === 'string') {
        element.appendChild(document.createTextNode(child));
      } else if (child instanceof HTMLElement) {
        element.appendChild(child);
      }
    });
  }

  return element;
}

/**
 * Debounces a function call
 * @param {Function} func - Function to debounce
 * @param {number} [delay=DEBOUNCE_DELAY] - Delay in milliseconds
 * @returns {Function} Debounced function
 */
function debounce(func, delay = DEBOUNCE_DELAY) {
  let timeoutId;
  return function (...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func.apply(this, args), delay);
  };
}

/**
 * Throttles a function call
 * @param {Function} func - Function to throttle
 * @param {number} [delay=THROTTLE_DELAY] - Delay in milliseconds
 * @returns {Function} Throttled function
 */
function throttle(func, delay = THROTTLE_DELAY) {
  let lastCall = 0;
  return function (...args) {
    const now = Date.now();
    if (now - lastCall >= delay) {
      lastCall = now;
      return func.apply(this, args);
    }
  };
}

// ============================================================================
// API UTILITIES
// ============================================================================

/**
 * Makes an API request with timeout and error handling
 * @param {string} url - Request URL
 * @param {Object} options - Fetch options
 * @param {number} [timeout=DEFAULT_API_TIMEOUT] - Request timeout in milliseconds
 * @returns {Promise<Response>} Fetch response
 * @throws {ExtensionError} On network or timeout errors
 */
async function fetchWithTimeout(url, options = {}, timeout = DEFAULT_API_TIMEOUT) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new ExtensionError('请求超时，请检查网络连接', 'REQUEST_TIMEOUT');
    }
    if (error instanceof TypeError && String(error.message || '').includes('Failed to fetch')) {
      throw new ExtensionError('网络请求失败：无法连接到模型 API。请检查 Base URL、网络代理、服务商跨域/CORS 设置，或稍后重试。', 'NETWORK_ERROR');
    }
    throw new ExtensionError(`网络请求失败: ${error.message}`, 'NETWORK_ERROR');
  }
}

/**
 * Validates a URL string
 * @param {string} urlString - URL to validate
 * @param {string[]} [allowedProtocols=['https:', 'http:']] - Allowed protocols
 * @returns {{valid: boolean, error?: string}} Validation result
 */
function validateUrl(urlString, allowedProtocols = ['https:', 'http:']) {
  try {
    const url = new URL(urlString);
    if (!allowedProtocols.includes(url.protocol)) {
      return {
        valid: false,
        error: `URL协议错误，仅支持: ${allowedProtocols.join(', ')}`
      };
    }
    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      error: `URL格式错误: ${error.message}`
    };
  }
}

// ============================================================================
// CHROME EXTENSION UTILITIES
// ============================================================================

/**
 * Sends a message to chrome.runtime with error handling
 * @param {Object} message - Message to send
 * @returns {Promise<*>} Response from runtime
 * @throws {ExtensionError} If message sending fails
 */
async function sendMessage(message) {
  return new Promise((resolve, reject) => {
    if (!chrome?.runtime?.id) {
      reject(new ExtensionError('扩展上下文已失效，请刷新当前页面后重试', 'EXTENSION_CONTEXT_INVALIDATED'));
      return;
    }
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        const msg = chrome.runtime.lastError.message || '';
        const code = msg.includes('Extension context invalidated')
          ? 'EXTENSION_CONTEXT_INVALIDATED'
          : 'MESSAGE_ERROR';
        const friendly = code === 'EXTENSION_CONTEXT_INVALIDATED'
          ? '扩展上下文已失效，请刷新当前页面后重试'
          : msg;
        reject(new ExtensionError(friendly, code));
      } else {
        resolve(response);
      }
    });
  });
}

/**
 * Queries chrome.tabs with error handling
 * @param {Object} queryInfo - Query parameters
 * @returns {Promise<chrome.tabs.Tab[]>} Array of tabs
 * @throws {ExtensionError} If query fails
 */
async function queryTabs(queryInfo) {
  return new Promise((resolve, reject) => {
    chrome.tabs.query(queryInfo, (tabs) => {
      if (chrome.runtime.lastError) {
        reject(new ExtensionError(chrome.runtime.lastError.message, 'TABS_ERROR'));
      } else {
        resolve(tabs);
      }
    });
  });
}

/**
 * Checks if a URL is restricted (chrome://, edge://, etc.)
 * @param {string} url - URL to check
 * @returns {boolean} True if URL is restricted
 */
function isRestrictedUrl(url) {
  if (!url) return false;
  const restrictedPrefixes = [
    'chrome://',
    'chrome-extension://',
    'edge://',
    'about:',
    'moz-extension://',
    'chrome-error://'
  ];
  return restrictedPrefixes.some(prefix => url.startsWith(prefix));
}

// ============================================================================
// NOTIFICATION UTILITIES
// ============================================================================

/**
 * Shows a Chrome notification
 * @param {string} title - Notification title
 * @param {string} message - Notification message
 * @param {string} [type='basic'] - Notification type
 * @param {string} [iconUrl] - Custom icon URL
 */
function showNotification(title, message, type = 'basic', iconUrl) {
  const notificationId = 'scribe-' + Date.now();
  const options = {
    type,
    title,
    message,
    iconUrl: iconUrl || chrome.runtime.getURL('icons/icon48.png')
  };

  chrome.notifications.create(notificationId, options, (createdId) => {
    if (chrome.runtime.lastError) {
      console.error('[Scribe:Notification] Failed to show:', chrome.runtime.lastError);
    }
  });
}

// ============================================================================
// CODE DETECTION UTILITIES
// ============================================================================

/**
 * Detects the programming language/type of code
 * @param {string} code - Code snippet to analyze
 * @returns {string} Detected language/type
 */
function detectCodeType(code) {
  if (!code || typeof code !== 'string') return 'unknown';

  const patterns = {
    'c_cpp': ['#include', '#define', 'printf('],
    'java': ['public class', 'private ', 'protected ', 'System.out'],
    'python': ['def ', 'import ', 'from ', 'print(', '__init__'],
    'javascript': ['function ', 'const ', 'let ', '=>', 'console.log'],
    'typescript': ['interface ', 'type ', ': string', ': number'],
    'html': ['<!DOCTYPE html', '<html', '<div', '<span'],
    'css': ['@media', '@keyframes', '{', '}'],
    'sql': ['SELECT ', 'FROM ', 'WHERE ', 'INSERT INTO'],
    'php': ['<?php', '$', 'function ', 'echo '],
    'ruby': ['def ', 'require ', 'puts ', '@'],
    'go': ['func ', 'package ', 'import (', ':='],
    'rust': ['fn ', 'let ', 'impl ', 'pub fn']
  };

  for (const [lang, indicators] of Object.entries(patterns)) {
    if (indicators.some(pattern => code.includes(pattern))) {
      return lang;
    }
  }

  return 'unknown';
}

/**
 * Extracts function name from code
 * @param {string} code - Code snippet
 * @returns {string} Extracted function name or 'unknown_function'
 */
function extractFunctionName(code) {
  if (!code) return 'unknown_function';

  // Try various patterns
  const patterns = [
    /function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/,
    /([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\([^)]*\)\s*{/,
    /def\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/,
    /func\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/
  ];

  for (const pattern of patterns) {
    const match = code.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }

  return 'unknown_function';
}

// ============================================================================
// CONFIG UTILITIES
// ============================================================================

/**
 * Loads AI configuration from chrome.storage.local
 * @async
 * @returns {Promise<{apiKey: string, baseUrl: string, modelName: string, smartDescription: boolean}>}
 */
async function loadConfig() {
  const result = await storagePromise('local', 'get', [
    'apiKey',
    'baseUrl',
    'modelName',
    'smartDescription',
    'maxTokens',
    'promptMode',
    'promptAppend',
    'customPrompt',
    'outputFormat',
    'styleGuide',
    'documentExamples'
  ]);
  const parsedMaxTokens = Number.parseInt(result.maxTokens, 10);
  const maxTokens = Number.isFinite(parsedMaxTokens)
    ? Math.min(Math.max(parsedMaxTokens, MIN_MAX_TOKENS), MAX_MAX_TOKENS)
    : DEFAULT_MAX_TOKENS;

  return {
    apiKey: result.apiKey || '',
    baseUrl: result.baseUrl || 'https://api.openai.com/v1',
    modelName: result.modelName || 'gpt-3.5-turbo',
    smartDescription: result.smartDescription !== undefined ? result.smartDescription : true,
    maxTokens,
    promptMode: result.promptMode || DEFAULT_PROMPT_MODE,
    promptAppend: result.promptAppend || '',
    customPrompt: result.customPrompt || DEFAULT_PROMPT_TEMPLATE,
    outputFormat: result.outputFormat || DEFAULT_OUTPUT_FORMAT,
    styleGuide: result.styleGuide || '',
    documentExamples: result.documentExamples || {}
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    ExtensionError,
    safeExecute,
    storagePromise,
    escapeHtml,
    truncateText,
    maskApiKey,
    generateSessionId,
    generateDocumentId,
    formatFileSize,
    isSupportedFileFormat,
    isValidFileSize,
    formatDate,
    getRelativeTime,
    safeSetInnerHTML,
    createElement,
    debounce,
    throttle,
    loadConfig,
    fetchWithTimeout,
    validateUrl,
    sendMessage,
    queryTabs,
    isRestrictedUrl,
    showNotification,
    detectCodeType,
    extractFunctionName,
    // Constants
    DEFAULT_API_TIMEOUT,
    MAX_FILE_SIZE,
    STORAGE_WARNING_THRESHOLD,
    DOC_GEN_TIMEOUT,
    API_TEST_TIMEOUT,
    MIN_MAX_TOKENS,
    MAX_MAX_TOKENS,
    DEFAULT_PROMPT_MODE,
    DEFAULT_OUTPUT_FORMAT,
    DEFAULT_PROMPT_TEMPLATE,
    SUPPORTED_FILE_FORMATS,
    SCREENSHOT_QUALITY,
    DEBOUNCE_DELAY,
    THROTTLE_DELAY,
    DEFAULT_MAX_TOKENS
  };
}
