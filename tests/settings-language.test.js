const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync('settings/settings.html', 'utf8');
const script = fs.readFileSync('settings/settings.js', 'utf8');

for (const id of [
  'cloud-settings',
  'cloud-provider',
  'supabase-url',
  'supabase-anon-key',
  'cloudbase-env-id',
  'cloudbase-access-key',
  'cloudbase-region',
  'btn-save-cloud-settings',
  'agent-bridge-status'
]) {
  assert.match(html, new RegExp(`id="${id}"`), `settings.html should expose ${id}`);
}

for (const key of [
  'localStatus',
  'navApi',
  'cloudHeading',
  'cloudDesc',
  'agentBridgeHeading',
  'testAgentBridge'
]) {
  assert.match(script, new RegExp(`\\b${key}\\s*:`), `settings.js should translate ${key}`);
}

assert.match(script, /\.upload-content p:first-of-type/);
assert.match(script, /#cloud-settings h2/);
assert.match(script, /#btn-save-cloud-settings/);

console.log('settings language coverage tests passed');
