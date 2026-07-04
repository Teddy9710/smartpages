const assert = require('node:assert/strict');
const { loadBrowserScript } = require('./workflow-test-helpers');

const schema = loadBrowserScript('workflow/schema.js', 'SmartPagesWorkflowSchema');
const api = loadBrowserScript('workflow/converter.js', 'SmartPagesWorkflowConverter', {
  SmartPagesWorkflowSchema: schema,
});

const sample = api.convertSession({
  sessionId: 'session-42',
  title: 'Edit profile',
  pageUrl: 'https://example.com/profile?tab=main',
  steps: [
    { type: 'click', selector: '#name', elementName: 'Name', tagName: 'input' },
    { type: 'input', selector: '#name', elementName: 'Full name', value: 'Alice' },
    { type: 'click', selector: 'button.save', elementName: 'Save' },
  ],
}, { now: '2026-07-04T00:00:00.000Z' });

assert.equal(sample.workflow.workflowId, 'session-42');
assert.equal(sample.workflow.schemaVersion, '1.0');
assert.equal(sample.workflow.workflowVersion, 1);
assert.equal(sample.workflow.title, 'Edit profile');
assert.equal(sample.workflow.generatedAt, '2026-07-04T00:00:00.000Z');
assert.deepEqual(Array.from(sample.workflow.allowedOrigins), ['https://example.com']);
assert.deepEqual(Array.from(sample.workflow.steps, step => step.action), ['click', 'input', 'click']);
assert.equal(sample.workflow.steps[2].risk, 'high');
assert.equal(sample.workflow.steps[0].preconditions[0].url, 'https://example.com/profile?tab=main');
assert.equal(sample.workflow.steps[1].input.value, '{variable:full-name}');
assert.deepEqual(JSON.parse(JSON.stringify(sample.workflow.variables)), [
  { name: 'full-name', required: true, secret: false },
]);
assert.equal(JSON.stringify(sample).includes('Alice'), false);
assert.equal(sample.markdownLink, 'session-42.smartpages.json');
assert.equal(schema.validateWorkflow(sample.workflow).ok, true);

assert.throws(() => api.convertSession(), error => error.code === 'EMPTY_SESSION');
assert.throws(() => api.convertSession({ pageUrl: 'https://example.com', steps: [] }), error => error.code === 'EMPTY_SESSION');
assert.throws(() => api.convertSession({ pageUrl: 'not a url', steps: [{ type: 'click', selector: '#x' }] }),
  error => error.code === 'INVALID_PAGE_URL');

const forms = api.convertSession({
  title: 'Credentials',
  pageUrl: 'https://secure.example/login',
  steps: [
    { type: 'input', selector: '#token', elementName: 'API 密钥', value: 'sk-secret-value' },
    { type: 'change', selector: '#country', elementRole: 'combobox', elementName: 'Country', value: 'CN' },
    { type: 'change', selector: '#nickname', elementName: 'Display name', value: 'Teddy' },
  ],
});
assert.deepEqual(Array.from(forms.workflow.steps, step => step.action), ['input', 'select', 'input']);
assert.equal(forms.workflow.variables[0].secret, true);
assert.equal(JSON.stringify(forms).includes('sk-secret-value'), false);
assert.equal(JSON.stringify(forms).includes('CN'), false);
assert.equal(JSON.stringify(forms).includes('Teddy'), false);

const navigation = api.convertSession({
  pageUrl: 'https://example.com/start',
  steps: [
    { type: 'navigate', to: 'https://example.com/next' },
    { type: 'scroll', x: 12, y: 345 },
  ],
});
assert.deepEqual(JSON.parse(JSON.stringify(navigation.workflow.steps[0].input)), { url: 'https://example.com/next' });
assert.deepEqual(JSON.parse(JSON.stringify(navigation.workflow.steps[1].input)), { x: 12, y: 345 });

const duplicates = api.convertSession({
  sessionId: 'ignored',
  title: '  My Stable Workflow!  ',
  pageUrl: 'https://example.com',
  steps: [
    { type: 'input', selector: '#first', elementName: 'Email address', value: 'first@example.com' },
    { type: 'input', selector: '#second', elementName: 'Email address', value: 'second@example.com' },
  ],
}, { workflowId: '  My Stable Workflow!  ' });
assert.equal(duplicates.workflow.workflowId, 'my-stable-workflow');
assert.deepEqual(Array.from(duplicates.workflow.variables, variable => variable.name), ['email-address', 'email-address-2']);
assert.deepEqual(Array.from(duplicates.workflow.steps, step => step.input.value),
  ['{variable:email-address}', '{variable:email-address-2}']);

console.log('workflow-converter tests passed');
