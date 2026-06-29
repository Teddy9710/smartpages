const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'sidepanel', 'sidepanel.js'), 'utf8');
const preview = { textContent: '', innerHTML: '' };
const warnings = [];
const sandbox = {
  console: { log: () => {}, error: () => {}, warn: message => warnings.push(message) },
  DocumentApi: class {},
  DocUIHelper: class {},
  debounce: fn => fn,
  chrome: {
    runtime: { onMessage: { addListener: () => {} }, sendMessage: () => Promise.resolve({}) },
    storage: { sync: { get: () => Promise.resolve({}) } },
    tabs: { query: () => Promise.resolve([]) }
  },
  document: {
    addEventListener: () => {},
    getElementById: id => id === 'markdown-preview' ? preview : null,
    querySelector: () => null
  },
  window: { addEventListener: () => {}, innerWidth: 1280, innerHeight: 800 }
};
sandbox.globalThis = sandbox;

vm.runInNewContext(`${source}\nglobalThis.SidePanelManager = SidePanelManager;`, sandbox);
sandbox.SidePanelManager.prototype._renderMarkdown.call({}, '# Fallback content');

assert.equal(preview.textContent, '# Fallback content');
assert.equal(warnings.length, 1);
