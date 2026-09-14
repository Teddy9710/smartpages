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
importScripts(
  '../utils/common.js',
  '../workflow/schema.js',
  'agent-bridge-client.js',
  'recording-manager.js',
  'document-handlers.js',
  'workflow-run-manager.js',
  // The GIF recorder owns its own state and never writes to RecordingManager.
  '../gif-recording/gif-recording-manager.js'
);

// ============================================================================
// RECORDING STATE MANAGEMENT
// ============================================================================

/**
 * Recording state enumeration
 * @enum {string}
 */
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
// ============================================================================
// MESSAGE ROUTING
// ============================================================================

const workflowRunManager = new WorkflowRunManager();
globalThis.workflowRunManager = workflowRunManager;

const AGENT_BRIDGE_CONFIG_KEY = 'smartpagesAgentBridge';

async function getAgentBridgeConfig() {
  const result = await storagePromise('local', 'get', [AGENT_BRIDGE_CONFIG_KEY]);
  return result?.[AGENT_BRIDGE_CONFIG_KEY] || {};
}

function getInitialWorkflowUrlPreconditions(workflow) {
  const preconditions = workflow?.steps?.[0]?.preconditions;
  if (!Array.isArray(preconditions)) return [];
  return preconditions
    .filter(condition => condition?.type === 'url' && typeof condition.url === 'string')
    .map(condition => condition.url);
}

async function getWorkflowTabId(workflow) {
  const allowedOrigins = workflow?.allowedOrigins;
  const requiredUrls = getInitialWorkflowUrlPreconditions(workflow);
  const activeTabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const allTabs = await chrome.tabs.query({});
  const candidates = [...(activeTabs || []), ...(allTabs || [])];
  const tab = candidates.find(candidate =>
    Number.isInteger(candidate?.id) &&
    globalThis.SmartPagesWorkflowSchema.isOriginAllowed(candidate.url, allowedOrigins) &&
    (requiredUrls.length === 0 || requiredUrls.includes(candidate.url))
  );
  if (!tab?.id) {
    const error = new Error('No open browser tab matches the workflow allowed origins.');
    error.code = 'ORIGIN_NOT_ALLOWED';
    throw error;
  }
  return tab.id;
}

const agentBridgeRunner = {
  async startRun(payload) {
    const workflow = payload?.workflow;
    const tabId = await getWorkflowTabId(workflow);
    return await workflowRunManager.start(workflow, payload.variables || {}, tabId);
  },
  async getRunStatus(payload) {
    await workflowRunManager.ensureHydrated();
    const status = workflowRunManager.getStatus();
    if (!status || (payload?.runId && status.runId !== payload.runId)) {
      const error = new Error('Workflow run was not found.');
      error.code = 'RUN_NOT_FOUND';
      throw error;
    }
    return status;
  },
  async cancelRun(payload) {
    return await workflowRunManager.cancel(payload.runId);
  }
};

const agentBridgeClient = globalThis.SmartPagesAgentBridge.createAgentBridgeClient({
  getConfig: getAgentBridgeConfig,
  runner: agentBridgeRunner
});
globalThis.agentBridgeClient = agentBridgeClient;
agentBridgeClient.connect().catch(error => console.warn('[SmartPages AgentBridge] connect failed:', error));

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
  'PAUSE_RECORDING',
  'RESUME_RECORDING',
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

const WORKFLOW_MESSAGE_TYPES = [
  'WORKFLOW_START_RUN', 'WORKFLOW_RESUME_RUN', 'WORKFLOW_GET_RUN_STATUS', 'WORKFLOW_CANCEL_RUN'
];

const AGENT_BRIDGE_MESSAGE_TYPES = [
  'AGENT_BRIDGE_GET_STATUS',
  'AGENT_BRIDGE_RECONNECT'
];

/**
 * Main message handler (singleton pattern to prevent duplicate listeners)
 * @param {Object} message - Message object
 * @param {chrome.runtime.MessageSender} sender - Message sender
 * @param {function} sendResponse - Response callback
 * @returns {boolean} True to keep message channel open for async response
 */
