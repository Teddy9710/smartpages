/**
 * SmartPages - Background Service Worker
 *
 * This is the main background service worker that manages:
 * - Recording state and sessions
 * - Message routing between components
 * - Document storage operations
 * - AI analysis triggering
 *
 * @module background
 */

// Import common utilities (importScripts for service worker)
importScripts('../utils/common.js');

// ============================================================================
// RECORDING STATE MANAGEMENT
// ============================================================================

/**
 * Recording state enumeration
 * @enum {string}
 */
const RecordingState = {
  IDLE: 'idle',
  RECORDING: 'recording',
  STOPPED: 'stopped'
};

const RECORDING_STORAGE_KEY = 'scribeRecordingState';
const MAX_SCREENSHOT_WIDTH = 1920;
const MAX_SCREENSHOT_HEIGHT = 1440;
const COMPRESSED_SCREENSHOT_QUALITY = 0.9;

/**
 * Manages the recording session lifecycle
 * @class
 */
class RecordingManager {
  constructor() {
    /** @type {RecordingState} */
    this.state = RecordingState.IDLE;

    /** @type {Session|null} */
    this.currentSession = null;

    /** @type {number|null} */
    this.tabId = null;

    /** @type {boolean} */
    this._hydrated = false;
  }

  async ensureHydrated() {
    if (this._hydrated) return;
    try {
      const result = await storagePromise('local', 'get', [RECORDING_STORAGE_KEY]);
      const saved = result?.[RECORDING_STORAGE_KEY];
      if (saved) {
        this.state = saved.state || RecordingState.IDLE;
        this.currentSession = saved.currentSession || null;
        this.tabId = saved.tabId || null;
      }
    } catch (error) {
      console.warn('[Scribe:Background] Failed to restore recording state:', error);
    } finally {
      this._hydrated = true;
    }
  }

  /**
   * Starts a new recording session
   * @async
   * @param {number} tabId - The tab ID to record
   * @returns {Promise<{success: boolean, error?: string}>}
   * @throws {ExtensionError} If recording is already in progress or tab is invalid
   */
  async startRecording(tabId) {
    await this.ensureHydrated();
    if (this.state === RecordingState.RECORDING) {
      throw new ExtensionError('录制已在进行中', 'RECORDING_IN_PROGRESS');
    }

    // Validate tab accessibility
    await this._validateTab(tabId);

    // Initialize session
    this.state = RecordingState.RECORDING;
    this.tabId = tabId;
    this.currentSession = this._createSession();

    // Start content script listening
    await this._startContentScriptListening(tabId);
    await this._persistState();

    this._notifyStateChanged();
    return { success: true };
  }

  /**
   * Stops the current recording session
   * @async
   * @returns {Promise<{success: boolean, session?: Session, error?: string}>}
   * @throws {ExtensionError} If no recording is in progress
   */
  async stopRecording() {
    await this.ensureHydrated();
    if (this.state !== RecordingState.RECORDING) {
      throw new ExtensionError('没有正在进行的录制', 'NO_RECORDING');
    }

    this.state = RecordingState.STOPPED;
    this.currentSession.endTime = Date.now();

    // Stop content script listening
    await this._stopContentScriptListening();
    await this._persistState();

    this._notifyStateChanged();

    // Trigger AI analysis asynchronously (non-blocking)
    this._triggerAIAnalysis().catch(error => {
      console.error('[Scribe:Background] AI analysis failed:', error);
    });

    return { success: true, session: this.currentSession };
  }

  /**
   * Resets the recording state
   * @async
   * @returns {{success: boolean}}
   */
  async resetRecording() {
    await this.ensureHydrated();
    this.state = RecordingState.IDLE;
    this.currentSession = null;
    this.tabId = null;
    await this._persistState();
    this._notifyStateChanged();
    return { success: true };
  }

