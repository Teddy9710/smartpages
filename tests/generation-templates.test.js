const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  BUILT_IN_GENERATION_TEMPLATES,
  normalizeGenerationTemplateSettings,
  normalizeCustomGenerationTemplates,
  getGenerationTemplateLibrary,
  createGenerationTemplate,
  duplicateGenerationTemplate,
  renameGenerationTemplate
} = require('../utils/generationTemplates.js');

assert.equal(BUILT_IN_GENERATION_TEMPLATES.length, 3);
assert.deepEqual(
  BUILT_IN_GENERATION_TEMPLATES.map(template => template.id),
  ['builtin-user-guide', 'builtin-test-case', 'builtin-bug-report']
);

const normalized = normalizeGenerationTemplateSettings({
  promptMode: 'invalid',
  outputFormat: 'pdf',
  promptAppend: 42,
  documentExamples: {
    testing: 'Example',
    unknown: 'Discard me',
    tutorial: 123
  }
});
assert.equal(normalized.promptMode, 'append');
assert.equal(normalized.outputFormat, 'markdown');
assert.equal(normalized.promptAppend, '42');
assert.deepEqual(normalized.documentExamples, { testing: 'Example' });

const custom = createGenerationTemplate('My Template', {
  promptMode: 'custom',
  customPrompt: 'Write {{steps}}',
  outputFormat: 'html'
}, getGenerationTemplateLibrary());
assert.equal(custom.builtIn, false);
assert.equal(custom.settings.promptMode, 'custom');
assert.equal(custom.settings.outputFormat, 'html');

assert.throws(
  () => createGenerationTemplate('user guide', {}, getGenerationTemplateLibrary()),
  /already exists/i
);

const duplicate = duplicateGenerationTemplate(custom, 'My Template Copy', getGenerationTemplateLibrary([custom]));
assert.notEqual(duplicate.id, custom.id);
assert.deepEqual(duplicate.settings, custom.settings);

const renamed = renameGenerationTemplate(custom, 'Renamed Template', getGenerationTemplateLibrary([custom]));
assert.equal(renamed.name, 'Renamed Template');
assert.throws(
  () => renameGenerationTemplate(BUILT_IN_GENERATION_TEMPLATES[0], 'Nope', []),
  /cannot be renamed/i
);

const sanitized = normalizeCustomGenerationTemplates([
  custom,
  { ...custom },
  { id: 'builtin-user-guide', name: 'Override', settings: {} },
  { id: '', name: 'Invalid', settings: {} }
]);
assert.equal(sanitized.length, 1);

const html = fs.readFileSync(path.join(__dirname, '..', 'settings', 'settings.html'), 'utf8');
const source = fs.readFileSync(path.join(__dirname, '..', 'settings', 'settings.js'), 'utf8');
assert.match(html, /id="generation-template-select"/);
assert.match(html, /id="btn-template-save-new"/);
assert.match(html, /utils\/generationTemplates\.js/);
assert.match(source, /applySelectedGenerationTemplate\(\)/);
assert.match(source, /setSelectedGenerationTemplateAsDefault\(\)/);
assert.match(source, /GENERATION_TEMPLATES_STORAGE_KEY/);

console.log('generation template tests passed');
