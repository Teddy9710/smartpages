const assert = require('node:assert/strict');
const { loadBrowserScript } = require('./workflow-test-helpers');

const schema = loadBrowserScript('workflow/schema.js', 'SmartPagesWorkflowSchema');
const api = loadBrowserScript('workflow/converter.js', 'SmartPagesWorkflowConverter', {
  SmartPagesWorkflowSchema: schema,
});

const sample = api.convertSession({
  sessionId: 'session-42',
  pageTitle: 'Edit profile',
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
assert.deepEqual(JSON.parse(JSON.stringify(sample.workflow.steps[1].input.value)), { variable: 'full-name' });
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

const nestedScroll = api.convertSession({
  pageUrl: 'https://example.com/start',
  steps: [{ type: 'scroll', scroll: { x: 98, y: 765 }, x: 1, y: 2 }],
});
assert.deepEqual(JSON.parse(JSON.stringify(nestedScroll.workflow.steps[0].input)), { x: 98, y: 765 });

const malformedScroll = api.convertSession({
  pageUrl: 'https://example.com/start',
  steps: [{ type: 'scroll', scroll: { x: 'bad', y: Infinity } }],
});
assert.deepEqual(JSON.parse(JSON.stringify(malformedScroll.workflow.steps[0].input)), { x: 0, y: 0 });

const directMappings = api.convertSession({
  pageUrl: 'https://example.com/start',
  steps: [
    { type: 'select', selector: '#language', elementName: 'Language', value: 'Chinese' },
    { type: 'navigate', url: 'https://example.com/from-recorded-url' },
    { type: 'click', selector: '#confirm', elementName: '确认订单' },
  ],
});
assert.equal(directMappings.workflow.steps[0].action, 'select');
assert.deepEqual(JSON.parse(JSON.stringify(directMappings.workflow.steps[0].input.value)), { variable: 'language' });
assert.equal(JSON.stringify(directMappings).includes('Chinese'), false);
assert.deepEqual(JSON.parse(JSON.stringify(directMappings.workflow.steps[1].input)), {
  url: 'https://example.com/from-recorded-url',
});
assert.equal(directMappings.workflow.steps[2].risk, 'high');
assert.equal(directMappings.workflow.steps.some(step => Object.hasOwn(step, 'postconditions')), false);

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
assert.deepEqual(JSON.parse(JSON.stringify(Array.from(duplicates.workflow.steps, step => step.input.value))),
  [{ variable: 'email-address' }, { variable: 'email-address-2' }]);

const adversarialNames = api.convertSession({
  sessionId: 'id-must-not-be-title',
  pageTitle: 'Recorded page title',
  pageUrl: 'https://example.com',
  steps: [
    { type: 'input', selector: '#one', elementName: 'email', value: 'one' },
    { type: 'input', selector: '#two', elementName: 'email-2', value: 'two' },
    { type: 'input', selector: '#three', elementName: 'email', formValue: { value: 'nested-secret' } },
  ],
}, { title: 'Explicit workflow title' });
assert.equal(adversarialNames.workflow.title, 'Explicit workflow title');
assert.deepEqual(Array.from(adversarialNames.workflow.variables, variable => variable.name),
  ['email', 'email-2', 'email-3']);
assert.deepEqual(JSON.parse(JSON.stringify(Array.from(adversarialNames.workflow.steps, step => step.input.value))),
  [{ variable: 'email' }, { variable: 'email-2' }, { variable: 'email-3' }]);
assert.equal(JSON.stringify(adversarialNames).includes('nested-secret'), false);

const pageTitle = api.convertSession({
  sessionId: 'separate-id',
  pageTitle: 'Page title wins',
  pageUrl: 'https://example.com',
  steps: [{ type: 'click', selector: '#x' }],
});
assert.equal(pageTitle.workflow.title, 'Page title wins');
const defaultTitle = api.convertSession({
  sessionId: 'separate-id',
  pageUrl: 'https://example.com',
  steps: [{ type: 'click', selector: '#x' }],
});
assert.equal(defaultTitle.workflow.title, 'SmartPages workflow');

assert.throws(() => api.convertSession({ pageUrl: 'ftp://example.com', steps: [{ type: 'click', selector: '#x' }] }),
  error => error.code === 'INVALID_PAGE_URL');

const withoutSchema = loadBrowserScript('workflow/converter.js', 'SmartPagesWorkflowConverter');
assert.equal(withoutSchema.convertSession({
  pageUrl: 'https://example.com',
  steps: [{ type: 'click', selector: '#works' }],
}).workflow.steps[0].action, 'click');

const rejectingConverter = loadBrowserScript('workflow/converter.js', 'SmartPagesWorkflowConverter', {
  SmartPagesWorkflowSchema: { validateWorkflow: () => ({ ok: false, code: 'TEST_REJECTION' }) },
});
assert.throws(() => rejectingConverter.convertSession({
  pageUrl: 'https://example.com',
  steps: [{ type: 'click', selector: '#invalid' }],
}), error => error.code === 'INVALID_GENERATED_WORKFLOW' && /TEST_REJECTION/.test(error.message));

console.log('workflow-converter tests passed');
