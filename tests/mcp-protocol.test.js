const assert = require('node:assert/strict');
const test = require('node:test');

const {
  ERROR_CODES,
  createRequest,
  createSuccess,
  createError,
  normalizeError
} = require('../packages/smartpages-mcp/src/protocol');

test('protocol helpers create request and response envelopes', () => {
  const request = createRequest('startRun', { workflowId: 'wf' }, 'msg_1');
  assert.deepEqual(request, { id: 'msg_1', type: 'startRun', payload: { workflowId: 'wf' } });

  assert.deepEqual(createSuccess('msg_1', { ok: true }), {
    id: 'msg_1',
    ok: true,
    payload: { ok: true }
  });

  assert.deepEqual(createError('msg_1', ERROR_CODES.EXTENSION_OFFLINE, 'Extension offline'), {
    id: 'msg_1',
    ok: false,
    error: { code: 'EXTENSION_OFFLINE', message: 'Extension offline' }
  });
});

test('normalizeError redacts raw error objects into stable codes', () => {
  assert.deepEqual(normalizeError({ code: 'MISSING_VARIABLES', message: 'Missing variables' }), {
    code: 'MISSING_VARIABLES',
    message: 'Missing variables'
  });

  assert.deepEqual(normalizeError(new Error('boom')), {
    code: 'RUN_FAILED',
    message: 'boom'
  });

  assert.deepEqual(normalizeError(null), {
    code: 'RUN_FAILED',
    message: 'Unknown SmartPages bridge error.'
  });
});
