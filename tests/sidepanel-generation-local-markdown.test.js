const assert = require('node:assert/strict');
const source = require('./sidepanel-test-source')();

const generation = source.slice(
  source.indexOf('  async generateDocument()'),
  source.indexOf('  _buildGenerationPrompt(')
);

assert.match(generation, /_setEditorContent\([\s\S]*_autoDownloadGeneratedMarkdown\(\)/);
assert.match(generation, /new Blob\(\[content\], \{ type: 'text\/markdown;charset=utf-8' \}\)/);
assert.match(generation, /_downloadBlob\(filename/);
assert.match(generation, /`\$\{this\._getExportBaseName\(content\)\}\.md`/);
assert.match(generation, /markdownAutoSaveFailed/);
