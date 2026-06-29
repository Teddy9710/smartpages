const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const DocumentUploader = require('../utils/documentUpload.js');
const uploader = new DocumentUploader();
assert.equal(uploader.isSupportedFormat({ name: 'guide.pdf' }), false);
assert.equal(uploader.isSupportedFormat({ name: 'guide.docx' }), false);
assert.equal(uploader.isSupportedFormat({ name: 'guide.txt' }), true);

const managerSource = fs.readFileSync(path.join(__dirname, '..', 'upload', 'upload-manager.js'), 'utf8');
const sandbox = { window: {} };
sandbox.globalThis = sandbox;
vm.runInNewContext(managerSource, sandbox);
const manager = new sandbox.window.DocumentUploadManager();
assert.equal(manager.isSupportedFormat('guide.pdf'), false);
assert.equal(manager.isSupportedFormat('guide.docx'), false);
assert.equal(manager.isSupportedFormat('guide.md'), true);

const uploadHtml = fs.readFileSync(path.join(__dirname, '..', 'upload', 'upload-panel.html'), 'utf8');
const settingsJs = fs.readFileSync(path.join(__dirname, '..', 'settings', 'settings.js'), 'utf8');
assert.doesNotMatch(uploadHtml, /accept="[^"]*\.(?:pdf|docx)/i);
assert.doesNotMatch(settingsJs, /Supported formats:\s*PDF, DOCX/i);
