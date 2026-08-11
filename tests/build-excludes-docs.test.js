const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const config = fs.readFileSync(path.join(__dirname, '..', 'vite.config.js'), 'utf8');

assert.doesNotMatch(
  config,
  /\{\s*src:\s*['"]docs(?:\/\*|['"])/,
  'repository documentation must not be copied into the extension package'
);
assert.doesNotMatch(
  config,
  /\{\s*src:\s*['"]upload\/\*['"]/,
  'unused legacy upload demos and integration tests must not be copied into the extension package'
);
