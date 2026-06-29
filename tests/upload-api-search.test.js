const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'upload', 'api-handler.js'), 'utf8');
const sandbox = { console, URL, window: {} };
sandbox.globalThis = sandbox;
vm.runInNewContext(source, sandbox);

const APIHandler = sandbox.window.APIHandler;

(async () => {
  const handler = new APIHandler();
  handler.documents.set('legacy', {
    id: 'legacy',
    filename: 'legacy-guide.pdf',
    uploadTime: '2026-01-01T00:00:00.000Z'
  });
  handler.documents.set('tagged', {
    id: 'tagged',
    filename: 'notes.txt',
    description: null,
    tags: [null, 'Reference'],
    uploadTime: '2026-01-02T00:00:00.000Z'
  });

  const filenameMatches = await handler.searchDocuments('legacy');
  assert.deepEqual(Array.from(filenameMatches, doc => doc.id), ['legacy']);

  const tagMatches = await handler.searchDocuments('reference');
  assert.deepEqual(Array.from(tagMatches, doc => doc.id), ['tagged']);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
