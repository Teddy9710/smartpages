const assert = require('node:assert/strict');
const test = require('node:test');

const { createToolHandlers } = require('../packages/smartpages-mcp/src/mcp-server');

function workflow() {
  return {
    schemaVersion: '1.0',
    workflowId: 'wf',
    workflowVersion: 1,
    title: 'Workflow',
    allowedOrigins: ['https://example.com'],
    variables: [{ name: 'name', required: true, secret: false }],
    steps: [{ id: 's1', action: 'click', target: { text: 'Go' }, risk: 'low' }]
  };
}

test('list_workflows delegates to workflow store', async () => {
  const handlers = createToolHandlers({
    workflowDir: 'dir',
    store: { listWorkflows: dir => ({ dir, workflows: [], invalidWorkflows: [] }) },
    bridge: {}
  });

  assert.deepEqual(await handlers.list_workflows({}), { dir: 'dir', workflows: [], invalidWorkflows: [] });
});

test('start_run validates workflow and variables before forwarding', async () => {
  const forwarded = [];
  const handlers = createToolHandlers({
    workflowDir: 'dir',
    store: {
      loadWorkflow: () => ({ workflow: workflow(), fileName: 'wf.smartpages.json' }),
      validateVariables: () => ({ ok: true })
    },
    bridge: {
      forward: async (type, payload) => {
        forwarded.push({ type, payload });
        return { runId: 'run_1', status: 'RUNNING' };
      }
    }
  });

  const result = await handlers.start_run({ workflowId: 'wf', workflowVersion: 1, variables: { name: 'Acme' } });

  assert.equal(result.runId, 'run_1');
  assert.equal(forwarded[0].type, 'startRun');
  assert.equal(forwarded[0].payload.workflow.workflowId, 'wf');
});

test('start_run returns missing variables without forwarding', async () => {
  let forwarded = false;
  const handlers = createToolHandlers({
    workflowDir: 'dir',
    store: {
      loadWorkflow: () => ({ workflow: workflow(), fileName: 'wf.smartpages.json' }),
      validateVariables: () => ({ ok: false, missing: ['name'] })
    },
    bridge: { forward: async () => { forwarded = true; } }
  });

  const result = await handlers.start_run({ workflowId: 'wf', workflowVersion: 1, variables: {} });

  assert.equal(result.error.code, 'MISSING_VARIABLES');
  assert.deepEqual(result.missing, ['name']);
  assert.equal(forwarded, false);
});
