const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'content', 'recorder.js'), 'utf8');
const start = source.indexOf('  function escapeSelectorPart');
const end = source.indexOf('  // ELEMENT DATA EXTRACTION');
assert.ok(start >= 0 && end > start, 'selector helpers should be present');

const selectors = [];
const document = {
  body: {},
  querySelectorAll(selector) {
    selectors.push(selector);
    return selector === '#duplicate' ? [{}, {}] : [{}];
  }
};
const sandbox = { document, window: { CSS: null }, SELECTOR_MAX_DEPTH: 5 };
sandbox.globalThis = sandbox;
vm.runInNewContext(
  `${source.slice(start, end)}\n` +
  'globalThis.selectorApi = { generateSelector, buildSelectorPath, escapeSelectorPart };',
  sandbox
);

const element = (overrides = {}) => ({
  id: '',
  dataset: {},
  className: '',
  tagName: 'DIV',
  parentElement: null,
  ...overrides
});

assert.equal(sandbox.selectorApi.generateSelector(element({ id: 'section:one' })), '#section\\:one');
assert.equal(
  sandbox.selectorApi.generateSelector(element({ dataset: { testId: 'save "draft"' } })),
  String.raw`[data-test-id="save\ \"draft\""]`
);
assert.equal(
  sandbox.selectorApi.generateSelector(element({ className: 'primary:button' })),
  'div.primary\\:button'
);

const parent = element({ id: 'duplicate', className: 'layout:grid' });
const child = element({ tagName: 'BUTTON', className: 'action.item', parentElement: parent });
parent.children = [child];
assert.equal(
  sandbox.selectorApi.buildSelectorPath(child),
  'div.layout\\:grid > button.action\\.item:nth-child(1)'
);
assert.ok(selectors.includes('#duplicate'), 'duplicate ids should be checked before use');
