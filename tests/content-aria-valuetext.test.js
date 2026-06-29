const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'content', 'recorder.js'), 'utf8');

assert.match(source, /getAttribute\(['"]aria-valuetext['"]\)/);
assert.doesNotMatch(source, /getAttribute\(['"]aria-value text['"]\)/);
