const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'content', 'recorder.js'), 'utf8');
const getElementTextSource = source.match(/function getElementText\(element\) \{[\s\S]*?\n {2}\}/)?.[0] || '';

assert.ok(getElementTextSource, 'getElementText should be present');
assert.match(
  getElementTextSource,
  /maskSensitiveValue\(element\.getAttribute\('value'\), inputType\)/
);
assert.match(
  getElementTextSource,
  /maskSensitiveValue\(element\.value, inputType\)/
);
assert.doesNotMatch(
  getElementTextSource,
  /\?\s*element\.(?:getAttribute\('value'\)|value)\s*:/
);
