const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = require('./sidepanel-test-source')();

assert.match(source, /_injectScreenshotPlaceholdersFixed\s*\(/);
assert.doesNotMatch(source, /\n\s*_injectScreenshotPlaceholders\s*\(/);
