const assert = require('node:assert/strict');

const { LocalDirectoryDocumentStore } = require('../utils/cloudDocumentApi.js');

class FakeFileHandle {
  constructor(name) {
    this.kind = 'file';
    this.name = name;
    this.content = '';
    this.lastModified = 0;
  }

  async createWritable() {
    return {
      write: async value => { this.content = String(value); },
      close: async () => { this.lastModified += 1; }
    };
  }

  async getFile() {
    const content = this.content;
    return {
      size: content.length,
      lastModified: this.lastModified,
      text: async () => content
    };
  }
}

class FakeDirectoryHandle {
  constructor() {
    this.name = 'SmartPages';
    this.files = new Map();
  }

  async queryPermission() { return 'granted'; }

  async getFileHandle(name, options = {}) {
    if (!this.files.has(name) && options.create) this.files.set(name, new FakeFileHandle(name));
    if (!this.files.has(name)) throw new Error('File not found');
    return this.files.get(name);
  }

  async removeEntry(name) { this.files.delete(name); }

  async *entries() {
    for (const entry of this.files.entries()) yield entry;
  }
}

(async () => {
  const directory = new FakeDirectoryHandle();
  const store = new LocalDirectoryDocumentStore({
    globalScope: { crypto: { randomUUID: () => 'unused' } },
    indexedDB: {},
    randomUUID: () => '11111111-1111-4111-8111-111111111111'
  });
  store.directoryHandle = directory;

  const saved = await store.saveDocument({ title: 'Guide: Login', format: 'markdown', content: '# Login' });
  assert.equal(saved.fileName, 'Guide- Login--11111111-1111-4111-8111-111111111111.md');
  assert.equal(saved.title, 'Guide- Login');
  assert.equal(saved.format, 'markdown');

  const documents = await store.listDocuments();
  assert.equal(documents.length, 1);
  assert.equal((await store.getDocument(saved.fileName)).content, '# Login');

  await store.saveDocument({ fileName: saved.fileName, title: 'Ignored rename', format: 'markdown', content: '# Updated' });
  assert.equal((await store.getDocument(saved.fileName)).content, '# Updated');

  await store.deleteDocument(saved.fileName);
  assert.deepEqual(await store.listDocuments(), []);

  console.log('local-directory-document-store tests passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
