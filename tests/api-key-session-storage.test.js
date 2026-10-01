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
        callback({ baseUrl: 'https://example.test/v1', activeProviderId: 'custom', multimodalEnabled: true });
      },
      set(data, callback) { calls.push({ area: 'local', method: 'set', data }); callback(); },
      remove(data, callback) { calls.push({ area: 'local', method: 'remove', data }); callback(); }
    },
    session: {
      get(data, callback) {
        calls.push({ area: 'session', method: 'get', data });
        callback({ apiKey: 'session-key', providerApiKeys: { custom: 'session-key' } });
      },
      set(data, callback) { calls.push({ area: 'session', method: 'set', data }); callback(); }
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
  assert.equal(config.multimodalEnabled, true);
  assert.equal(calls.some(call => call.area === 'session' && call.method === 'get'), true);

  const settingsSource = fs.readFileSync(path.join(__dirname, '..', 'settings', 'settings.js'), 'utf8');
  const saveConfigSource = settingsSource.slice(settingsSource.indexOf('async saveConfig()'));
  assert.match(saveConfigSource, /storagePromise\(['"]session['"],\s*['"]set['"],\s*\{\s*apiKey:/);
  const localSet = saveConfigSource.match(/storagePromise\(['"]local['"],\s*['"]set['"],\s*\{([\s\S]*?)\}\);/)?.[1] || '';
  assert.doesNotMatch(localSet, /\bapiKey\s*:/);
  assert.match(localSet, /multimodalEnabled\s*:/);
  assert.match(saveConfigSource, /storagePromise\(['"]local['"],\s*['"]remove['"],\s*['"]apiKey['"]\)/);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
