const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadRecordingManager() {
  const source = fs.readFileSync(path.join(__dirname, '..', 'background', 'background.js'), 'utf8');
  const sandbox = {
    console,
    importScripts: () => {},
    generateSessionId: () => 'session-test',
    isRestrictedUrl: () => false,
    storagePromise: () => Promise.resolve({}),
    showNotification: () => {},
    ExtensionError: class ExtensionError extends Error {
      constructor(message, code = 'UNKNOWN_ERROR') {
        super(message);
        this.code = code;
      }
    },
    STORAGE_WARNING_THRESHOLD: 8 * 1024 * 1024,
    SCREENSHOT_QUALITY: 60,
    chrome: {
      runtime: {
        scribeMessageListener: null,
        onMessage: { addListener: () => {} },
        onInstalled: { addListener: () => {} },
        getManifest: () => ({ version: 'test' }),
        openOptionsPage: () => {}
      },
      tabs: {
        onUpdated: { addListener: () => {} },
        get: () => Promise.resolve({ url: 'https://example.com', windowId: 42 }),
        captureVisibleTab: () => Promise.resolve('data:image/png;base64,test'),
        sendMessage: () => Promise.reject(new Error('Receiving end does not exist'))
      },
      scripting: {
        executeScript: () => Promise.resolve()
      },
      storage: {
        local: {
          getBytesInUse: () => Promise.resolve(0)
        }
      },
      notifications: {
        onClicked: { addListener: () => {} }
      }
    },
    self: {
      addEventListener: () => {},
      clients: {
        claim: () => Promise.resolve()
      }
    }
  };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(`${source}\nglobalThis.RecordingManager = RecordingManager;`, sandbox);
  return { RecordingManager: sandbox.RecordingManager, sandbox };
}

const { RecordingManager, sandbox } = loadRecordingManager();

