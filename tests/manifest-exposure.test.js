const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'manifest.json'), 'utf8'));

assert.equal(manifest.web_accessible_resources, undefined);
assert.equal(manifest.content_scripts, undefined);
assert.equal(manifest.host_permissions, undefined);
assert.deepEqual(manifest.optional_host_permissions, ['http://*/*', 'https://*/*']);

const settingsSource = fs.readFileSync(path.join(__dirname, '..', 'settings', 'settings.js'), 'utf8');
assert.match(settingsSource, /chrome\.permissions\.request\(\{\s*origins:/);
