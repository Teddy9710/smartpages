const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'settings', 'settings.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '..', 'settings', 'settings.html'), 'utf8');

assert.ok(html.includes('<option value="glm">GLM / 智谱 AI</option>'));

const expectedDomesticDefaults = [
  'https://open.bigmodel.cn/api/paas/v4',
  'https://api.deepseek.com/v1',
  'https://api.minimax.cn/v1',
  'https://api.moonshot.cn/v1',
  'https://api.siliconflow.cn/v1',
  'https://dashscope.aliyuncs.com/compatible-mode/v1'
];

for (const baseUrl of expectedDomesticDefaults) {
  assert.ok(source.includes(`baseUrl: '${baseUrl}'`), `missing domestic provider Base URL: ${baseUrl}`);
}

const internationalDefaultsThatMustNotBackDomesticProviders = [
  'https://api.z.ai/api/paas/v4',
  'https://api.minimax.io/v1',
  'https://api.moonshot.ai/v1'
];

for (const baseUrl of internationalDefaultsThatMustNotBackDomesticProviders) {
  assert.ok(!source.includes(`baseUrl: '${baseUrl}'`), `international Base URL is still configured: ${baseUrl}`);
}

const currentDomesticModels = [
  'glm-4.7-flash',
  'deepseek-flash',
  'MiniMax-M3',
  'kimi-k3'
];

for (const modelName of currentDomesticModels) {
  assert.ok(source.includes(`modelName: '${modelName}'`), `missing current domestic default model: ${modelName}`);
}

for (const retiredModelName of ['deepseek-chat', 'MiniMax-M1', 'moonshot-v1-8k']) {
  assert.ok(!source.includes(`modelName: '${retiredModelName}'`), `retired default model is still configured: ${retiredModelName}`);
}
