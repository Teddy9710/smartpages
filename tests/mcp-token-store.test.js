const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { getSmartPagesDir, loadOrCreateToken } = require('../packages/smartpages-mcp/src/token-store');

test('getSmartPagesDir prefers SMARTPAGES_HOME', () => {
  const dir = path.join(os.tmpdir(), `sp-home-${Date.now()}`);
  assert.equal(getSmartPagesDir({ SMARTPAGES_HOME: dir }), dir);
});

test('loadOrCreateToken persists a reusable token', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'smartpages-token-'));
  const env = { SMARTPAGES_HOME: root };

  const first = loadOrCreateToken({ env });
  const second = loadOrCreateToken({ env });

  assert.equal(first.token, second.token);
  assert.equal(first.filePath, path.join(root, 'bridge-token.json'));
  assert.match(first.token, /^[a-f0-9]{64}$/);
});
