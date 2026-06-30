const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'utils', 'common.js'), 'utf8');
const sandbox = {
  console,
  URL,
  AbortController,
  setTimeout,
  clearTimeout,
  module: { exports: {} }
};
sandbox.globalThis = sandbox;

assert.doesNotThrow(() => vm.runInNewContext(source, sandbox));
assert.equal(typeof sandbox.module.exports.storagePromise, 'function');
assert.equal(typeof sandbox.module.exports.safeSetInnerHTML, 'function');
assert.equal('document' in sandbox, false);
assert.equal('DOMParser' in sandbox, false);
