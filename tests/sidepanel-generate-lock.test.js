const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'sidepanel', 'sidepanel.js'), 'utf8');
const generateButton = { disabled: false };
let loadConfigCalls = 0;
let resolveConfig;
const configPromise = new Promise(resolve => { resolveConfig = resolve; });

const sandbox = {
  console: { log: () => {}, warn: () => {}, error: () => {} },
  DocumentApi: class {},
  DocUIHelper: class {},
  ExtensionError: class ExtensionError extends Error {},
  debounce: fn => fn,
  loadConfig: () => {
    loadConfigCalls += 1;
    return configPromise;
  },
  chrome: {
    runtime: { onMessage: { addListener: () => {} }, sendMessage: () => Promise.resolve({}) },
    storage: { sync: { get: () => Promise.resolve({}) } },
    tabs: { query: () => Promise.resolve([]) }
  },
  document: {
    addEventListener: () => {},
    querySelector: () => null,
    getElementById: id => id === 'btn-generate' ? generateButton : null
  },
  window: { addEventListener: () => {}, innerWidth: 1280, innerHeight: 800 }
};
sandbox.globalThis = sandbox;
vm.runInNewContext(`${source}\nglobalThis.SidePanelManager = SidePanelManager;`, sandbox);

(async () => {
  const manager = Object.create(sandbox.SidePanelManager.prototype);
  manager.isGenerating = false;
  manager._t = key => key;
  manager.showLoadingState = () => {};
  manager.showErrorState = () => {};
  manager._formatUserFacingError = error => error.message;

  const first = manager.generateDocument();
  const second = manager.generateDocument();

  assert.equal(loadConfigCalls, 1);
  assert.equal(manager.isGenerating, true);
  assert.equal(generateButton.disabled, true);

  resolveConfig({ apiKey: '' });
  await Promise.all([first, second]);

  assert.equal(manager.isGenerating, false);
  assert.equal(generateButton.disabled, false);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