  /**
   * Gets the current recording state
   * @returns {{state: RecordingState, stepCount: number, session: Session|null}}
   */
  getState() {
    return {
      state: this.state,
      stepCount: this.currentSession?.steps?.length || 0,
      session: this.currentSession
    };
  }

  /**
   * Adds a step to the current session
   * @async
   * @param {Step} step - The step to add
   * @returns {Promise<void>}
   */
  async addStep(step) {
    await this.ensureHydrated();
    if (this.state !== RecordingState.RECORDING || !this.currentSession) {
      console.warn('[Scribe:Background] Cannot add step: invalid state or no session');
      return;
    }

    if (!step || !step.type) {
      console.warn('[Scribe:Background] Invalid step data:', step);
      return;
    }

    try {
      // Add step with index for screenshot binding
      this.currentSession.steps.push(step);
      const stepIndex = this.currentSession.steps.length - 1;

      // Capture screenshot asynchronously (non-blocking)
      this._captureScreenshotForStep(stepIndex).catch(error => {
        console.error('[Scribe:Background] Screenshot capture failed:', error);
      });

      await this._persistState();
      this._notifyStateChanged();
    } catch (error) {
      console.error('[Scribe:Background] Failed to add step:', error);
    }
  }

  // ========================================================================
  // PRIVATE METHODS
  // ========================================================================

  /**
   * Validates that a tab is accessible and can be recorded
   * @private
   * @async
   * @param {number} tabId - Tab ID to validate
   * @throws {ExtensionError} If tab is invalid or restricted
   */
  async _validateTab(tabId) {
    try {
      const tab = await chrome.tabs.get(tabId);
      if (!tab || !tab.url) {
        throw new ExtensionError('无法访问该页面', 'TAB inaccessible');
      }

      // Check for restricted URLs
      if (isRestrictedUrl(tab.url)) {
        throw new ExtensionError(
          '无法在系统页面录制。请在普通网页（如百度、谷歌等）上使用。',
          'RESTRICTED_URL'
        );
      }
    } catch (error) {
      throw new ExtensionError('页面不可访问：' + error.message, 'TAB_ERROR');
    }
  }

  /**
   * Creates a new session object
   * @private
   * @returns {Session}
   */
  _createSession() {
    return {
      sessionId: generateSessionId(),
      startTime: Date.now(),
      steps: [],
      pageUrl: '',
      pageTitle: ''
    };
  }

  async _persistState() {
    const savedState = {
      state: this.state,
      currentSession: this.currentSession,
      tabId: this.tabId,
      updatedAt: Date.now()
    };

    try {
      await storagePromise('local', 'set', {
        [RECORDING_STORAGE_KEY]: savedState
      });
    } catch (error) {
      console.warn('[Scribe:Background] Failed to persist full recording state, retrying without screenshots:', error);
      await storagePromise('local', 'set', {
        [RECORDING_STORAGE_KEY]: {
          ...savedState,
          currentSession: this._createLightweightSession(this.currentSession),
          screenshotStorageLimited: true
        }
      });
    }
  }

  _createLightweightSession(session) {
    if (!session) return null;
    return {
      ...session,
      steps: (session.steps || []).map(step => {
        if (!step?.screenshot) return step;
        return {
          ...step,
          screenshot: undefined,
          screenshotOmitted: true
        };
      })
    };
  }

  /**
   * Sends message to content script to start listening
   * @private
   * @async
   * @param {number} tabId - Tab ID
   * @throws {ExtensionError} If content script communication fails
   */
  async _startContentScriptListening(tabId) {
    try {
      await this._injectContentScript(tabId);
      await chrome.tabs.sendMessage(tabId, { type: 'START_LISTENING' });
    } catch (error) {
      if (this._isContentScriptConnectionError(error)) {
        try {
          await this._injectContentScript(tabId);
          await chrome.tabs.sendMessage(tabId, { type: 'START_LISTENING' });
          return;
        } catch (injectError) {
          this.state = RecordingState.IDLE;
          this.currentSession = null;
          throw new ExtensionError(
            '无法注入录制脚本。请确认当前页面不是浏览器系统页；如果刚重新加载过扩展，请刷新目标页面后重试。' + (injectError?.message ? ` (${injectError.message})` : ''),
            'CONTENT_SCRIPT_ERROR'
          );
        }
      }

      this.state = RecordingState.IDLE;
      this.currentSession = null;
      throw error;
    }
  }

