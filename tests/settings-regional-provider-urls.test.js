const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'settings', 'settings.js'), 'utf8');

const expectedInternationalDefaults = [
  'https://api.z.ai/api/paas/v4',
  'https://api.deepseek.com/v1',
  'https://api.minimax.io/v1',
  'https://api.moonshot.ai/v1',
  'https://api.siliconflow.com/v1',
  'https://dashscope-intl.aliyuncs.com/compatible-mode/v1'
];

for (const baseUrl of expectedInternationalDefaults) {
  assert.ok(
    source.includes(`internationalBaseUrl: '${baseUrl}'`),
    `missing international provider Base URL: ${baseUrl}`
  );
}

assert.match(source, /this\._switchApiRegion\(previousLanguage, nextLanguage\)/);
assert.match(source, /language === 'en-US'[\s\S]*provider\.internationalBaseUrl/);
assert.match(source, /\[provider\.baseUrl, provider\.internationalBaseUrl\]/);
assert.match(source, /this\._resolveRegionalBaseUrl\(this\.activeProviderId, this\.config\.baseUrl\)/);