function messageHandler(message, sender, sendResponse) {
  // These messages are addressed to the hidden GIF encoder page. Let that
  // document be the sole responder; otherwise this generic router can win the
  // response race before the encoder has started/stopped its media stream.
  if (message?.target === 'gif-recorder-offscreen' || message?.target === 'gif-recorder-ui') {
    return false;
  }
  // Handle async response
  (async () => {
    try {
      debugLog('[Scribe:Background] Received:', message.type);

      if (globalThis.GIF_RECORDING_MESSAGE_TYPES?.includes(message.type)) {
        return await globalThis.gifRecordingManager.handleMessage(message, sender);
      } else if (RECORDING_MESSAGE_TYPES.includes(message.type)) {
        return await handleRecordingMessage(message, sender);
      } else if (DOCUMENT_MESSAGE_TYPES.includes(message.type)) {
        return await handleDocumentMessage(message);
      } else if (WORKFLOW_MESSAGE_TYPES.includes(message.type)) {
        return await handleWorkflowMessage(message);
      } else if (AGENT_BRIDGE_MESSAGE_TYPES.includes(message.type)) {
        return await handleAgentBridgeMessage(message);
      } else {
        console.warn('[Scribe:Background] Unknown message type:', message.type);
        return { error: 'Unknown message type: ' + message.type };
      }
    } catch (error) {
      console.error('[Scribe:Background] Handler error:', error);
      const response = { error: error.message || '操作失败' };
      if (WORKFLOW_MESSAGE_TYPES.includes(message.type)) {
        response.code = error.code || 'WORKFLOW_RUN_ERROR';
      }
      return response;
    }
  })().then(result => {
    debugLog('[Scribe:Background] Sending response:', result);
    sendResponse(result);
  }).catch(error => {
    console.error('[Scribe:Background] Response error:', error);
    const response = { error: error.message || '响应失败' };
    if (WORKFLOW_MESSAGE_TYPES.includes(message.type)) {
      response.code = error.code || 'WORKFLOW_RUN_ERROR';
    }
    sendResponse(response);
  });

  return true; // Keep message channel open
}

async function handleAgentBridgeMessage(message) {
  switch (message.type) {
    case 'AGENT_BRIDGE_GET_STATUS':
      return agentBridgeClient.getStatus();
    case 'AGENT_BRIDGE_RECONNECT':
      return await agentBridgeClient.connect();
    default:
      return { error: 'Unknown agent bridge message type: ' + message.type, code: 'INVALID_PARAMETERS' };
  }
}

async function handleWorkflowMessage(message) {
  switch (message.type) {
    case 'WORKFLOW_START_RUN':
      if (!message.workflow) return { error: 'Missing workflow parameter', code: 'INVALID_PARAMETERS' };
      if (!Number.isInteger(message.tabId) || message.tabId <= 0) return { error: 'Missing or invalid tabId parameter', code: 'INVALID_PARAMETERS' };
      if (message.variables !== undefined && (!message.variables || typeof message.variables !== 'object' || Array.isArray(message.variables))) {
        return { error: 'Invalid variables parameter', code: 'INVALID_PARAMETERS' };
      }
      return await workflowRunManager.start(message.workflow, message.variables || {}, message.tabId);
    case 'WORKFLOW_RESUME_RUN':
      if (typeof message.approved !== 'boolean') return { error: 'Missing approved parameter', code: 'INVALID_PARAMETERS' };
      if (!message.runId || !message.expectedStepId) return { error: 'Missing approval binding', code: 'INVALID_PARAMETERS' };
      return await workflowRunManager.resume({ approved: message.approved, variables: message.variables, runId: message.runId, expectedStepId: message.expectedStepId });
    case 'WORKFLOW_GET_RUN_STATUS':
      await workflowRunManager.ensureHydrated();
      return workflowRunManager.getStatus();
    case 'WORKFLOW_CANCEL_RUN':
      if (typeof message.runId !== 'string' || !message.runId.trim()) {
        return { error: 'Missing or invalid runId parameter', code: 'INVALID_PARAMETERS' };
      }
      return await workflowRunManager.cancel(message.runId);
    default:
      return { error: 'Unknown workflow message type: ' + message.type };
  }
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

    case 'PAUSE_RECORDING':
      return await recordingManager.pauseRecording();

    case 'RESUME_RECORDING':
      return await recordingManager.resumeRecording();

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
    await workflowRunManager.handleTabComplete(tabId, tab);
    await recordingManager.resumeRecordingInTab(tabId, tab);
  };
  chrome.tabs.onUpdated.addListener(chrome.runtime.scribeTabUpdateListener);
}

if (chrome.tabs.onRemoved?.addListener && !chrome.runtime.scribeTabRemovedListener) {
  chrome.runtime.scribeTabRemovedListener = tabId => workflowRunManager.handleTabRemoved(tabId);
  chrome.tabs.onRemoved.addListener(chrome.runtime.scribeTabRemovedListener);
}

// ============================================================================
// SERVICE WORKER LIFECYCLE
// ============================================================================

/**
 * Handles extension install/update events
 */
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    debugLog('[Scribe:Background] SmartPages installed');
    // Could open setup page or show welcome notification
    showNotification(
      'SmartPages',
      '安装成功！点击扩展图标开始录制您的操作流程。'
    );
  } else if (details.reason === 'update') {
    debugLog('[Scribe:Background] SmartPages updated to', chrome.runtime.getManifest().version);
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
  debugLog('[Scribe:Background] Service worker activated');
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
