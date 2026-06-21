const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.id = '';
    this.className = '';
    this.textContent = '';
    this.style = {};
    this.attributes = {};
  }

  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  prepend(child) {
    child.parentNode = this;
    this.children.unshift(child);
    return child;
  }

  remove() {
    if (!this.parentNode) return;
    this.parentNode.children = this.parentNode.children.filter(child => child !== this);
    this.parentNode = null;
  }

  setAttribute(name, value) {
    this.attributes[name] = value;
    if (name === 'id') this.id = value;
  }

  getAttribute(name) {
    return this.attributes[name];
  }
}

function createFakeDocument() {
  const document = {
    readyState: 'complete',
    head: new FakeElement('head'),
    body: new FakeElement('body'),
    documentElement: new FakeElement('html'),
    listeners: [],
    createElement: tagName => new FakeElement(tagName),
    createTextNode: text => ({ textContent: text, parentNode: null }),
    addEventListener(type, handler, options) {
      document.listeners.push({ type, handler, options });
    },
    removeEventListener(type, handler) {
      document.listeners = document.listeners.filter(listener => listener.type !== type || listener.handler !== handler);
    },
    getElementById(id) {
      const search = (node) => {
        if (node.id === id) return node;
        for (const child of node.children || []) {
          const found = search(child);
          if (found) return found;
        }
        return null;
      };
      return search(document.head) || search(document.body) || search(document.documentElement);
    },
    querySelectorAll: () => []
  };
  document.documentElement.appendChild(document.head);
  document.documentElement.appendChild(document.body);
  return document;
}

function loadRecorder() {
  const source = fs.readFileSync(path.join(__dirname, '..', 'content', 'recorder.js'), 'utf8');
  const document = createFakeDocument();
  let messageListener = null;
  const sandbox = {
    console: { log: () => {}, warn: () => {}, error: () => {} },
    document,
    location: { href: 'https://example.com/' },
    history: {
      pushState: () => {},
      replaceState: () => {}
    },
    setTimeout,
    clearTimeout,
    URL,
    HTMLElement: FakeElement,
    Node: FakeElement,
    window: {
      scrollX: 0,
      scrollY: 0,
      innerWidth: 1280,
      innerHeight: 720,
      getComputedStyle: () => ({}),
      addEventListener: () => {},
      removeEventListener: () => {}
    },
    chrome: {
      runtime: {
        id: 'test-extension',
        onMessage: {
          addListener(listener) {
            messageListener = listener;
          },
          removeListener() {}
        },
        sendMessage: () => Promise.resolve({ success: true })
      }
    }
  };
  sandbox.window.document = document;
  sandbox.window.location = sandbox.location;
  sandbox.window.history = sandbox.history;
  sandbox.window.chrome = sandbox.chrome;
  sandbox.globalThis = sandbox;
  vm.runInNewContext(source, sandbox);
  return { document, messageListener };
}

const { document, messageListener } = loadRecorder();
assert.equal(typeof messageListener, 'function');

messageListener({ type: 'START_LISTENING' }, {}, () => {});
const indicator = document.getElementById('scribe-recording-indicator');
assert.ok(indicator, 'recording indicator should appear when recording starts');
assert.match(indicator.textContent, /SmartPages/);

messageListener({ type: 'HIDE_RECORDING_INDICATOR' }, {}, () => {});
assert.equal(document.getElementById('scribe-recording-indicator'), null);

messageListener({ type: 'RESTORE_RECORDING_INDICATOR' }, {}, () => {});
assert.ok(document.getElementById('scribe-recording-indicator'), 'recording indicator should be restored while listening');

messageListener({ type: 'STOP_LISTENING' }, {}, () => {});
assert.equal(document.getElementById('scribe-recording-indicator'), null);
