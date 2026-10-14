const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

global.DocumentUploader = class {
  isSupportedFormat() { return true; }
  async getStoredDocuments() {
    return [{
      id: 'doc-1',
      name: 'guide.pdf',
      size: 128,
      type: 'application/pdf',
      content: '--- 第 1 页 ---\nA compact preview of the uploaded document.',
      uploadTime: '2026-10-14T00:00:00.000Z'
    }];
  }
};

const { DocumentApi } = require('../utils/documentApi.js');

(async () => {
  const api = new DocumentApi();
  const result = await api.getDocumentsList();
  assert.equal(result.success, true);
  assert.equal(result.documents[0].contentPreview, 'A compact preview of the uploaded document.');
  assert.equal(Object.hasOwn(result.documents[0], 'content'), false);

  const longPreview = api._createContentPreview('x'.repeat(220));
  assert.equal(longPreview.length, 181);
  assert.equal(longPreview.endsWith('…'), true);

  const uiSource = fs.readFileSync(path.join(__dirname, '..', 'utils', 'docUIUtils.js'), 'utf8');
  assert.match(uiSource, /className: 'doc-thumbnail'/);
  assert.match(uiSource, /doc\.contentPreview/);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
