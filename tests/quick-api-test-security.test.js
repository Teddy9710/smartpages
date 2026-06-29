const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'quick-api-test.html'), 'utf8');

assert.match(source, /http-equiv="Content-Security-Policy"/i);
assert.match(source, /frame-ancestors 'none'/i);
assert.match(source, /name="referrer" content="no-referrer"/i);
assert.match(source, /仅供开发调试使用，不要输入生产环境的 API Key/);
assert.match(source, /id="api-key"[^>]*autocomplete="new-password"/i);
assert.doesNotMatch(source, /window\.addEventListener\(['"]DOMContentLoaded['"][\s\S]*loadConfig\(\)/);
