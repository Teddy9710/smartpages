const assert = require('node:assert/strict');

global.chrome = {
  runtime: { lastError: null },
  storage: { local: { get(_, callback) { callback({}); } } }
};

const {
  buildModelApiRequest,
  buildModelUserContent,
  MAX_MODEL_SCREENSHOTS
} = require('../utils/common.js');

const openAiRequest = buildModelApiRequest(
  {
    apiKey: 'test-key',
    baseUrl: 'https://api.example.com/v1',
    apiFormat: 'openai',
    modelName: 'vision-model'
  },
  'Describe the workflow.',
  {
    images: [{ label: '[Screenshot 2]', dataUrl: 'data:image/png;base64,QUJDRA==' }]
  }
);
const openAiBody = JSON.parse(openAiRequest.fetchOptions.body);
assert.deepEqual(openAiBody.messages[0].content, [
  { type: 'text', text: 'Describe the workflow.' },
  { type: 'text', text: '[Screenshot 2]' },
  { type: 'image_url', image_url: { url: 'data:image/png;base64,QUJDRA==' } }
]);

const anthropicRequest = buildModelApiRequest(
  {
    apiKey: 'test-key',
    baseUrl: 'https://api.anthropic.com/v1',
    apiFormat: 'anthropic',
    modelName: 'claude-vision'
  },
  'Describe the workflow.',
  {
    images: [{ label: '[截图1]', dataUrl: 'data:image/jpeg;base64,QUJDRA==' }]
  }
);
const anthropicBody = JSON.parse(anthropicRequest.fetchOptions.body);
assert.deepEqual(anthropicBody.messages[0].content, [
  { type: 'text', text: 'Describe the workflow.' },
  { type: 'text', text: '[截图1]' },
  {
    type: 'image',
    source: { type: 'base64', media_type: 'image/jpeg', data: 'QUJDRA==' }
  }
]);

assert.equal(buildModelUserContent('openai', 'text only', [
  { dataUrl: 'https://example.com/not-embedded.png' }
]), 'text only');

const manyImages = Array.from({ length: MAX_MODEL_SCREENSHOTS + 5 }, (_, index) => ({
  label: `Screenshot ${index + 1}`,
  dataUrl: 'data:image/webp;base64,QUJDRA=='
}));
const limitedContent = buildModelUserContent('openai', 'prompt', manyImages);
assert.equal(
  limitedContent.filter(part => part.type === 'image_url').length,
  MAX_MODEL_SCREENSHOTS
);
