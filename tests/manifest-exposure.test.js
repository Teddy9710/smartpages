const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'manifest.json'), 'utf8'));

assert.equal(manifest.web_accessible_resources, undefined);
assert.equal(manifest.content_scripts[0].all_frames, undefined);
