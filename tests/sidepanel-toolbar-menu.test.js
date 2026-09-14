const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'sidepanel', 'sidepanel.html'), 'utf8');
const source = require('./sidepanel-test-source')();

const toolbar = html.slice(html.indexOf('<div class="editor-toolbar">'), html.indexOf('<section id="workflow-run-panel"'));
const menuStart = toolbar.indexOf('<div id="toolbar-more-menu"');
assert.ok(menuStart > 0, 'toolbar should contain an Export menu');

const primaryToolbar = toolbar.slice(0, menuStart);
const exportMenu = toolbar.slice(menuStart);

for (const id of ['btn-preview', 'btn-edit', 'btn-ai-optimize', 'btn-copy', 'btn-local-save', 'btn-local-documents', 'btn-automation-tools', 'btn-more-tools']) {
  assert.match(primaryToolbar, new RegExp(`id="${id}"`), `${id} should remain a primary action`);
}

for (const id of ['btn-download', 'btn-configure-html-export', 'btn-export-html', 'btn-export-word', 'btn-export-pdf', 'btn-copy-export']) {
  assert.match(exportMenu, new RegExp(`id="${id}"`), `${id} should remain available in Export`);
}

for (const id of ['btn-cloud-save', 'btn-cloud-documents', 'btn-export-workflow', 'btn-run-workflow', 'btn-clear-cache']) {
  assert.doesNotMatch(exportMenu, new RegExp(`id="${id}"`), `${id} should not appear in Export`);
}

assert.match(source, /toggleToolbarMenu\(event\)/);
assert.match(source, /toggleAutomationMenu\(event\)/);
assert.match(source, /toggleHtmlExportSettings\(\)/);
assert.match(source, /closeToolbarMenu\(focusButton = false\)/);
assert.match(source, /event\.key === 'Escape'/);

assert.match(toolbar, /id="toolbar-automation-menu"[\s\S]*id="btn-export-workflow"[\s\S]*id="btn-run-workflow"/);
assert.match(html, /id="cloud-documents-modal"[\s\S]*id="btn-cloud-save"/);
assert.match(html, /id="html-export-settings"[^>]*hidden/);
assert.match(toolbar, /id="btn-local-save"[\s\S]*?icon-save/);
assert.match(toolbar, /id="btn-local-documents"[\s\S]*?icon-library/);
assert.match(toolbar, /id="btn-automation-tools"[\s\S]*?icon-automation/);
assert.match(html, /id="btn-cloud-save"[\s\S]*?icon-cloud-save/);

console.log('sidepanel-toolbar-menu tests passed');
