const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const maxSize = 5 * 1024 * 1024;
const largeFile = { name: 'large.pdf', type: 'application/pdf', size: maxSize + 1 };

function loadClass(file, exportName) {
  const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  const sandbox = {
    console: { log: () => {}, warn: () => {}, error: () => {} },
    MAX_FILE_SIZE: maxSize,
    window: {}
  };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(source, sandbox);
  return sandbox.window[exportName];
}

(async () => {
  const DocumentStorage = loadClass('docs/document-storage.js', 'DocumentStorage');
  const storage = new DocumentStorage();
  let storageRead = false;
  storage.readFileContent = async () => {
    storageRead = true;
    return 'data';
  };
  await assert.rejects(() => storage.saveDocument(largeFile), /5 MB|5MB|size/i);
  assert.equal(storageRead, false);

  const DocumentUploadManager = loadClass('upload/upload-manager.js', 'DocumentUploadManager');
  const manager = new DocumentUploadManager();
  let base64Read = false;
  manager.readFileAsBase64 = async () => {
    base64Read = true;
    return 'data';
  };

  await assert.rejects(() => manager.uploadFile(largeFile), /5 MB|5MB|size/i);
  await assert.rejects(
    () => manager.uploadToGitHub(largeFile, { token: 'secret', repo: 'owner/repository', branch: 'main' }),
    /5 MB|5MB|size/i
  );
  assert.equal(base64Read, false);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
