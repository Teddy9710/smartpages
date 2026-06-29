const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'upload', 'api-handler.js'), 'utf8');
const sandbox = { console, URL, window: {} };
sandbox.globalThis = sandbox;
vm.runInNewContext(source, sandbox);

const APIHandler = sandbox.window.APIHandler;

function createUploadRequest(values) {
  return {
    formData: async () => ({
      get: key => values[key] ?? null
    }),
    headers: { get: () => null }
  };
}

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

  const invalidTags = await handler.handleUpload(createUploadRequest({
    file: { name: 'guide.txt' },
    filename: 'guide.txt',
    size: '10',
    type: 'text/plain',
    tags: 'not-json'
  }));
  assert.equal(invalidTags.success, false);
  assert.equal(invalidTags.error, 'tags 参数不是有效的 JSON 格式');

  const invalidMetadata = await handler.handleUpload(createUploadRequest({
    file: { name: 'guide.txt' },
    filename: 'guide.txt',
    size: '10',
    type: 'text/plain',
    tags: '[]',
    metadata: '{broken'
  }));
  assert.equal(invalidMetadata.success, false);
  assert.equal(invalidMetadata.error, 'metadata 参数不是有效的 JSON 格式');
})().catch(error => {
  console.error(error);
  process.exit(1);
});
