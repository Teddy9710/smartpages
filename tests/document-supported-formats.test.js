const assert = require('node:assert/strict');
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