  _isContentScriptConnectionError(error) {
    const message = error?.message || '';
    return message.includes('Could not establish connection') ||
      message.includes('Receiving end does not exist') ||
      message.includes('The message port closed before a response was received');
  }

  async _injectContentScript(tabId) {
    if (!chrome.scripting?.executeScript) {
      throw new ExtensionError('chrome.scripting API 不可用', 'SCRIPTING_UNAVAILABLE');
    }

    try {
      await chrome.scripting.executeScript({
        target: { tabId, allFrames: true },
        files: ['content/recorder.js']
      });
    } catch (error) {
      const message = error?.message || '';
      if (message.includes('Cannot access') || message.includes('Extension manifest')) {
        throw new ExtensionError('当前页面无法注入录制脚本，请换到普通网页或刷新页面后重试。', 'CONTENT_SCRIPT_ERROR');
      }
      throw error;
    }
  }

  /**
   * Sends message to content script to stop listening
   * @private
   * @async
   */
  async _stopContentScriptListening() {
    if (this.tabId) {
      try {
        await chrome.tabs.sendMessage(this.tabId, { type: 'STOP_LISTENING' });
      } catch (error) {
        console.error('[Scribe:Background] Failed to stop listening:', error);
        // Continue anyway - stopping is not critical
      }
    }
  }

  async resumeRecordingInTab(tabId, tab = null) {
    await this.ensureHydrated();
    if (this.state !== RecordingState.RECORDING || this.tabId !== tabId) return;

    try {
      const currentTab = tab?.url ? tab : await chrome.tabs.get(tabId);
      if (!currentTab?.url || isRestrictedUrl(currentTab.url)) return;

      const previousUrl = this.currentSession?.pageUrl || '';
      const nextUrl = currentTab.url || '';
      if (previousUrl && nextUrl && previousUrl !== nextUrl) {
        await this._addNavigationStep(previousUrl, nextUrl);
      }

      if (this.currentSession) {
        this.currentSession.pageUrl = currentTab.url || this.currentSession.pageUrl || '';
        this.currentSession.pageTitle = currentTab.title || this.currentSession.pageTitle || '';
      }

      await this._startContentScriptListening(tabId);
      await this._persistState();
      this._notifyStateChanged();
      console.log('[Scribe:Background] Recording resumed after navigation:', currentTab.url);
    } catch (error) {
      console.warn('[Scribe:Background] Failed to resume recording after navigation:', error);
    }
  }

  async _addNavigationStep(from, to) {
    if (!this.currentSession?.steps || from === to) return;
    const lastStep = this.currentSession.steps[this.currentSession.steps.length - 1];
    if (lastStep?.type === 'navigate' && lastStep.from === from && lastStep.to === to) return;

    await this.addStep({
      type: 'navigate',
      timestamp: Date.now(),
      from,
      to
    });
  }

  /**
   * Captures a screenshot for a specific step
   * @private
   * @async
   * @param {number} stepIndex - Index of the step
   */
  async _captureScreenshotForStep(stepIndex) {
    try {
      // Check storage space before capturing
      const usage = await chrome.storage.local.getBytesInUse();
      if (usage > STORAGE_WARNING_THRESHOLD) {
        console.warn('[Scribe:Background] Storage space running low:', (usage / 1024 / 1024).toFixed(2), 'MB');
        showNotification('存储空间不足', '录制数据接近存储上限，请及时保存并清理旧数据');
        return;
      }

      if (this.state === RecordingState.RECORDING && this.tabId) {
        const rawScreenshot = await chrome.tabs.captureVisibleTab(null, {
          format: 'png',
          quality: SCREENSHOT_QUALITY
        });
        const screenshot = await this._compressScreenshot(rawScreenshot);

        // Only assign if step still exists (prevents race conditions)
        if (this.currentSession?.steps?.[stepIndex]) {
          this.currentSession.steps[stepIndex].screenshot = screenshot;
          await this._persistState();
        }
      }
    } catch (error) {
      console.error('[Scribe:Background] Screenshot failed for step', stepIndex, error);
      // Screenshot failure doesn't affect step recording
    }
  }

