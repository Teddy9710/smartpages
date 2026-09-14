const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const settingsHtml = fs.readFileSync(path.join(root, 'settings', 'settings.html'), 'utf8');
const settingsJs = fs.readFileSync(path.join(root, 'settings', 'settings.js'), 'utf8');
const sidepanelHtml = fs.readFileSync(path.join(root, 'sidepanel', 'sidepanel.html'), 'utf8');
const viteConfig = fs.readFileSync(path.join(root, 'vite.config.js'), 'utf8');

assert.match(settingsHtml, /option value="supabase"/);
assert.match(settingsHtml, /option value="cloudbase"/);
assert.match(settingsHtml, /id="cloudbase-env-id"/);
assert.match(settingsHtml, /id="cloudbase-access-key"/);
assert.match(settingsJs, /getConfigForProvider\('supabase'\)/);
assert.match(settingsJs, /getConfigForProvider\('cloudbase'\)/);
assert.doesNotMatch(settingsHtml, /<script src="\.\.\/cloudbase-sdk\.js"/);
assert.doesNotMatch(sidepanelHtml, /<script src="\.\.\/cloudbase-sdk\.js"/);
assert.match(viteConfig, /formats:\s*\['iife'\]/);
