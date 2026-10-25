const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const sidepanel = fs.readFileSync(path.join(__dirname, '..', 'sidepanel', 'sidepanel.html'), 'utf8');
const sidepanelJs = fs.readFileSync(path.join(__dirname, '..', 'sidepanel', 'sidepanel.js'), 'utf8');
const settings = fs.readFileSync(path.join(__dirname, '..', 'settings', 'settings.html'), 'utf8');
const settingsJs = fs.readFileSync(path.join(__dirname, '..', 'settings', 'settings.js'), 'utf8');

assert.match(sidepanel, /id="btn-preview"[^>]*aria-pressed="true"/);
assert.match(sidepanel, /id="btn-edit"[^>]*aria-pressed="false"/);
assert.match(sidepanelJs, /setAttribute\('aria-pressed', String\(buttonId === 'btn-preview'\)\)/);
assert.match(settings, /id="btn-toggle-key"[^>]*aria-label="显示 API Key"/);
assert.match(settingsJs, /toggleBtn\.setAttribute\('aria-label'/);

console.log('accessibility controls tests passed');
