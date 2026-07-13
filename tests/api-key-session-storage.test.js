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
        callback({ apiKey: 'persistent-key', baseUrl: 'https://example.test/v1' });
      }
    }
  }
};

const commonPath = path.join(__dirname, '..', 'utils', 'common.js');
delete require.cache[require.resolve(commonPath)];
const { loadConfig } = require(commonPath);

(async () => {
  const config = await loadConfig();
  assert.equal(config.apiKey, 'persistent-key');
  assert.equal(config.baseUrl, 'https://example.test/v1');
  assert.equal(calls.some(call => call.area === 'local' && call.method === 'get'), true);

  const settingsSource = fs.readFileSync(path.join(__dirname, '..', 'settings', 'settings.js'), 'utf8');
  const saveConfigSource = settingsSource.slice(settingsSource.indexOf('async saveConfig()'));
  assert.match(saveConfigSource, /storagePromise\(['"]local['"],\s*['"]set['"],\s*\{\s*apiKey:/);
  const localSet = saveConfigSource.match(/storagePromise\(['"]local['"],\s*['"]set['"],\s*\{([\s\S]*?)\}\);/)?.[1] || '';
  assert.match(localSet, /apiKey\s*:/);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
