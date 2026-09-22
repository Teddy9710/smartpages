const assert = require('node:assert/strict');
const { ExtensionError, formatUserFacingError } = require('../utils/common.js');

assert.equal(
  formatUserFacingError(new ExtensionError('raw provider message', 'CONFIG_ERROR'), 'zh-CN'),
  '还没有配置 API 密钥。请先打开“设置”完成模型配置。'
);
assert.equal(
  formatUserFacingError({ message: 'Incorrect API key provided', status: 401 }, 'zh-CN'),
  'API 密钥无效或已过期。请在“设置”中更新密钥后重试。'
);
assert.equal(
  formatUserFacingError({ message: 'Too many requests', status: 429 }, 'zh-CN'),
  '模型服务当前请求较多或额度不足。请稍后重试，并检查账户额度。'
);
assert.equal(
  formatUserFacingError(new ExtensionError('请求超时，请检查网络连接', 'REQUEST_TIMEOUT'), 'zh-CN'),
  '等待模型响应超时。请检查网络连接，稍后再试。'
);
assert.equal(
  formatUserFacingError(new Error('Unexpected token at position 0'), 'zh-CN', '生成文档失败，请重试。'),
  '生成文档失败，请重试。'
);
assert.equal(
  formatUserFacingError(new ExtensionError('No response', 'MESSAGE_NO_RESPONSE'), 'en-US'),
  'The extension is not responding. Reopen it, or refresh the current page if the issue continues.'
);
assert.equal(
  formatUserFacingError({ message: '当前页面无法注入录制脚本，请换到普通网页或刷新页面后重试。', code: 'RECORDING_ERROR' }, 'zh-CN'),
  '当前页面无法注入录制脚本，请换到普通网页或刷新页面后重试。'
);
