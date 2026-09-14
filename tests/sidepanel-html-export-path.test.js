const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = require('./sidepanel-test-source')();

function methodBody(start, end) {
  return source.slice(source.indexOf(start), source.indexOf(end));
}

const downloadBody = methodBody('  downloadDocument() {', '  exportHtmlDocument() {');
const exportHtmlBody = methodBody('  exportHtmlDocument() {', '  exportWordDocument() {');

assert.match(downloadBody, /_buildDeliverableHtmlFromCurrentContent\(content\)/);
assert.doesNotMatch(downloadBody, /_buildStandaloneHtmlFromCurrentContent\(content\)/);
assert.match(exportHtmlBody, /_buildDeliverableHtmlFromCurrentContent\(content\)/);
assert.doesNotMatch(exportHtmlBody, /_buildStandaloneHtmlFromCurrentContent\(content\)/);
