const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const calls = [];
global.chrome = {
  runtime: { lastError: null },
  storage: {
    local: {
      get(data, callback) {
        calls.push({ area: 'local', method: 'get', data });
        callback({ apiKey: 'legacy-local-key', baseUrl: 'https://example.test/v1' });
      }
    },
    session: {
      get(data, callback) {
        calls.push({ area: 'session', method: 'get', data });
        callback({ apiKey: 'session-key' });
      }
    }
  }
};

const commonPath = path.join(__dirname, '..', 'utils', 'common.js');
delete require.cache[require.resolve(commonPath)];
const { loadConfig } = require(commonPath);

(async () => {
  const config = await loadConfig();
  assert.equal(config.apiKey, 'session-key');
  assert.equal(config.baseUrl, 'https://example.test/v1');
  assert.equal(calls.some(call => call.area === 'session' && call.method === 'get'), true);

  const settingsSource = fs.readFileSync(path.join(__dirname, '..', 'settings', 'settings.js'), 'utf8');
  assert.match(settingsSource, /storagePromise\(['"]session['"],\s*['"]set['"],\s*\{\s*apiKey:/);
  assert.match(settingsSource, /storagePromise\(['"]local['"],\s*['"]remove['"],\s*['"]apiKey['"]\)/);
  const localSet = settingsSource.match(/storagePromise\(['"]local['"],\s*['"]set['"],\s*\{([\s\S]*?)\}\);/)?.[1] || '';
  assert.doesNotMatch(localSet, /apiKey\s*:/);

  for (const relativePath of ['quick-api-test.html', 'diagnostic-tool.js', 'test-extension.js']) {
    const source = fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
    assert.doesNotMatch(source, /storage\.local\.get\(\s*\[['"]apiKey['"]/);
  }
})().catch(error => {
  console.error(error);
  process.exit(1);
});
