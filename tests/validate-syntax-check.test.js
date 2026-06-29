const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'validate.js'), 'utf8');

assert.doesNotMatch(source, /new\s+Function\s*\(/);
assert.match(source, /spawnSync\s*\(process\.execPath,\s*\['--check',\s*fullPath\]/);