  async _compressScreenshot(dataUrl) {
    if (!dataUrl || typeof createImageBitmap !== 'function' || typeof OffscreenCanvas === 'undefined') {
      return dataUrl;
    }

    try {
      const blob = await (await fetch(dataUrl)).blob();
      const bitmap = await createImageBitmap(blob);
      const scale = Math.min(
        1,
        MAX_SCREENSHOT_WIDTH / bitmap.width,
        MAX_SCREENSHOT_HEIGHT / bitmap.height
      );
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = new OffscreenCanvas(width, height);
      const context = canvas.getContext('2d');
      context.drawImage(bitmap, 0, 0, width, height);
      bitmap.close?.();
      const compressedBlob = await canvas.convertToBlob({
        type: 'image/jpeg',
        quality: COMPRESSED_SCREENSHOT_QUALITY
      });
      return await this._blobToDataUrl(compressedBlob);
    } catch (error) {
      console.warn('[Scribe:Background] Screenshot compression failed, keeping original:', error);
      return dataUrl;
    }
  }

  async _blobToDataUrl(blob) {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
    }
    return `data:${blob.type || 'image/jpeg'};base64,${btoa(binary)}`;
  }

  async getStorageUsage() {
    const bytes = await chrome.storage.local.getBytesInUse();
    return {
      bytes,
      mb: Number((bytes / 1024 / 1024).toFixed(2)),
      warningThreshold: STORAGE_WARNING_THRESHOLD
    };
  }

  async clearRecordingCache() {
    await this.ensureHydrated();
    if (this.state === RecordingState.RECORDING) {
      throw new ExtensionError('录制进行中，不能清理录制缓存', 'RECORDING_IN_PROGRESS');
    }
    this.state = RecordingState.IDLE;
    this.currentSession = null;
    this.tabId = null;
    await storagePromise('local', 'remove', RECORDING_STORAGE_KEY);
    this._notifyStateChanged();
    return { success: true };
  }

  /**
   * Notifies all listeners of state change
   * @private
   */
  _notifyStateChanged() {
    chrome.runtime.sendMessage({
      type: 'RECORDING_STATE_CHANGED',
      state: this.getState()
    }).catch(() => {
      // Popup may not be open - ignore
    });
  }

  /**
   * Triggers AI analysis for the completed session
   * @private
   * @async
   */
  async _triggerAIAnalysis() {
    try {
      const config = await loadConfig();

      if (!config.apiKey) {
        console.warn('[Scribe:Background] No API key configured, skipping AI analysis');
        return;
      }

      if (!config.smartDescription) {
        console.log('[Scribe:Background] Smart description is disabled');
        return;
      }

      // Attach config to session for sidepanel use
      this.currentSession.config = config;

      // Notify sidepanel (may fail if not open - that's OK)
      chrome.runtime.sendMessage({
        type: 'START_AI_ANALYSIS',
        session: this.currentSession,
        config: config
      }).catch(() => {
        console.log('[Scribe:Background] Sidepanel not open - analysis queued');
      });
    } catch (error) {
      console.error('[Scribe:Background] AI analysis trigger failed:', error);
    }
  }
}

// ============================================================================
// DOCUMENT STORAGE HANDLERS
// ============================================================================

