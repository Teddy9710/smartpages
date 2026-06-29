const assert = require('node:assert/strict');
const path = require('node:path');

const listeners = [];
global.chrome = {
  storage: {
    onChanged: {
      addListener(listener) {
        listeners.push(listener);
      }
    }
  }
};

const modulePath = path.join(__dirname, '..', 'utils', 'documentUpload.js');
delete require.cache[require.resolve(modulePath)];
const DocumentUploader = require(modulePath);

const first = new DocumentUploader();
const second = new DocumentUploader();
first._docsCache = [{ id: 'old' }];
second._docsCache = [{ id: 'old' }];
first._docIndex.set('old', 0);
second._docIndex.set('old', 0);

for (const listener of listeners) {
  listener({ otherKey: { newValue: [] } }, 'local');
}
assert.notEqual(first._docsCache, null);

for (const listener of listeners) {
  listener({ documents: { oldValue: [{ id: 'old' }], newValue: [] } }, 'sync');
}
assert.notEqual(first._docsCache, null);

for (const listener of listeners) {
  listener({ documents: { oldValue: [{ id: 'old' }], newValue: [] } }, 'local');
}

assert.equal(first._docsCache, null);
assert.equal(second._docsCache, null);
assert.equal(first._docIndex.size, 0);
assert.equal(second._docIndex.size, 0);
