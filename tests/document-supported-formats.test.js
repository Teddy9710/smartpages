const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const DocumentUploader = require('../utils/documentUpload.js');
const { SUPPORTED_FILE_FORMATS } = require('../utils/common.js');
const uploader = new DocumentUploader();
assert.equal(uploader.isSupportedFormat({ name: 'guide.pdf' }), true);
assert.equal(uploader.isSupportedFormat({ name: 'guide.docx' }), true);
assert.equal(uploader.isSupportedFormat({ name: 'guide.txt' }), true);
assert.equal(uploader.isSupportedFormat({ name: 'guide.rtf' }), true);
assert.deepEqual(
  SUPPORTED_FILE_FORMATS.map(extension => extension.slice(1)).sort(),
  [...uploader.supportedFormats].sort()
);

const managerSource = fs.readFileSync(path.join(__dirname, '..', 'upload', 'upload-manager.js'), 'utf8');
const sandbox = { window: {} };
sandbox.globalThis = sandbox;
vm.runInNewContext(managerSource, sandbox);
const manager = new sandbox.window.DocumentUploadManager();
assert.equal(manager.isSupportedFormat('guide.pdf'), true);
assert.equal(manager.isSupportedFormat('guide.docx'), true);
assert.equal(manager.isSupportedFormat('guide.md'), true);

const uploadHtml = fs.readFileSync(path.join(__dirname, '..', 'upload', 'upload-panel.html'), 'utf8');
const settingsJs = fs.readFileSync(path.join(__dirname, '..', 'settings', 'settings.js'), 'utf8');
assert.match(uploadHtml, /accept="[^"]*\.pdf/i);
assert.match(uploadHtml, /accept="[^"]*\.docx/i);
assert.match(settingsJs, /Supported formats:[^']*PDF, DOCX/i);
assert.match(uploadHtml, /accept="[^"]*\.rtf/i);
