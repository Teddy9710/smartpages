const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'sidepanel', 'sidepanel.js'), 'utf8');
let sanitizerCalls = 0;

const parsedDocument = {
  body: { innerHTML: '<a href="javascript:alert(1)">Unsafe</a>' },
  querySelectorAll: () => []
};

const sandbox = {
  console,
  DocumentApi: class {},
  DocUIHelper: class {},
  debounce: fn => fn,
  marked: {
    setOptions: () => {},
    parse: value => value
  },
  DOMParser: class {
    parseFromString() {
      return parsedDocument;
    }
  },
  sanitizeHtmlDocument: doc => {
    sanitizerCalls += 1;
    doc.body.innerHTML = '<a>Unsafe</a>';
  },
  chrome: {
    runtime: { onMessage: { addListener: () => {} }, sendMessage: () => Promise.resolve({}) },
    storage: { sync: { get: () => Promise.resolve({}) } },
    tabs: { query: () => Promise.resolve([]) }
  },
  document: { addEventListener: () => {}, getElementById: () => null, querySelector: () => null },
  window: { addEventListener: () => {}, innerWidth: 1280, innerHeight: 800 }
};
sandbox.globalThis = sandbox;

vm.runInNewContext(`${source}\nglobalThis.SidePanelManager = SidePanelManager;`, sandbox);

const result = sandbox.SidePanelManager.prototype._markdownToSafeHtml.call(
  { _escapeHtml: value => value },
  '<a href="javascript:alert(1)">Unsafe</a>'
);

assert.equal(sanitizerCalls, 1);
assert.equal(result, '<a>Unsafe</a>');
