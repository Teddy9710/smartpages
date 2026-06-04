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
        get: () => Promise.resolve({ url: 'https://example.com' }),
        captureVisibleTab: () => Promise.resolve('data:image/png;base64,test'),
        sendMessage: () => Promise.reject(new Error('Receiving end does not exist'))
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
  return sandbox.RecordingManager;
}

const RecordingManager = loadRecordingManager();

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
})().catch(error => {
  console.error(error);
  process.exit(1);
});
