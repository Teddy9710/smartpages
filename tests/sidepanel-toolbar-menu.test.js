const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'sidepanel', 'sidepanel.html'), 'utf8');
const source = fs.readFileSync(path.join(__dirname, '..', 'sidepanel', 'sidepanel.js'), 'utf8');

const toolbar = html.slice(html.indexOf('<div class="editor-toolbar">'), html.indexOf('<section id="workflow-run-panel"'));
const menuStart = toolbar.indexOf('<div id="toolbar-more-menu"');
assert.ok(menuStart > 0, 'toolbar should contain a More menu');

const primaryToolbar = toolbar.slice(0, menuStart);
const advancedMenu = toolbar.slice(menuStart);

for (const id of ['btn-preview', 'btn-edit', 'btn-ai-optimize', 'btn-copy', 'btn-local-save', 'btn-local-documents']) {
  assert.match(primaryToolbar, new RegExp(`id="${id}"`), `${id} should remain a primary action`);
}

for (const id of ['btn-download', 'btn-cloud-save', 'btn-cloud-documents', 'btn-export-workflow', 'btn-run-workflow', 'btn-export-html', 'btn-export-word', 'btn-export-pdf', 'btn-clear-cache']) {
  assert.doesNotMatch(primaryToolbar, new RegExp(`id="${id}"`), `${id} should not clutter the primary toolbar`);
  assert.match(advancedMenu, new RegExp(`id="${id}"`), `${id} should remain available in More`);
}

assert.match(source, /toggleToolbarMenu\(event\)/);
assert.match(source, /closeToolbarMenu\(focusButton = false\)/);
assert.match(source, /event\.key === 'Escape'/);

console.log('sidepanel-toolbar-menu tests passed');
