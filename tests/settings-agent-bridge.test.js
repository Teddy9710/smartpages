const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('settings page contains agent bridge fields', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'settings', 'settings.html'), 'utf8');
  assert.match(html, /agent-bridge-host/);
  assert.match(html, /agent-bridge-port/);
  assert.match(html, /agent-bridge-token/);
  assert.match(html, /btn-agent-bridge-test/);
});

test('settings script persists smartpagesAgentBridge config', () => {
  const js = fs.readFileSync(path.join(__dirname, '..', 'settings', 'settings.js'), 'utf8');
  assert.match(js, /smartpagesAgentBridge/);
  assert.match(js, /AGENT_BRIDGE_RECONNECT/);
  assert.match(js, /AGENT_BRIDGE_GET_STATUS/);
});
