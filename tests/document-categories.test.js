const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

let storage = {
  documents: [
    { id: 'one', name: 'one.txt', content: 'One', category: 'Guides' },
    { id: 'two', name: 'two.txt', content: 'Two' },
    { id: 'three', name: 'three.txt', content: 'Three', category: 'Examples' }
  ]
};

global.chrome = {
  storage: {
    local: {
      async get() { return storage; },
      async set(value) { storage = { ...storage, ...value }; }
    },
    onChanged: { addListener() {} }
  }
};

global.DocumentUploader = require('../utils/documentUpload.js');
const { DocumentApi } = require('../utils/documentApi.js');

(async () => {
  const api = new DocumentApi();
  const list = await api.getDocumentsList();
  assert.deepEqual(list.categories, ['Examples', 'Guides']);
  assert.equal(list.documents.find(doc => doc.id === 'two').category, '');

  const updated = await api.updateDocumentCategory('two', '  Product   notes  ');
  assert.equal(updated.success, true);
  assert.equal(updated.document.category, 'Product notes');
  assert.equal(storage.documents.find(doc => doc.id === 'two').category, 'Product notes');

  const searched = await api.searchDocuments('two');
  assert.deepEqual(searched.categories, ['Examples', 'Guides', 'Product notes']);
  assert.equal(searched.documents[0].category, 'Product notes');

  const cleared = await api.updateDocumentCategory('two', '');
  assert.equal(cleared.document.category, '');
  assert.equal((await api.updateDocumentCategory('missing', 'Guides')).success, false);
  assert.equal((await api.updateDocumentCategory('one', 'x'.repeat(41))).success, false);

  const settingsHtml = fs.readFileSync(path.join(__dirname, '..', 'settings', 'settings.html'), 'utf8');
  const sidepanelHtml = fs.readFileSync(path.join(__dirname, '..', 'sidepanel', 'sidepanel.html'), 'utf8');
  const uiSource = fs.readFileSync(path.join(__dirname, '..', 'utils', 'docUIUtils.js'), 'utf8');
  assert.match(settingsHtml, /id="document-category-filter"/);
  assert.match(sidepanelHtml, /id="sidepanel-document-category-filter"/);
  assert.match(uiSource, /categorizeDocument\(doc\)/);
  assert.match(uiSource, /__uncategorized__/);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
