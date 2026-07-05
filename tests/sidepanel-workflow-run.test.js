const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'sidepanel', 'sidepanel.html'), 'utf8');
const source = fs.readFileSync(path.join(root, 'sidepanel', 'sidepanel.js'), 'utf8');

assert.match(html, /id="btn-run-workflow"/);
assert.match(html, /id="workflow-run-panel"[^>]+role="region"[^>]+aria-live="polite"/);
for (const id of ['workflow-run-status', 'workflow-run-step', 'workflow-run-summary', 'workflow-run-inputs', 'btn-workflow-approve', 'btn-workflow-reject', 'btn-workflow-cancel']) {
  assert.match(html, new RegExp(`id="${id}"`));
}

function element(id) {
  return {
    id, hidden: true, disabled: false, textContent: '', value: '', children: [], attributes: {},
    classList: { toggle(_name, force) { this.hidden = !force; }, add() {}, remove() {}, contains() { return false; } },
    setAttribute(name, value) { this.attributes[name] = value; },
    removeAttribute(name) { delete this.attributes[name]; },
    appendChild(child) { this.children.push(child); return child; },
    replaceChildren(...children) { this.children = children; },
    addEventListener() {}, removeEventListener() {}, focus() { this.focused = true; },
    querySelectorAll() { return this.children.flatMap(child => child.tagName === 'INPUT' ? [child] : child.querySelectorAll?.('input') || []); }
  };
}

const ids = ['btn-run-workflow', 'workflow-run-panel', 'workflow-run-status', 'workflow-run-step', 'workflow-run-summary',
  'workflow-run-inputs', 'workflow-run-actions', 'btn-workflow-approve', 'btn-workflow-reject', 'btn-workflow-cancel', 'markdown-editor'];
const elements = Object.fromEntries(ids.map(id => [id, element(id)]));
elements['markdown-editor'].value = '# Replay';
const runtimeListeners = [];
const sent = [];
let queryCount = 0;
let lastQuery;
let responder = async _message => ({ status: 'RUNNING', runId: 'run-1', currentStepId: 's1', pendingStep: { id: 's1', description: 'Open page' } });
const sandbox = {
  Blob, URL, console: { log() {}, warn() {}, error() {} }, setTimeout,
  DocumentApi: class {}, DocUIHelper: class {}, ExtensionError: class extends Error {}, debounce: fn => fn,
  loadConfig: async () => ({ appLanguage: 'en-US' }),
  SmartPagesWorkflowConverter: { convertSession: () => ({ workflow: { schemaVersion: '1.0', workflowId: 'wf', workflowVersion: 1, title: 'Replay', allowedOrigins: ['https://example.com'], variables: [{ name: 'name' }, { name: 'password', secret: true }], steps: [{ id: 's1', action: 'click', risk: 'high', target: '#pay' }] } }) },
  SmartPagesWorkflowSchema: { validateWorkflow: () => ({ ok: true }) },
  chrome: {
    runtime: {
      onMessage: { addListener(fn) { runtimeListeners.push(fn); } },
      sendMessage(message) { sent.push(message); return responder(message); }
    },
    tabs: { async query(query) { queryCount += 1; lastQuery = query; return [{ id: 17 }]; } },
    storage: { sync: { get: async () => ({}) } }
  },
  document: {
    documentElement: { lang: '' }, body: { appendChild() {} }, head: { appendChild() {} },
    addEventListener() {}, querySelector() { return null; }, getElementById(id) { return elements[id] || null; },
    createElement(tagName) { const el = element(''); el.tagName = tagName.toUpperCase(); return el; }
  },
  window: { addEventListener() {}, innerWidth: 800, innerHeight: 600 }
};
sandbox.globalThis = sandbox;
vm.runInNewContext(`${source}\nglobalThis.SidePanelManager = SidePanelManager; globalThis.setSidePanelManager = value => { sidePanelManager = value; };`, sandbox);

function manager() {
  const value = Object.create(sandbox.SidePanelManager.prototype);
  value.session = { steps: [{ type: 'click' }] };
  value.uiText = {
    workflowRunStarting: 'Starting test run…', workflowRunFailed: 'Test run failed. Please try again.',
    workflowRunInvalid: 'Workflow cannot be run.', workflowRunStatusRUNNING: 'Running', workflowRunStatusWAITING_CONFIRMATION: 'Confirmation required',
    workflowRunStatusWAITING_INPUT: 'Input required', workflowRunStatusFAILED: 'Failed', workflowRunStatusCOMPLETED: 'Completed', workflowRunStatusCANCELLED: 'Cancelled',
    workflowRunStep: 'Step {{id}}: {{description}}', workflowRunOrigin: 'Site: {{value}}', workflowRunAction: 'Action: {{value}}',
    workflowRunTarget: 'Target: {{value}}', workflowRunVariables: 'Variables: {{value}}', workflowRunNoVariables: 'None',
    workflowRunApprove: 'Approve', workflowRunContinue: 'Continue'
  };
  value._ensureEditorContentFresh = () => {};
  value._getExportBaseName = () => 'Replay';
  value._showNotification = (message, type) => { value.notice = { message, type }; };
  value.workflowRun = null;
  return value;
}

