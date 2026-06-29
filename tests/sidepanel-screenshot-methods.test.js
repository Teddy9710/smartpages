const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'sidepanel', 'sidepanel.js'), 'utf8');

assert.match(source, /_injectScreenshotPlaceholdersFixed\s*\(/);
assert.doesNotMatch(source, /\n\s*_injectScreenshotPlaceholders\s*\(/);
