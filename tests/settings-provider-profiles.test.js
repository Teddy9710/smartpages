const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

global.chrome = {
  runtime: { lastError: null },
  storage: {
    local: {
      get(_keys, callback) {
        callback({
          apiKey: 'legacy-key',
          baseUrl: 'https://legacy.example/v1',
          modelName: 'legacy-model',
          activeProviderId: 'claude',
          providerProfiles: {
            openai: {
              apiKey: 'openai-key',
              baseUrl: 'https://api.openai.com/v1',
              modelName: 'gpt-4o-mini',
              apiFormat: 'openai'
            },
            claude: {
              apiKey: 'claude-key',
              baseUrl: 'https://api.anthropic.com/v1',
              modelName: 'claude-vision',
              apiFormat: 'anthropic',
              maxTokens: 6000,
              maxInputTokens: 180000,
              multimodalEnabled: true
            }
          }
        });
      }
    }
  }
};

const commonPath = path.join(__dirname, '..', 'utils', 'common.js');
delete require.cache[require.resolve(commonPath)];
const { loadConfig } = require(commonPath);

(async () => {
  const config = await loadConfig();
  assert.equal(config.activeProviderId, 'claude');
  assert.equal(config.apiKey, 'claude-key');
  assert.equal(config.baseUrl, 'https://api.anthropic.com/v1');
  assert.equal(config.modelName, 'claude-vision');
  assert.equal(config.apiFormat, 'anthropic');
  assert.equal(config.maxTokens, 6000);
  assert.equal(config.maxInputTokens, 180000);
  assert.equal(config.multimodalEnabled, true);
  assert.equal(config.providerProfiles.openai.apiKey, 'openai-key');

  const source = fs.readFileSync(path.join(__dirname, '..', 'settings', 'settings.js'), 'utf8');
  assert.match(source, /_captureProviderProfile\(this\.activeProviderId\)/);
  assert.match(source, /_populateProviderProfile\(providerId, this\.providerProfiles\[providerId\]\)/);
  assert.match(source, /activeProviderId: this\.config\.activeProviderId/);
  assert.match(source, /providerProfiles: this\.config\.providerProfiles/);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
