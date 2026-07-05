const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function workflow(steps = [{ id: 's1', action: 'wait', risk: 'low', input: { ms: 0 } }]) {
  return {
    schemaVersion: '1.0', workflowId: 'wf-1', workflowVersion: 1,
    allowedOrigins: ['https://example.com'], variables: [], steps
  };
}

function loadBackground() {
  const listeners = [];
  const messages = [];
  const injections = [];
  const sandbox = {
    console: { log() {}, warn() {}, error() {} },
    importScripts: () => {},
    generateSessionId: () => 'recording-session',
    crypto: { randomUUID: () => 'run-1' },
    isRestrictedUrl: () => false,
    storagePromise: () => Promise.resolve({}), showNotification: () => {},
    ExtensionError: class ExtensionError extends Error { constructor(message, code) { super(message); this.code = code; } },
    STORAGE_WARNING_THRESHOLD: 1, SCREENSHOT_QUALITY: 60,
    chrome: {
      runtime: {
        onMessage: { addListener: listener => listeners.push(listener) },
        onInstalled: { addListener() {} }, getManifest: () => ({ version: 'test' }), openOptionsPage() {},
        sendMessage: async message => { messages.push({ destination: 'runtime', message }); }
      },
      tabs: {
        onUpdated: { addListener() {} },
        get: async tabId => ({ id: tabId, url: 'https://example.com/page', windowId: 1 }),
        sendMessage: async (tabId, message) => {
          messages.push({ destination: 'tab', tabId, message });
          return { ok: true, code: 'STEP_COMPLETED' };
        },
        captureVisibleTab: async () => 'data:'
      },
      scripting: { executeScript: async details => { injections.push(details); } },
      storage: { local: { getBytesInUse: async () => 0 } },
      notifications: { onClicked: { addListener() {} } }
    },
    self: { addEventListener() {}, clients: { claim: async () => {} } },
    setTimeout, clearTimeout, URL, structuredClone
  };
  sandbox.globalThis = sandbox;
  const schema = fs.readFileSync(path.join(__dirname, '..', 'workflow', 'schema.js'), 'utf8');
  sandbox.importScripts = (...scripts) => {
    if (scripts.includes('../workflow/schema.js')) vm.runInNewContext(schema, sandbox);
  };
  const source = fs.readFileSync(path.join(__dirname, '..', 'background', 'background.js'), 'utf8');
  vm.runInNewContext(source, sandbox);
  return { sandbox, Manager: sandbox.WorkflowRunManager, manager: sandbox.workflowRunManager, listeners, messages, injections };
}

async function route(listener, message) {
  return await new Promise(resolve => listener(message, {}, resolve));
}

