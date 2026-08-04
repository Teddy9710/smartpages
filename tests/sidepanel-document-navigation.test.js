const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'sidepanel', 'sidepanel.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '..', 'sidepanel', 'sidepanel.html'), 'utf8');

assert.match(html, /id="btn-document-back"/);
assert.match(source, /this\.documentNavigationStack = \[\]/);
assert.match(source, /_pushCurrentDocumentForNavigation\(\)/);
assert.match(source, /async returnToPreviousDocument\(\)/);

const localOpen = source.slice(source.indexOf('  async openLocalDocument('), source.indexOf('  async deleteLocalDocument('));
const cloudOpen = source.slice(source.indexOf('  async openCloudDocument('), source.indexOf('  downloadDocument()'));
assert.match(localOpen, /this\._pushCurrentDocumentForNavigation\(\)/);
assert.match(cloudOpen, /this\._pushCurrentDocumentForNavigation\(\)/);

console.log('sidepanel-document-navigation tests passed');
