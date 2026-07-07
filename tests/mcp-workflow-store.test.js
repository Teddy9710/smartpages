const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  listWorkflows,
  loadWorkflow,
  validateVariables
} = require('../packages/smartpages-mcp/src/workflow-store');

function workflow(overrides = {}) {
  return {
    schemaVersion: '1.0',
    workflowId: 'create-customer',
    workflowVersion: 1,
    title: 'Create customer',
    allowedOrigins: ['https://example.com'],
    variables: [{ name: 'customerName', required: true, secret: false }],
    steps: [{ id: 'step_1', action: 'click', target: { text: 'New' }, risk: 'low' }],
    ...overrides
  };
}

test('listWorkflows returns safe summaries and invalid file details', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-workflows-'));
  fs.writeFileSync(path.join(dir, 'valid.smartpages.json'), JSON.stringify(workflow(), null, 2));
  fs.writeFileSync(path.join(dir, 'invalid.smartpages.json'), JSON.stringify({ nope: true }, null, 2));
  fs.writeFileSync(path.join(dir, 'notes.txt'), 'ignored');

  const result = listWorkflows(dir);

  assert.equal(result.workflows.length, 1);
  assert.equal(result.workflows[0].workflowId, 'create-customer');
  assert.equal(result.workflows[0].stepCount, 1);
  assert.equal(result.workflows[0].hasHighRiskSteps, false);
  assert.equal(result.invalidWorkflows.length, 1);
  assert.equal(result.invalidWorkflows[0].fileName, 'invalid.smartpages.json');
});

test('loadWorkflow selects by id and version', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-workflow-load-'));
  fs.writeFileSync(path.join(dir, 'valid.smartpages.json'), JSON.stringify(workflow(), null, 2));

  const result = loadWorkflow(dir, 'create-customer', 1);

  assert.equal(result.workflow.workflowId, 'create-customer');
  assert.equal(result.fileName, 'valid.smartpages.json');
});

test('validateVariables reports missing required variables without echoing values', () => {
  const result = validateVariables(workflow(), {});
  assert.deepEqual(result, { ok: false, missing: ['customerName'] });

  assert.deepEqual(validateVariables(workflow(), { customerName: 'Acme' }), { ok: true });
});