/**
 * Handles document-related messages
 * @async
 * @param {Object} message - Message object
 * @param {string} message.type - Message type
 * @returns {Promise<Object>} Response object
 */
async function handleDocumentMessage(message) {
  try {
    switch (message.type) {
      case 'GET_DOCUMENTS_LIST':
        return await _getDocumentsList();

      case 'SEARCH_DOCUMENTS':
        return await _searchDocuments(message.query);

      case 'GET_DOCUMENT_CONTENT':
        return await _getDocumentContent(message.docId);

      case 'DELETE_DOCUMENT':
        return await _deleteDocument(message.docId);

      case 'LINK_DOCUMENT_TO_CODE':
        return await _linkDocumentToCode(message.docId, message.codeContext);

      case 'GET_LINKED_CODES_FOR_DOCUMENT':
        return await _getLinkedCodesForDocument(message.docId);

      default:
        return { error: 'Unknown document message type: ' + message.type };
    }
  } catch (error) {
    console.error('[Scribe:Background] Document handler error:', error);
    return { error: error.message || '操作失败' };
  }
}

/**
 * Gets list of all stored documents
 * @private
 * @async
 * @returns {Promise<{success: boolean, documents: Array}>}
 */
async function _getDocumentsList() {
  const result = await storagePromise('local', 'get', ['documents']);
  const documents = result.documents || [];

  return {
    success: true,
    documents: documents.map(doc => ({
      id: doc.id,
      name: doc.name,
      size: doc.size,
      type: doc.type,
      uploadTime: doc.uploadTime
    }))
  };
}

/**
 * Searches documents by query
 * @private
 * @async
 * @param {string} query - Search query
 * @returns {Promise<{success: boolean, documents: Array}>}
 */
async function _searchDocuments(query) {
  const result = await storagePromise('local', 'get', ['documents']);
  const allDocs = result.documents || [];
  const searchTerm = query.toLowerCase();

  const matchedDocs = allDocs.filter(doc =>
    doc.name.toLowerCase().includes(searchTerm) ||
    (doc.content && doc.content.toLowerCase().includes(searchTerm))
  );

  return {
    success: true,
    documents: matchedDocs
  };
}

/**
 * Gets content of a specific document
 * @private
 * @async
 * @param {string} docId - Document ID
 * @returns {Promise<{success: boolean, document?: Object, message?: string}>}
 */
async function _getDocumentContent(docId) {
  const result = await storagePromise('local', 'get', ['documents']);
  const allDocuments = result.documents || [];
  const document = allDocuments.find(doc => doc.id === docId);

  if (document) {
    return { success: true, document };
  } else {
    return { success: false, message: '文档不存在' };
  }
}

/**
 * Deletes a document
 * @private
 * @async
 * @param {string} docId - Document ID
 * @returns {Promise<{success: boolean, message?: string}>}
 */
async function _deleteDocument(docId) {
  const result = await storagePromise('local', 'get', ['documents']);
  const existingDocs = result.documents || [];
  const updatedDocs = existingDocs.filter(doc => doc.id !== docId);

  await storagePromise('local', 'set', { documents: updatedDocs });

  return {
    success: true,
    message: '文档删除成功'
  };
}

/**
 * Creates a link between document and code
 * @private
 * @async
 * @param {string} docId - Document ID
 * @param {Object} codeContext - Code context information
 * @returns {Promise<{success: boolean, link?: Object}>}
 */
async function _linkDocumentToCode(docId, codeContext) {
  const result = await storagePromise('local', 'get', ['documentCodeLinks']);
  const existingLinks = result.documentCodeLinks || [];

  const newLink = {
    id: generateDocumentId(),
    docId,
    codeContext,
    linkedAt: new Date().toISOString(),
    metadata: {
      codeType: codeContext.code ? detectCodeType(codeContext.code) : 'unknown',
      functionName: codeContext.code ? extractFunctionName(codeContext.code) : 'unknown',
      description: codeContext.description || ''
    }
  };

  existingLinks.push(newLink);
  await storagePromise('local', 'set', { documentCodeLinks: existingLinks });

  return {
    success: true,
    link: newLink
  };
}

