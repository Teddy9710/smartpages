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

function loadBackground(sharedStore = {}) {
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
        onRemoved: { addListener(listener) { sandbox.tabRemovedListener = listener; } },
        get: async tabId => ({ id: tabId, url: 'https://example.com/page', windowId: 1 }),
        sendMessage: async (tabId, message) => {
          messages.push({ destination: 'tab', tabId, message });
          return { ok: true, code: 'STEP_COMPLETED' };
        },
        captureVisibleTab: async () => 'data:'
      },
      scripting: { executeScript: async details => { injections.push(details); } },
      storage: {
        session: {
          get: async keys => Object.fromEntries(keys.filter(key => key in sharedStore).map(key => [key, structuredClone(sharedStore[key])])),
          set: async values => Object.assign(sharedStore, structuredClone(values))
        },
        local: { getBytesInUse: async () => 0 }
      },
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
    status = await manager.resume({ approved: true, runId: status.runId, expectedStepId: 'danger' });
    assert.equal(status.status, 'COMPLETED');
    assert.equal(status.currentStepId, null);
    assert.equal(messages.filter(item => item.destination === 'tab').length, 1);
    await assert.rejects(() => manager.resume({ approved: true, runId: status.runId, expectedStepId: 'danger' }), /not waiting/i);
    assert.equal(messages.filter(item => item.destination === 'tab').length, 1);
  }

  {
    const { Manager } = loadBackground();
    const rejected = new Manager();
    const pending = await rejected.start(workflow([{ id: 'danger', action: 'click', risk: 'high', target: '#pay' }]), {}, 1);
    assert.equal((await rejected.resume({ approved: false, runId: pending.runId, expectedStepId: 'danger' })).status, 'CANCELLED');
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
    const waiting = manager.getStatus();
    assert.equal((await manager.resume({ approved: true, variables: { name: 'Ada' }, runId: waiting.runId, expectedStepId: 'input' })).status, 'COMPLETED');
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

  // Concurrent completion events atomically claim one pending navigation.
  {
    const { Manager, sandbox, messages } = loadBackground();
    sandbox.chrome.tabs.sendMessage = async (tabId, message) => {
      messages.push({ destination: 'tab', tabId, message });
      return { ok: true, code: 'NAVIGATION_STARTED', postconditionPending: true };
    };
    const manager = new Manager();
    await manager.start(workflow([{ id: 'nav-race', action: 'navigate', risk: 'low', input: { url: 'https://example.com/next' }, postcondition: { type: 'url', value: 'https://example.com/next' } }]), {}, 1);
    let releaseInjection;
    sandbox.chrome.scripting.executeScript = async () => await new Promise(resolve => { releaseInjection = resolve; });
    const first = manager.handleTabComplete(1, { url: 'https://example.com/next' });
    const second = manager.handleTabComplete(1, { url: 'https://example.com/next' });
    await new Promise(resolve => setImmediate(resolve));
    releaseInjection();
    await Promise.all([first, second]);
    assert.equal(manager.getStatus().status, 'COMPLETED');
    assert.equal(manager.getStatus().nextStepIndex, 1);
    assert.equal(manager.getStatus().logs.filter(log => log.result === 'STEP_COMPLETED').length, 1);
  }

  // Cancelling while RUNNING but before dispatch prevents the step message.
  {
    const { Manager, sandbox, messages } = loadBackground();
    let notifications = 0;
    let releaseNotify;
    sandbox.chrome.runtime.sendMessage = async () => {
      notifications += 1;
      if (notifications === 2) await new Promise(resolve => { releaseNotify = resolve; });
    };
    const manager = new Manager();
    const starting = manager.start(workflow(), {}, 1);
    while (!releaseNotify) await new Promise(resolve => setImmediate(resolve));
    await manager.cancel();
    releaseNotify();
    await starting;
    assert.equal(manager.getStatus().status, 'CANCELLED');
    assert.equal(messages.filter(item => item.destination === 'tab' && item.message.type === 'WORKFLOW_EXECUTE_STEP').length, 0);
  }

  // Session checkpoints survive service-worker restart without secret values.
  {
    const store = {};
    const first = loadBackground(store);
    const pending = await first.manager.start(workflow([{ id: 'confirm', action: 'click', risk: 'high', target: '#save' }]), { password: 'never-store-me' }, 1);
    assert.equal(JSON.stringify(store).includes('never-store-me'), false);
    assert.equal(JSON.stringify(store).includes('password'), false);
    const second = loadBackground(store);
    await second.manager.ensureHydrated();
    assert.equal(second.manager.getStatus().status, 'WAITING_CONFIRMATION');
    assert.equal(second.manager.getStatus().currentStepId, 'confirm');
    assert.equal((await second.manager.resume({ approved: true, runId: pending.runId, expectedStepId: 'confirm' })).status, 'COMPLETED');
  }

  // An in-flight checkpoint is failed on restart instead of redispatched.
  {
    const store = {};
    const first = loadBackground(store);
    let releaseNotify;
    let notifications = 0;
    first.sandbox.chrome.runtime.sendMessage = async () => {
      notifications += 1;
      if (notifications === 2) await new Promise(resolve => { releaseNotify = resolve; });
    };
    first.manager.start(workflow(), { secret: 'hidden' }, 1);
    while (!releaseNotify) await new Promise(resolve => setImmediate(resolve));
    const restarted = loadBackground(store);
    await restarted.manager.ensureHydrated();
    assert.equal(restarted.manager.getStatus().status, 'FAILED');
    assert.equal(restarted.manager.getStatus().logs.at(-1).result, 'RUN_INTERRUPTED');
    assert.equal(restarted.messages.filter(item => item.destination === 'tab').length, 0);
    releaseNotify();
  }

  // Approval tokens are bound to both run and step.
  {
    const { Manager } = loadBackground();
    const manager = new Manager();
    const runA = await manager.start(workflow([{ id: 'a', action: 'click', risk: 'high', target: '#a' }]), {}, 1);
    await manager.cancel();
    const runB = await manager.start(workflow([{ id: 'b', action: 'click', risk: 'high', target: '#b' }]), {}, 1);
    await assert.rejects(() => manager.resume({ approved: true, runId: runA.runId, expectedStepId: 'a' }), /STALE_APPROVAL/);
    assert.equal(manager.getStatus().runId, runB.runId);
    assert.equal(manager.getStatus().status, 'WAITING_CONFIRMATION');
  }

  {
    const { Manager, sandbox } = loadBackground();
    const manager = new Manager();
    sandbox.chrome.tabs.sendMessage = async () => ({ ok: true, code: 'NAVIGATION_STARTED', postconditionPending: true });
    await manager.start(workflow([{ id: 'nav-inject', action: 'navigate', risk: 'low', input: { url: 'https://example.com/next' }, postcondition: { type: 'url', value: 'https://example.com/next' } }]), {}, 1);
    sandbox.chrome.scripting.executeScript = async () => { throw new Error('blocked'); };
    await manager.handleTabComplete(1, { url: 'https://example.com/next' });
    assert.equal(manager.getStatus().status, 'FAILED');
    assert.equal(manager.getStatus().logs.at(-1).result, 'REPLAYER_INJECTION_FAILED');
  }

  // A late injection rejection cannot overwrite a cancellation.
  {
    const { Manager, sandbox } = loadBackground();
    sandbox.chrome.tabs.sendMessage = async () => ({ ok: true, code: 'NAVIGATION_STARTED', postconditionPending: true });
    const manager = new Manager();
    await manager.start(workflow([{ id: 'nav-cancel', action: 'navigate', risk: 'low', input: { url: 'https://example.com/next' }, postcondition: { type: 'url', value: 'https://example.com/next' } }]), {}, 1);
    let rejectInjection;
    sandbox.chrome.scripting.executeScript = async () => await new Promise((_resolve, reject) => { rejectInjection = reject; });
    const completing = manager.handleTabComplete(1, { url: 'https://example.com/next' });
    while (!rejectInjection) await new Promise(resolve => setImmediate(resolve));
    await manager.cancel();
    rejectInjection(new Error('late blocked'));
    await completing;
    assert.equal(manager.getStatus().status, 'CANCELLED');
    assert.equal(manager.getStatus().logs.some(log => log.result === 'REPLAYER_INJECTION_FAILED'), false);
  }

  {
    const loaded = loadBackground();
    await loaded.manager.start(workflow([{ id: 'close', action: 'click', risk: 'high', target: '#x' }]), {}, 9);
    await loaded.sandbox.tabRemovedListener(9);
    assert.equal(loaded.manager.getStatus().status, 'FAILED');
    assert.equal(loaded.manager.getStatus().logs.at(-1).result, 'TAB_CLOSED');
  }

  {
    const { Manager } = loadBackground();
    const manager = new Manager();
    await manager.start(workflow(), {}, 1);
    const logs = manager.getStatus().logs.length;
    await assert.rejects(() => manager.cancel(), /INVALID_RUN_STATE/);
    assert.equal(manager.getStatus().status, 'COMPLETED');
    assert.equal(manager.getStatus().logs.length, logs);
  }

  {
    const { listeners } = loadBackground();
    const listener = listeners[0];
    assert.equal((await route(listener, { type: 'WORKFLOW_START_RUN', workflow: workflow(), variables: {}, tabId: 2 })).status, 'COMPLETED');
    assert.equal((await route(listener, { type: 'WORKFLOW_GET_RUN_STATUS' })).status, 'COMPLETED');
    assert.equal((await route(listener, { type: 'WORKFLOW_CANCEL_RUN' })).code, 'INVALID_RUN_STATE');
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
    const unbound = await route(listener, { type: 'WORKFLOW_RESUME_RUN', approved: true });
    assert.equal(unbound.code, 'INVALID_PARAMETERS');
  }

  {
    const { listeners, sandbox } = loadBackground();
    sandbox.chrome.tabs.get = async () => null;
    const response = await route(listeners[0], { type: 'START_RECORDING', tabId: 4 });
    assert.deepEqual(Object.keys(response), ['error']);
    assert.equal(typeof response.error, 'string');
  }
})().catch(error => { console.error(error); process.exit(1); });
