const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'settings', 'settings.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '..', 'settings', 'settings.html'), 'utf8');

assert.match(source, /async refreshModelList\(\)/);
assert.match(source, /fetchWithTimeout\(this\._getModelListUrl\(baseUrl(?:, providerId)?\)/);
assert.match(source, /headers\['x-api-key'\][^\n]*apiKey/);
assert.match(source, /headers\.Authorization[^\n]*Bearer/);
assert.match(source, /this\.modelListCache\.set\(cacheKey/);
assert.match(source, /_normalizeModelList\(payload\)/);
assert.match(source, /_getModelListUrl\(baseUrl(?:, providerId)?\)/);
assert.match(source, /modelListUrl: 'https:\/\/dashscope\.aliyuncs\.com\/api\/v1\/models'/);
assert.match(source, /internationalModelListUrl: 'https:\/\/dashscope-intl\.aliyuncs\.com\/api\/v1\/models'/);
assert.match(html, /id="btn-refresh-models"/);
assert.match(html, /id="model-options"/);
assert.match(html, /id="model-list-status"/);
assert.match(html, /list="model-options"/);

console.log('settings model list tests passed');