/**
 * Gets all code links for a document
 * @private
 * @async
 * @param {string} docId - Document ID
 * @returns {Promise<{success: boolean, links: Array}>}
 */
async function _getLinkedCodesForDocument(docId) {
  const result = await storagePromise('local', 'get', ['documentCodeLinks']);
  const allLinks = result.documentCodeLinks || [];
  const linkedCodes = allLinks.filter(link => link.docId === docId);

  return {
    success: true,
    links: linkedCodes
  };
}

// ============================================================================
// MESSAGE ROUTING
// ============================================================================

/**
 * Global recording manager instance
 * @type {RecordingManager}
 */
const recordingManager = new RecordingManager();

/**
 * Recording-related message types
 * @constant {string[]}
 */
const RECORDING_MESSAGE_TYPES = [
  'GET_RECORDING_STATE',
  'GET_STORAGE_USAGE',
  'START_RECORDING',
  'STOP_RECORDING',
  'RESET_RECORDING',
  'CLEAR_RECORDING_CACHE',
  'ADD_STEP',
  'GET_SESSION'
];

/**
 * Document-related message types
 * @constant {string[]}
 */
const DOCUMENT_MESSAGE_TYPES = [
  'GET_DOCUMENTS_LIST',
  'SEARCH_DOCUMENTS',
  'GET_DOCUMENT_CONTENT',
  'DELETE_DOCUMENT',
  'LINK_DOCUMENT_TO_CODE',
  'GET_LINKED_CODES_FOR_DOCUMENT'
];

/**
 * Main message handler (singleton pattern to prevent duplicate listeners)
 * @param {Object} message - Message object
 * @param {chrome.runtime.MessageSender} sender - Message sender
 * @param {function} sendResponse - Response callback
 * @returns {boolean} True to keep message channel open for async response
 */
function messageHandler(message, sender, sendResponse) {
  // Handle async response
  (async () => {
    try {
      console.log('[Scribe:Background] Received:', message.type);

      if (RECORDING_MESSAGE_TYPES.includes(message.type)) {
        return await handleRecordingMessage(message, sender);
      } else if (DOCUMENT_MESSAGE_TYPES.includes(message.type)) {
        return await handleDocumentMessage(message);
      } else {
        console.warn('[Scribe:Background] Unknown message type:', message.type);
        return { error: 'Unknown message type: ' + message.type };
      }
    } catch (error) {
      console.error('[Scribe:Background] Handler error:', error);
      return { error: error.message || '操作失败' };
    }
  })().then(result => {
    console.log('[Scribe:Background] Sending response:', result);
    sendResponse(result);
  }).catch(error => {
    console.error('[Scribe:Background] Response error:', error);
    sendResponse({ error: error.message || '响应失败' });
  });

  return true; // Keep message channel open
}

/**
 * Handles recording-related messages
 * @private
 * @async
 * @param {Object} message - Message object
 * @param {chrome.runtime.MessageSender} sender - Message sender
 * @returns {Promise<Object>} Response object
 */
async function handleRecordingMessage(message, sender) {
  switch (message.type) {
    case 'GET_RECORDING_STATE':
      return recordingManager.getState();

    case 'GET_STORAGE_USAGE':
      return await recordingManager.getStorageUsage();

    case 'START_RECORDING':
      if (!message.tabId) {
        return { error: 'Missing tabId parameter' };
      }
      return await recordingManager.startRecording(message.tabId);

    case 'STOP_RECORDING':
      return await recordingManager.stopRecording();

    case 'RESET_RECORDING':
      return await recordingManager.resetRecording();

    case 'CLEAR_RECORDING_CACHE':
      return await recordingManager.clearRecordingCache();

    case 'ADD_STEP':
      if (!message.step) {
        return { error: 'Missing step data' };
      }
      if (sender.tab && recordingManager.currentSession) {
        // Update page info for each step (handles SPA navigation)
        recordingManager.currentSession.pageUrl = sender.tab.url || '';
        recordingManager.currentSession.pageTitle = sender.tab.title || '';
        await recordingManager.addStep(message.step);
      }
      return { success: true };

    case 'GET_SESSION':
      return recordingManager.currentSession;

    default:
      return { error: 'Unknown recording message type: ' + message.type };
  }
}