(async () => {
  assert.equal(RecordingManager.getScreenshotThrottleDelay(1000, 0, 600), 0);
  assert.equal(RecordingManager.getScreenshotThrottleDelay(1200, 1000, 600), 400);
  assert.equal(RecordingManager.getScreenshotThrottleDelay(1600, 1000, 600), 0);

  const manager = new RecordingManager();
  manager.state = 'recording';
  manager.currentSession = { sessionId: 's1', steps: [] };
  manager._injectContentScript = async () => {};

  await assert.rejects(
    () => manager._startContentScriptListening(1, { resetOnFailure: false }),
    /Receiving end does not exist/
  );
  assert.equal(manager.state, 'recording');
  assert.deepEqual(manager.currentSession, { sessionId: 's1', steps: [] });

  const existingReceiverManager = new RecordingManager();
  const existingReceiverEvents = [];
  existingReceiverManager._injectContentScript = async tabId => {
    existingReceiverEvents.push({ kind: 'inject', tabId });
  };
  sandbox.chrome.tabs.sendMessage = async (tabId, message) => {
    existingReceiverEvents.push({ kind: 'message', tabId, type: message.type });
    return { success: true };
  };

  await existingReceiverManager._startContentScriptListening(11);

  assert.deepEqual(JSON.parse(JSON.stringify(existingReceiverEvents)), [
    { kind: 'message', tabId: 11, type: 'START_LISTENING' }
  ]);

  const recoveryManager = new RecordingManager();
  const recoveryEvents = [];
  let recoveryMessageAttempt = 0;
  recoveryManager._injectContentScript = async tabId => {
    recoveryEvents.push({ kind: 'inject', tabId });
  };
  sandbox.chrome.tabs.sendMessage = async () => {
    recoveryMessageAttempt += 1;
    recoveryEvents.push({ kind: 'message', attempt: recoveryMessageAttempt });
    if (recoveryMessageAttempt === 1) {
      throw new Error('Could not establish connection. Receiving end does not exist.');
    }
    return { success: true };
  };

  await recoveryManager._startContentScriptListening(12);

  assert.deepEqual(JSON.parse(JSON.stringify(recoveryEvents)), [
    { kind: 'message', attempt: 1 },
    { kind: 'inject', tabId: 12 },
    { kind: 'message', attempt: 2 }
  ]);

  const nonConnectionManager = new RecordingManager();
  let nonConnectionInjectionCount = 0;
  nonConnectionManager.state = 'recording';
  nonConnectionManager.currentSession = { sessionId: 'permission-error', steps: [] };
  nonConnectionManager._injectContentScript = async () => {
    nonConnectionInjectionCount += 1;
  };
  sandbox.chrome.tabs.sendMessage = async () => {
    throw new Error('Permission denied');
  };

  await assert.rejects(
    () => nonConnectionManager._startContentScriptListening(13),
    /Permission denied/
  );
  assert.equal(nonConnectionInjectionCount, 0);
  assert.equal(nonConnectionManager.state, 'idle');
  assert.equal(nonConnectionManager.currentSession, null);

  const pauseManager = new RecordingManager();
  const listeningMessages = [];
  pauseManager.state = 'recording';
  pauseManager.tabId = 7;
  pauseManager.currentSession = { sessionId: 'pause-session', steps: [] };
  pauseManager._persistState = async () => {};
  pauseManager._notifyStateChanged = () => {};
  pauseManager._enqueueScreenshotCapture = async () => {};
  pauseManager._startContentScriptListening = async (tabId) => {
    listeningMessages.push({ tabId, type: 'START_LISTENING' });
  };
  pauseManager._stopContentScriptListening = async () => {
    listeningMessages.push({ tabId: pauseManager.tabId, type: 'STOP_LISTENING' });
  };

  const pauseResponse = await pauseManager.pauseRecording();
  assert.equal(pauseResponse.success, true);
  assert.equal(pauseManager.state, 'paused');
  assert.deepEqual(listeningMessages, [{ tabId: 7, type: 'STOP_LISTENING' }]);

  const originalWarn = console.warn;
  try {
    console.warn = () => {};
    await pauseManager.addStep({ type: 'click', timestamp: 1 });
  } finally {
    console.warn = originalWarn;
  }
  assert.equal(pauseManager.currentSession.steps.length, 0);

  const resumeResponse = await pauseManager.resumeRecording();
  assert.equal(resumeResponse.success, true);
  assert.equal(pauseManager.state, 'recording');
  assert.deepEqual(listeningMessages, [
    { tabId: 7, type: 'STOP_LISTENING' },
    { tabId: 7, type: 'START_LISTENING' }
  ]);

  await pauseManager.addStep({ type: 'click', timestamp: 2 });
  assert.equal(pauseManager.currentSession.steps.length, 1);

  const screenshotManager = new RecordingManager();
  const screenshotEvents = [];
  screenshotManager.state = 'recording';
  screenshotManager.tabId = 9;
  screenshotManager.currentSession = { sessionId: 'screenshot-session', steps: [{ type: 'click' }] };
  screenshotManager._persistState = async () => {};
  screenshotManager._compressScreenshot = async dataUrl => dataUrl;
  sandbox.chrome.storage.local.getBytesInUse = () => Promise.resolve(0);
  sandbox.chrome.tabs.sendMessage = async (tabId, message) => {
    screenshotEvents.push({ tabId, type: message.type });
    return { success: true };
  };
  sandbox.chrome.tabs.captureVisibleTab = async (windowId, options) => {
    screenshotEvents.push({ type: 'CAPTURE_VISIBLE_TAB', windowId, options });
    return 'data:image/png;base64,screenshot';
  };

  await screenshotManager._captureScreenshotForStep(0);
  assert.deepEqual(JSON.parse(JSON.stringify(screenshotEvents)), [
    { tabId: 9, type: 'HIDE_RECORDING_INDICATOR' },
    { type: 'CAPTURE_VISIBLE_TAB', windowId: 42, options: { format: 'png' } },
    { tabId: 9, type: 'RESTORE_RECORDING_INDICATOR' }
  ]);
  assert.equal(screenshotManager.currentSession.steps[0].screenshot, 'data:image/png;base64,screenshot');

  const edgeBlockedManager = new RecordingManager();
  const injectionTargets = [];
  edgeBlockedManager.state = 'idle';
  edgeBlockedManager.currentSession = null;
  edgeBlockedManager._persistState = async () => {};
  edgeBlockedManager._notifyStateChanged = () => {};
  edgeBlockedManager._hydrate = true;

  sandbox.chrome.scripting.executeScript = async (details) => {
    injectionTargets.push(details.target);
    return [];
  };
  sandbox.chrome.tabs.sendMessage = async () => ({ success: true });

  const originalWarnForBlockedInjection = console.warn;
  try {
    console.warn = () => {};
  await edgeBlockedManager._injectContentScript(9);
  } finally {
    console.warn = originalWarnForBlockedInjection;
  }
  assert.deepEqual(JSON.parse(JSON.stringify(injectionTargets)), [
    { tabId: 9 }
  ]);

  const fullyBlockedManager = new RecordingManager();
  sandbox.chrome.scripting.executeScript = async () => {
    throw new Error('Blocked');
  };
  const originalWarnForFullyBlockedInjection = console.warn;
  try {
    console.warn = () => {};
    await assert.rejects(
      () => fullyBlockedManager._injectContentScript(10),
      error => error.code === 'CONTENT_SCRIPT_ERROR' && !String(error.message).includes('Blocked')
    );
  } finally {
    console.warn = originalWarnForFullyBlockedInjection;
  }
})().catch(error => {
  console.error(error);
  process.exit(1);
});
