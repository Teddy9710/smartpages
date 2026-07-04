const assert = require('node:assert/strict');
const { loadBrowserScript } = require('./workflow-test-helpers');

const api = loadBrowserScript('workflow/schema.js', 'SmartPagesWorkflowSchema');

const validWorkflow = () => ({
  schemaVersion: '1.0',
  workflowId: 'checkout',
  workflowVersion: 1,
  allowedOrigins: ['https://example.com'],
  variables: [],
  steps: [
    { id: 'open', action: 'navigate', risk: 'low', target: 'https://example.com/cart' },
    { id: 'buy', action: 'click', risk: 'high', target: '#buy' },
  ],
});

assert.equal(api.VERSION, '1.0');
assert.deepEqual(Array.from(api.ACTIONS), ['navigate', 'click', 'input', 'select', 'scroll', 'wait', 'assert']);
assert.deepEqual(Array.from(api.RISKS), ['low', 'medium', 'high']);

const accepted = api.validateWorkflow(validWorkflow());
assert.equal(accepted.ok, true);
assert.equal(accepted.workflow.workflowId, 'checkout');

const invalidCases = [
  [null, 'INVALID_WORKFLOW'],
  [{}, 'UNSUPPORTED_SCHEMA'],
  [{ ...validWorkflow(), schemaVersion: '2.0' }, 'UNSUPPORTED_SCHEMA'],
  [{ ...validWorkflow(), workflowId: '' }, 'INVALID_WORKFLOW_ID'],
  [{ ...validWorkflow(), workflowVersion: 0 }, 'INVALID_WORKFLOW_VERSION'],
  [{ ...validWorkflow(), workflowVersion: 1.5 }, 'INVALID_WORKFLOW_VERSION'],
  [{ ...validWorkflow(), allowedOrigins: [] }, 'INVALID_ALLOWED_ORIGINS'],
  [{ ...validWorkflow(), allowedOrigins: ['https://*.example.com'] }, 'INVALID_ALLOWED_ORIGINS'],
  [{ ...validWorkflow(), allowedOrigins: ['https://example.com/path'] }, 'INVALID_ALLOWED_ORIGINS'],
  [{ ...validWorkflow(), allowedOrigins: ['ftp://example.com'] }, 'INVALID_ALLOWED_ORIGINS'],
  [{ ...validWorkflow(), variables: {} }, 'INVALID_VARIABLES'],
  [{ ...validWorkflow(), steps: [] }, 'INVALID_STEPS'],
  [{ ...validWorkflow(), steps: [{ action: 'wait', risk: 'low' }] }, 'INVALID_STEP_ID'],
  [{ ...validWorkflow(), steps: [{ id: 'same', action: 'wait', risk: 'low' }, { id: 'same', action: 'wait', risk: 'low' }] }, 'DUPLICATE_STEP_ID'],
  [{ ...validWorkflow(), steps: [{ id: 'bad', action: 'launch', risk: 'low' }] }, 'UNKNOWN_ACTION'],
  [{ ...validWorkflow(), steps: [{ id: 'bad', action: 'wait', risk: 'critical' }] }, 'INVALID_RISK'],
  [{ ...validWorkflow(), steps: [{ id: 'bad', action: 'click', risk: 'low' }] }, 'MISSING_TARGET'],
];

for (const [workflow, code] of invalidCases) {
  const result = api.validateWorkflow(workflow);
  assert.equal(result.ok, false, `expected ${code}`);
  assert.equal(result.code, code);
  assert.equal(typeof result.message, 'string');
  assert.ok(result.message.length > 0);
}

assert.equal(api.isOriginAllowed('https://example.com/a', ['https://example.com']), true);
assert.equal(api.isOriginAllowed('https://evil.example.com/a', ['https://example.com']), false);
assert.equal(api.isOriginAllowed('not a url', ['https://example.com']), false);

console.log('workflow-schema tests passed');