// Register message handler (singleton)
if (!chrome.runtime.scribeMessageListener) {
  chrome.runtime.scribeMessageListener = messageHandler;
  chrome.runtime.onMessage.addListener(messageHandler);
}

if (!chrome.runtime.scribeTabUpdateListener) {
  chrome.runtime.scribeTabUpdateListener = async function(tabId, changeInfo, tab) {
    if (changeInfo.status !== 'complete') return;
    await recordingManager.resumeRecordingInTab(tabId, tab);
  };
  chrome.tabs.onUpdated.addListener(chrome.runtime.scribeTabUpdateListener);
}

// ============================================================================
// SERVICE WORKER LIFECYCLE
// ============================================================================

/**
 * Handles extension install/update events
 */
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('[Scribe:Background] SmartPages installed');
    // Could open setup page or show welcome notification
    showNotification(
      'SmartPages',
      '安装成功！点击扩展图标开始录制您的操作流程。'
    );
  } else if (details.reason === 'update') {
    console.log('[Scribe:Background] SmartPages updated to', chrome.runtime.getManifest().version);
  }
});

/**
 * Handles notification click events
 */
chrome.notifications.onClicked.addListener((notificationId) => {
  if (notificationId.startsWith('scribe-')) {
    chrome.runtime.openOptionsPage();
  }
});

/**
 * Service worker activation (MV3 best practice)
 */
self.addEventListener('activate', (event) => {
  console.log('[Scribe:Background] Service worker activated');
  // Claim clients to ensure control immediately
  event.waitUntil(self.clients.claim());
});

/**
 * Global unhandled rejection handler
 */
self.addEventListener('unhandledrejection', (event) => {
  console.error('[Scribe:Background] Unhandled rejection:', event.reason);
  // Prevent default (which would log to console anyway in SW)
  event.preventDefault();
});

// ============================================================================
// TYPE DEFINITIONS (JSDoc Reference)
// ============================================================================

/**
 * @typedef {Object} Session
 * @property {string} sessionId - Unique session identifier
 * @property {number} startTime - Session start timestamp
 * @property {number} [endTime] - Session end timestamp
 * @property {Step[]} steps - Array of recorded steps
 * @property {string} pageUrl - Current page URL
 * @property {string} pageTitle - Current page title
 * @property {Config} [config] - AI configuration attached after recording
 */

/**
 * @typedef {Object} Step
 * @property {string} type - Step type ('click', 'navigate', etc.)
 * @property {number} timestamp - Step timestamp
 * @property {string} [selector] - Element selector
 * @property {string} [tagName] - Element tag name
 * @property {string} [text] - Element text content
 * @property {number} [x] - Click X coordinate
 * @property {number} [y] - Click Y coordinate
 * @property {string} [screenshot] - Base64 screenshot data
 * @property {string} [from] - Navigation source URL
 * @property {string} [to] - Navigation destination URL
 * @property {Object|null} [formValue] - Form value summary for inputs and selections
 * @property {Object|null} [selection] - Custom option/menu selection summary
 * @property {Object} [scroll] - Scroll position details
 * @property {Object} [pageSnapshot] - Semantic page snapshot
 */

/**
 * @typedef {Object} Config
 * @property {string} apiKey - OpenAI API key
 * @property {string} baseUrl - API base URL
 * @property {string} modelName - Model name to use
 * @property {boolean} smartDescription - Whether smart description is enabled
 */
