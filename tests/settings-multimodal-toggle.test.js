const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const settingsHtml = fs.readFileSync(path.join(__dirname, '..', 'settings', 'settings.html'), 'utf8');
const settingsSource = fs.readFileSync(path.join(__dirname, '..', 'settings', 'settings.js'), 'utf8');

assert.match(settingsHtml, /id="multimodal-enabled"/);
assert.match(settingsHtml, /id="smart-description"/);
assert.match(settingsSource, /set\('#multimodal-setting \.switch-title', text\.multimodalTitle\)/);
assert.match(settingsSource, /set\('#multimodal-setting \.switch-desc', text\.multimodalDesc\)/);
assert.match(settingsSource, /set\('#smart-settings \.switch-title', text\.smartTitle\)/);
assert.match(settingsSource, /set\('#smart-settings \.switch-desc', text\.smartDesc\)/);
assert.doesNotMatch(settingsSource, /set\('\.switch-(?:title|desc)'/);
