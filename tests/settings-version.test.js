const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const settingsJs = fs.readFileSync(path.join(__dirname, '..', 'settings', 'settings.js'), 'utf8');
const settingsHtml = fs.readFileSync(path.join(__dirname, '..', 'settings', 'settings.html'), 'utf8');

assert.match(settingsJs, /chrome\.runtime\.getManifest\(\)\.version/);
assert.match(settingsJs, /aboutVersion:\s*`Version \$\{manifestVersion\}`/);
assert.match(settingsJs, /aboutVersion:\s*`版本 \$\{manifestVersion\}`/);
assert.doesNotMatch(settingsJs, /aboutVersion:\s*['"](?:Version|版本) 1\.0\.0['"]/);
assert.doesNotMatch(settingsHtml, /版本 1\.0\.0/);
