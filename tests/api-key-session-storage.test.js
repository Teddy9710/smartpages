const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const calls = [];
let localData = {
  apiKey: 'persistent-key',
  providerApiKeys: { custom: 'persistent-key' },
  rememberApiKey: true,
  baseUrl: 'https://example.test/v1',
  activeProviderId: 'custom',
  providerProfiles: {
    custom: {
      baseUrl: 'https://example.test/v1',
      modelName: 'test-model',
      apiFormat: 'openai',
      multimodalEnabled: true
    }
  },
  multimodalEnabled: true,
  pdfOcrEnabled: true
};
let sessionData = {};
global.chrome = {
  runtime: { lastError: null },
  storage: {
    local: {
      get(data, callback) {
        calls.push({ area: 'local', method: 'get', data });
        callback(localData);
      },
      set(data, callback) { calls.push({ area: 'local', method: 'set', data }); callback(); },
      remove(data, callback) { calls.push({ area: 'local', method: 'remove', data }); callback(); }
    },
    session: {
      get(data, callback) {
        calls.push({ area: 'session', method: 'get', data });
        callback(sessionData);
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
  assert.equal(config.apiKey, 'persistent-key');
  assert.equal(config.rememberApiKey, true);
  assert.equal(config.providerProfiles.custom.apiKey, 'persistent-key');
  assert.equal(config.baseUrl, 'https://example.test/v1');
  assert.equal(config.multimodalEnabled, true);
  assert.equal(config.pdfOcrEnabled, true);
  assert.equal(calls.some(call => call.area === 'session' && call.method === 'get'), true);

  localData = {
    apiKey: 'stale-local-key',
    providerApiKeys: { custom: 'stale-local-key' },
    rememberApiKey: false,
    activeProviderId: 'custom',
    providerProfiles: { custom: { baseUrl: 'https://session.test/v1' } }
  };
  sessionData = { apiKey: 'session-key', providerApiKeys: { custom: 'session-key' } };
  const sessionOnlyConfig = await loadConfig();
  assert.equal(sessionOnlyConfig.apiKey, 'session-key');
  assert.equal(sessionOnlyConfig.rememberApiKey, false);
  assert.equal(calls.some(call => call.area === 'local'
    && call.method === 'remove'
    && Array.isArray(call.data)
    && call.data.includes('apiKey')
    && call.data.includes('providerApiKeys')), true);

  const settingsSource = fs.readFileSync(path.join(__dirname, '..', 'settings', 'settings.js'), 'utf8');
  const saveConfigSource = settingsSource.slice(settingsSource.indexOf('async saveConfig()'));
  assert.match(saveConfigSource, /storagePromise\(['"]session['"],\s*['"]set['"],\s*\{\s*apiKey:/);
  assert.match(saveConfigSource, /persistentSecrets\s*=\s*this\.config\.rememberApiKey/);
  assert.match(saveConfigSource, /\?\s*\{\s*apiKey:\s*this\.config\.apiKey,\s*providerApiKeys\s*\}/);
  assert.match(saveConfigSource, /rememberApiKey:\s*this\.config\.rememberApiKey/);
  assert.match(saveConfigSource, /if\s*\(!this\.config\.rememberApiKey\)[\s\S]*?remove['"],\s*\[['"]apiKey['"],\s*['"]providerApiKeys['"]\]/);
  assert.match(settingsSource, /async clearApiKeys\(\)/);
  assert.match(settingsSource, /storagePromise\(['"]local['"],\s*['"]remove['"],\s*\[['"]apiKey['"],\s*['"]providerApiKeys['"]\]/);

  const settingsHtml = fs.readFileSync(path.join(__dirname, '..', 'settings', 'settings.html'), 'utf8');
  assert.match(settingsHtml, /id="remember-api-key"\s+checked/);
  assert.match(settingsHtml, /id="btn-clear-api-keys"/);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