(async () => {
  const value = manager();
  const first = value.startWorkflowReplay();
  const duplicate = value.startWorkflowReplay();
  await Promise.all([first, duplicate]);
  assert.equal(queryCount, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(lastQuery)), { active: true, currentWindow: true });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].type, 'WORKFLOW_START_RUN');
  assert.equal(sent[0].tabId, 17);
  assert.deepEqual(JSON.parse(JSON.stringify(sent[0].variables)), {});
  assert.equal(sent[0].workflow.workflowId, 'wf');
  assert.equal(elements['btn-run-workflow'].disabled, false);

  const states = ['RUNNING', 'WAITING_CONFIRMATION', 'WAITING_INPUT', 'FAILED', 'COMPLETED', 'CANCELLED'];
  for (const status of states) {
    value._renderWorkflowRun({ status, runId: 'r', currentStepId: 's', pendingStep: { id: 's', description: 'Pay', origin: 'https://shop.example', action: 'click', target: { accessibleName: 'Pay now' }, variableNames: ['email', 'password'], variables: { password: 'SECRET-VALUE' } } });
    assert.ok(elements['workflow-run-status'].textContent);
    assert.equal(elements['btn-workflow-approve'].hidden, !['WAITING_CONFIRMATION', 'WAITING_INPUT'].includes(status));
    assert.equal(elements['btn-workflow-reject'].hidden, status !== 'WAITING_CONFIRMATION');
    assert.equal(elements['btn-workflow-cancel'].hidden, ['FAILED', 'COMPLETED', 'CANCELLED'].includes(status));
    if (status === 'WAITING_INPUT') {
      const renderedInputs = elements['workflow-run-inputs'].children.flatMap(label => label.children || []);
      assert.deepEqual(renderedInputs.map(input => input.name), ['email', 'password']);
      assert.equal(renderedInputs[1].type, 'password');
      assert.doesNotMatch(JSON.stringify(elements['workflow-run-inputs']), /SECRET-VALUE/);
      assert.equal(elements['btn-workflow-approve'].hidden, false);
      assert.equal(elements['btn-workflow-approve'].textContent, 'Continue');
    }
  }
  assert.match(elements['workflow-run-summary'].textContent, /shop\.example|click|Pay now|email|password/);
  assert.doesNotMatch(elements['workflow-run-summary'].textContent, /SECRET-VALUE/);

  sent.length = 0;
  value._workflowReplayVariables = [{ name: 'email' }, { name: 'password', secret: true }];
  value._renderWorkflowRun({ status: 'WAITING_INPUT', runId: 'run-input', currentStepId: 'step-input', pendingStep: { id: 'step-input', variableNames: ['email', 'password'] } });
  const inputFields = elements['workflow-run-inputs'].children.flatMap(label => label.children || []);
  inputFields[0].value = 'person@example.com';
  inputFields[1].value = 'top-secret';
  responder = async () => ({ status: 'RUNNING', runId: 'run-input', currentStepId: 'next' });
  await value.approveWorkflowStep();
  assert.deepEqual(JSON.parse(JSON.stringify(sent[0])), {
    type: 'WORKFLOW_RESUME_RUN', runId: 'run-input', expectedStepId: 'step-input', approved: true,
    variables: { email: 'person@example.com', password: 'top-secret' }
  });
  assert.equal(inputFields[1].value, '');

  sent.length = 0;
  value.workflowRun = { status: 'WAITING_CONFIRMATION', runId: 'run-x', currentStepId: 'step-x', pendingStep: { id: 'step-x' } };
  responder = async message => ({ ...value.workflowRun, status: message.approved ? 'RUNNING' : 'CANCELLED' });
  const approve = value.approveWorkflowStep();
  const duplicateApprove = value.approveWorkflowStep();
  await Promise.all([approve, duplicateApprove]);
  assert.equal(sent.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(sent[0])), { type: 'WORKFLOW_RESUME_RUN', runId: 'run-x', expectedStepId: 'step-x', approved: true, variables: {} });

  sent.length = 0;
  value.workflowRun = { status: 'WAITING_CONFIRMATION', runId: 'run-y', currentStepId: 'step-y' };
  await value.rejectWorkflowStep();
  assert.equal(sent[0].approved, false);
  assert.equal(sent[0].runId, 'run-y');
  assert.equal(sent[0].expectedStepId, 'step-y');
  sent.length = 0;
  value.workflowRun = { status: 'WAITING_CONFIRMATION', runId: '', currentStepId: '' };
  await value.approveWorkflowStep();
  assert.equal(sent.length, 0);

  value.workflowRun = { status: 'RUNNING', runId: 'run-c', currentStepId: 's' };
  await value.cancelWorkflowReplay();
  assert.deepEqual(JSON.parse(JSON.stringify(sent[0])), { type: 'WORKFLOW_CANCEL_RUN', runId: 'run-c' });
  sent.length = 0;
  value.workflowRun = { status: 'COMPLETED', runId: 'run-c' };
  await value.cancelWorkflowReplay();
  assert.equal(sent.length, 0);

  const live = manager();
  live._showDescriptionSelector = () => { live.analysisShown = true; };
  sandbox.setSidePanelManager(live);
  const listener = runtimeListeners.at(-1);
  listener({ type: 'WORKFLOW_RUN_CHANGED', status: { status: 'RUNNING', runId: 'notify', currentStepId: 'n1' } });
  assert.equal(live.workflowRun.runId, 'notify');
  listener({ type: 'START_AI_ANALYSIS', session: { id: 'legacy' }, config: { ai: true } });
  assert.equal(live.session.id, 'legacy');
  assert.equal(live.analysisShown, true);

  responder = async () => { throw new Error('SECRET raw backend failure'); };
  const failed = manager();
  queryCount = 0;
  await failed.startWorkflowReplay();
  assert.equal(elements['btn-run-workflow'].disabled, false);
  assert.equal(failed.notice.message, 'Test run failed. Please try again.');
  assert.doesNotMatch(failed.notice.message, /SECRET|backend/);
})().catch(error => { console.error(error); process.exit(1); });
