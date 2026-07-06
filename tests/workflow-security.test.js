const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { loadBrowserScript } = require('./workflow-test-helpers');

const schema = loadBrowserScript('workflow/schema.js', 'SmartPagesWorkflowSchema');
const converter = loadBrowserScript('workflow/converter.js', 'SmartPagesWorkflowConverter', {
  SmartPagesWorkflowSchema: schema,
});

function workflow(steps) {
  return {
    schemaVersion: '1.0', workflowId: 'security-check', workflowVersion: 1,
    allowedOrigins: ['https://example.com'], variables: [], steps,
  };
}

function loadReplayer() {
  const assigned = [];
  const sandbox = {
    console, URL,
    document: { querySelector: () => null, querySelectorAll: () => [], getElementById: () => null },
    location: {
      href: 'https://example.com/start', origin: 'https://example.com', pathname: '/start',
      assign: url => assigned.push(url),
    },
    chrome: { runtime: { onMessage: { addListener() {}, removeListener() {} } } },
    Event: function Event(type) { this.type = type; },
    getComputedStyle: () => ({}), scrollTo() {}, setTimeout: callback => callback(),
    SmartPagesWorkflowSchema: schema,
  };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'content', 'workflow-replayer.js'), 'utf8'), sandbox);
  return { api: sandbox.SmartPagesWorkflowReplayer, sandbox, assigned };
}

function loadBackground(store = {}) {
  const messages = [];
  const sandbox = {
    console: { log() {}, warn() {}, error() {} },
    generateSessionId: () => 'session', crypto: { randomUUID: () => `run-${messages.length}` },
    isRestrictedUrl: () => false, storagePromise: async () => ({}), showNotification() {},
    ExtensionError: class ExtensionError extends Error { constructor(message, code) { super(message); this.code = code; } },
    STORAGE_WARNING_THRESHOLD: 1, SCREENSHOT_QUALITY: 60,
    chrome: {
      runtime: {
        onMessage: { addListener() {} }, onInstalled: { addListener() {} },
        getManifest: () => ({ version: 'test' }), openOptionsPage() {},
        sendMessage: async message => messages.push({ destination: 'runtime', message }),
      },
      tabs: {
        onUpdated: { addListener() {} }, onRemoved: { addListener() {} },
        get: async tabId => ({ id: tabId, url: 'https://example.com/start' }),
        sendMessage: async (tabId, message) => {
          messages.push({ destination: 'tab', tabId, message });
          return { ok: true, code: 'STEP_COMPLETED' };
        },
        captureVisibleTab: async () => 'data:',
      },
      scripting: { executeScript: async () => {} },
      storage: {
        session: {
          get: async keys => Object.fromEntries(keys.filter(key => key in store).map(key => [key, structuredClone(store[key])])),
          set: async values => Object.assign(store, structuredClone(values)),
        },
        local: { getBytesInUse: async () => 0 },
      },
      notifications: { onClicked: { addListener() {} } },
    },
    self: { addEventListener() {}, clients: { claim: async () => {} } },
    setTimeout, clearTimeout, URL, structuredClone,
  };
  sandbox.globalThis = sandbox;
  const schemaSource = fs.readFileSync(path.join(__dirname, '..', 'workflow', 'schema.js'), 'utf8');
  sandbox.importScripts = (...scripts) => {
    if (scripts.includes('../workflow/schema.js')) vm.runInNewContext(schemaSource, sandbox);
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'background', 'background.js'), 'utf8'), sandbox);
  return { Manager: sandbox.WorkflowRunManager, messages, store };
}

(async () => {
  const recordedSecrets = [
    'top-level-secret', 'nested-secret', 'input-secret', 'form-secret', 'selection-secret', 'screenshot-secret',
  ];
  const exported = converter.convertSession({
    pageUrl: 'https://example.com/form',
    steps: [{
      type: 'input', selector: '#password', elementName: 'Password', value: recordedSecrets[0],
      inputValue: recordedSecrets[2], input: { value: recordedSecrets[1] },
      formValue: { value: recordedSecrets[3], nested: { secret: recordedSecrets[1] } },
      selection: { value: recordedSecrets[4] }, screenshot: recordedSecrets[5], secret: recordedSecrets[0],
    }],
  });
  const exportedJson = JSON.stringify(exported);
  for (const secret of recordedSecrets) assert.equal(exportedJson.includes(secret), false);
  assert.equal(exported.workflow.variables[0].secret, true);

  const unknown = workflow([{ id: 'x', action: 'execute-javascript', risk: 'low' }]);
  assert.equal(schema.validateWorkflow(unknown).code, 'UNKNOWN_ACTION');
  for (const origin of ['https://*.example.com', 'file:///tmp/page.html', 'chrome-extension://abc']) {
    assert.equal(schema.validateWorkflow({ ...workflow([{ id: 'w', action: 'wait', risk: 'low' }]), allowedOrigins: [origin] }).code,
      'INVALID_ALLOWED_ORIGINS');
  }

  const replayer = loadReplayer();
  replayer.sandbox.location.href = 'https://evil.example/start';
  replayer.sandbox.location.origin = 'https://evil.example';
  assert.equal((await replayer.api.executeStep({ action: 'navigate', input: { url: 'https://example.com/next' } }, {
    allowedOrigins: ['https://example.com'],
  })).code, 'ORIGIN_NOT_ALLOWED');
  replayer.sandbox.location.href = 'https://example.com/start';
  replayer.sandbox.location.origin = 'https://example.com';
  assert.equal((await replayer.api.executeStep({ action: 'navigate', input: { url: 'https://evil.example/next' } }, {
    allowedOrigins: ['https://example.com'],
  })).code, 'ORIGIN_NOT_ALLOWED');
  assert.equal(replayer.assigned.length, 0);

  const persisted = {};
  const loaded = loadBackground(persisted);
  const manager = new loaded.Manager();
  const secret = 'runtime-only-secret';
  const pending = await manager.start(workflow([
    { id: 'pay', action: 'click', risk: 'high', target: '#pay' },
  ]), { password: secret }, 1);
  assert.equal(pending.status, 'WAITING_CONFIRMATION');
  assert.equal(loaded.messages.filter(item => item.destination === 'tab').length, 0);
  assert.equal(JSON.stringify(pending).includes(secret), false);
  assert.equal(JSON.stringify(pending).includes('password'), false);
  assert.equal(JSON.stringify(persisted).includes(secret), false);
  assert.equal(JSON.stringify(persisted).includes('password'), false);
  await assert.rejects(() => manager.resume({
    approved: true, runId: 'stale-run', expectedStepId: 'pay',
  }), error => error.code === 'STALE_APPROVAL');
  assert.equal(loaded.messages.filter(item => item.destination === 'tab').length, 0);

  console.log('workflow-security tests passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
