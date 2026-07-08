const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'manifest.json'), 'utf8'));

assert.equal(manifest.web_accessible_resources, undefined);
assert.equal(manifest.content_scripts, undefined);
assert.equal(manifest.host_permissions, undefined);
assert.deepEqual(manifest.optional_host_permissions, ['http://*/*', 'https://*/*']);
assert.match(
  manifest.content_security_policy.extension_pages,
  /connect-src[^;]*https:/,
  'extension CSP must allow HTTPS model API connections after host permission is granted'
);
assert.match(
  manifest.content_security_policy.extension_pages,
  /connect-src[^;]*ws:\/\/127\.0\.0\.1:\*/,
  'extension CSP must still allow local SmartPages Agent Bridge WebSocket connections'
);

const settingsSource = fs.readFileSync(path.join(__dirname, '..', 'settings', 'settings.js'), 'utf8');
assert.match(settingsSource, /chrome\.permissions\.request\(\{\s*origins:/);