(async () => {
  const loaded = loadBackground();
  assert.equal(typeof loaded.Manager, 'function', 'WorkflowRunManager must be exported to globalThis');

  {
    const { Manager, sandbox, messages, injections } = loadBackground();
    const manager = new Manager();
    const status = await manager.start(workflow(), { token: 'top-secret' }, 7);
    assert.equal(status.status, 'COMPLETED');
    const dispatches = messages.filter(item => item.destination === 'tab' && item.message.type === 'WORKFLOW_EXECUTE_STEP');
    assert.equal(dispatches.length, 1);
    assert.deepEqual(JSON.parse(JSON.stringify(injections.map(item => item.files))), [
      ['workflow/schema.js', 'content/workflow-replayer.js']
    ]);
    assert.equal(messages.some(item => item.destination === 'runtime' && item.message.type === 'WORKFLOW_RUN_CHANGED'), true);
    const json = JSON.stringify(manager.getStatus());
    assert.equal(json.includes('top-secret'), false);
    assert.equal(json.includes('token'), false);
    assert.equal(sandbox.workflowRunManager instanceof Manager, true);
  }

  {
    const { Manager, messages } = loadBackground();
    const manager = new Manager();
    const high = workflow([{ id: 'danger', action: 'click', risk: 'high', target: '#pay' }]);
    let status = await manager.start(high, {}, 1);
    assert.equal(status.status, 'WAITING_CONFIRMATION');
    assert.equal(status.currentStepId, 'danger');
    assert.equal(messages.filter(item => item.destination === 'tab').length, 0);
    status = await manager.resume({ approved: true });
    assert.equal(status.status, 'COMPLETED');
    assert.equal(status.currentStepId, null);
    assert.equal(messages.filter(item => item.destination === 'tab').length, 1);
    await assert.rejects(() => manager.resume({ approved: true }), /not waiting/i);
    assert.equal(messages.filter(item => item.destination === 'tab').length, 1);
  }

  {
    const { Manager } = loadBackground();
    const rejected = new Manager();
    await rejected.start(workflow([{ id: 'danger', action: 'click', risk: 'high', target: '#pay' }]), {}, 1);
    assert.equal((await rejected.resume({ approved: false })).status, 'CANCELLED');
    const cancelled = new Manager();
    await cancelled.start(workflow([{ id: 'danger', action: 'click', risk: 'high', target: '#pay' }]), {}, 1);
    assert.equal((await cancelled.cancel()).status, 'CANCELLED');
  }

  {
    const { Manager, sandbox } = loadBackground();
    const manager = new Manager();
    await assert.rejects(() => manager.start({}, {}, 1), /UNSUPPORTED_|INVALID_/);
    sandbox.chrome.tabs.get = async () => null;
    await assert.rejects(() => manager.start(workflow(), {}, 1), /INVALID_TAB/);
    sandbox.chrome.tabs.get = async id => ({ id, url: 'https://evil.example/' });
    await assert.rejects(() => manager.start(workflow(), {}, 1), /ORIGIN_NOT_ALLOWED/);
  }

  {
    const { Manager } = loadBackground();
    const manager = new Manager();
    await manager.start(workflow([{ id: 'danger', action: 'click', risk: 'high', target: '#pay' }]), {}, 1);
    await assert.rejects(() => manager.start(workflow(), {}, 1), /RUN_IN_PROGRESS/);
  }

  {
    const { Manager, sandbox } = loadBackground();
    let releaseTab;
    const tabGate = new Promise(resolve => { releaseTab = resolve; });
    sandbox.chrome.tabs.get = async id => {
      await tabGate;
      return { id, url: 'https://example.com/page' };
    };
    const manager = new Manager();
    const first = manager.start(workflow(), {}, 1);
    await new Promise(resolve => setImmediate(resolve));
    const second = assert.rejects(() => manager.start(workflow(), {}, 1), /RUN_IN_PROGRESS/);
    releaseTab();
    await second;
    await first;
  }

  {
    const { Manager, sandbox } = loadBackground();
    sandbox.chrome.tabs.sendMessage = async () => ({ ok: false, code: 'TARGET_NOT_FOUND', message: 'no node' });
    const manager = new Manager();
    assert.equal((await manager.start(workflow(), {}, 1)).status, 'FAILED');
    assert.equal(manager.getStatus().logs.at(-1).result, 'TARGET_NOT_FOUND');
  }

  {
    const { Manager, sandbox, messages } = loadBackground();
    sandbox.chrome.tabs.sendMessage = async (tabId, message) => {
      messages.push({ destination: 'tab', tabId, message });
      if (!message.variables.name) return { ok: false, code: 'MISSING_VARIABLE' };
      return { ok: true, code: 'STEP_COMPLETED' };
    };
    const manager = new Manager();
    const input = workflow([{ id: 'input', action: 'input', risk: 'low', target: '#name', input: { value: { variable: 'name' } } }]);
    assert.equal((await manager.start(input, {}, 1)).status, 'WAITING_INPUT');
    assert.equal((await manager.resume({ approved: true, variables: { name: 'Ada' } })).status, 'COMPLETED');
    assert.equal(JSON.stringify(manager.getStatus()).includes('Ada'), false);
  }

  {
    const { Manager, sandbox, messages } = loadBackground();
    let resolveStep;
    sandbox.chrome.tabs.sendMessage = async (tabId, message) => {
      messages.push({ destination: 'tab', tabId, message });
      return await new Promise(resolve => { resolveStep = resolve; });
    };
    const manager = new Manager();
    const starting = manager.start(workflow(), {}, 1);
    await new Promise(resolve => setImmediate(resolve));
    await manager.cancel();
    resolveStep({ ok: true, code: 'STEP_COMPLETED' });
    await starting;
    assert.equal(manager.getStatus().status, 'CANCELLED');
    assert.equal(manager.getStatus().nextStepIndex, 0);
  }

  {
    const { Manager, sandbox } = loadBackground();
    let calls = 0;
    sandbox.chrome.tabs.sendMessage = async () => {
      calls += 1;
      return calls === 1
        ? { ok: true, code: 'NAVIGATION_STARTED', postconditionPending: true }
        : { ok: true, code: 'STEP_COMPLETED' };
    };
    const manager = new Manager();
    const status = await manager.start(workflow([{ id: 'nav', action: 'navigate', risk: 'low', input: { url: 'https://example.com/next' }, postcondition: { type: 'url', value: 'https://example.com/next' } }]), {}, 1);
    assert.equal(status.status, 'RUNNING');
    assert.equal(status.nextStepIndex, 0);
    await manager.handleTabComplete(1, { url: 'https://example.com/next' });
    assert.equal(manager.getStatus().status, 'COMPLETED');
    assert.equal(calls, 1);
  }

  {
    const { Manager, sandbox, injections } = loadBackground();
    let calls = 0;
    sandbox.chrome.tabs.sendMessage = async () => {
      calls += 1;
      return { ok: true, code: 'NAVIGATION_STARTED', postconditionPending: true };
    };
    const manager = new Manager();
    await manager.start(workflow([{ id: 'nav-fail', action: 'navigate', risk: 'low', input: { url: 'https://example.com/next' }, postcondition: { type: 'url', value: 'https://example.com/next' } }]), {}, 1);
    const injectionsBeforeReload = injections.length;
    await manager.handleTabComplete(1, { url: 'https://example.com/wrong' });
    const status = manager.getStatus();
    assert.equal(status.status, 'FAILED');
    assert.equal(status.logs.at(-1).result, 'POSTCONDITION_FAILED');
    assert.equal(status.currentStepId, null);
    assert.equal(injections.length, injectionsBeforeReload + 1);
    assert.equal(calls, 1);
  }

  {
    const { listeners } = loadBackground();
    const listener = listeners[0];
    assert.equal((await route(listener, { type: 'WORKFLOW_START_RUN', workflow: workflow(), variables: {}, tabId: 2 })).status, 'COMPLETED');
    assert.equal((await route(listener, { type: 'WORKFLOW_GET_RUN_STATUS' })).status, 'COMPLETED');
    assert.equal((await route(listener, { type: 'WORKFLOW_CANCEL_RUN' })).status, 'CANCELLED');
    const missing = await route(listener, { type: 'WORKFLOW_START_RUN' });
    assert.match(missing.error, /Missing workflow/);
    assert.equal(missing.code, 'INVALID_PARAMETERS');
  }

  {
    const { listeners } = loadBackground();
    const listener = listeners[0];
    const high = workflow([{ id: 'route-danger', action: 'click', risk: 'high', target: '#pay' }]);
    await route(listener, { type: 'WORKFLOW_START_RUN', workflow: high, variables: {}, tabId: 2 });
    const concurrent = await route(listener, { type: 'WORKFLOW_START_RUN', workflow: workflow(), variables: {}, tabId: 2 });
    assert.equal(concurrent.code, 'RUN_IN_PROGRESS');
    assert.match(concurrent.error, /RUN_IN_PROGRESS/);
  }

  {
    const { listeners, sandbox } = loadBackground();
    sandbox.chrome.tabs.get = async () => null;
    const response = await route(listeners[0], { type: 'START_RECORDING', tabId: 4 });
    assert.deepEqual(Object.keys(response), ['error']);
    assert.equal(typeof response.error, 'string');
  }
})().catch(error => { console.error(error); process.exit(1); });
