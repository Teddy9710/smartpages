const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'sidepanel', 'sidepanel.html'), 'utf8');
const schemaSource = fs.readFileSync(path.join(root, 'workflow', 'schema.js'), 'utf8');
const converterSource = fs.readFileSync(path.join(root, 'workflow', 'converter.js'), 'utf8');
const sidepanelSource = fs.readFileSync(path.join(root, 'sidepanel', 'sidepanel.js'), 'utf8');

const schemaIndex = html.indexOf('../workflow/schema.js');
const converterIndex = html.indexOf('../workflow/converter.js');
const sidepanelIndex = html.indexOf('src="sidepanel.js"');
assert.ok(schemaIndex >= 0 && schemaIndex < converterIndex && converterIndex < sidepanelIndex);
assert.match(html, /id="btn-export-workflow"[^>]+(?:title|aria-label)="[^"]+"/);
assert.match(html, /id="btn-export-workflow"[\s\S]*?JSON[\s\S]*?<\/button>/);

let editorContent = '# Checkout: Demo / Flow?\n\nFollow these steps.';
const sandbox = {
  Blob,
  URL,
  console: { log: () => {}, warn: () => {}, error: () => {} },
  DocumentApi: class {},
  DocUIHelper: class {},
  ExtensionError: class ExtensionError extends Error {},
  debounce: fn => fn,
  loadConfig: () => Promise.resolve({ appLanguage: 'en-US' }),
  chrome: {
    runtime: { onMessage: { addListener: () => {} }, sendMessage: () => Promise.resolve({}) },
    storage: { sync: { get: () => Promise.resolve({}) } },
    tabs: { query: () => Promise.resolve([]) }
  },
  document: {
    addEventListener: () => {},
    querySelector: () => null,
    getElementById: id => id === 'markdown-editor' ? { value: editorContent } : null
  },
  window: { addEventListener: () => {}, innerWidth: 1280, innerHeight: 800 }
};
sandbox.globalThis = sandbox;
vm.runInNewContext(schemaSource, sandbox);
vm.runInNewContext(converterSource, sandbox);
vm.runInNewContext(`${sidepanelSource}\nglobalThis.SidePanelManager = SidePanelManager;`, sandbox);

function createManager() {
  const manager = Object.create(sandbox.SidePanelManager.prototype);
  manager.session = {
    sessionId: 'session-42',
    pageTitle: 'Checkout Demo',
    pageUrl: 'https://example.com/checkout',
    steps: [{ type: 'click', selector: '#continue', elementName: 'Continue' }]
  };
  manager._ensureEditorContentFresh = () => {};
  manager._t = key => key;
  manager.errors = [];
  manager._showError = message => manager.errors.push(message);
  manager.downloads = [];
  manager._downloadBlob = (filename, blob) => manager.downloads.push({ filename, blob });
  return manager;
}

(async () => {
  const manager = createManager();
  manager.exportExecutableWorkflow();

  assert.deepEqual(manager.downloads.map(item => item.filename), [
    'Checkout_ Demo _ Flow.md',
    'Checkout_ Demo _ Flow.smartpages.json'
  ]);
  assert.equal(manager.downloads[0].blob.type, 'text/markdown;charset=utf-8');
  assert.equal(manager.downloads[1].blob.type, 'application/json;charset=utf-8');

  const markdown = await manager.downloads[0].blob.text();
  const jsonText = await manager.downloads[1].blob.text();
  const workflow = JSON.parse(jsonText);
  assert.ok(jsonText.endsWith('\n'));
  assert.match(markdown, /^<!-- SmartPages Workflow: Workflow ID=checkout-demo-flow; Version=1; JSON=Checkout_ Demo _ Flow\.smartpages\.json -->\n/);
  assert.ok(markdown.endsWith(editorContent));
  assert.equal(workflow.workflowId, 'checkout-demo-flow');
  assert.equal(workflow.workflowVersion, 1);
  assert.equal(workflow.title, 'Checkout_ Demo _ Flow');
  assert.equal(workflow.allowedOrigins[0], 'https://example.com');

  editorContent = '   ';
  const emptyContent = createManager();
  emptyContent.exportExecutableWorkflow();
  assert.equal(emptyContent.downloads.length, 0);
  assert.match(emptyContent.errors[0], /WORKFLOW_EXPORT_EMPTY_CONTENT/);

  editorContent = '# Valid';
  const emptySession = createManager();
  emptySession.session.steps = [];
  emptySession.exportExecutableWorkflow();
  assert.equal(emptySession.downloads.length, 0);
  assert.match(emptySession.errors[0], /WORKFLOW_EXPORT_EMPTY_SESSION/);

  const originalConverter = sandbox.SmartPagesWorkflowConverter;
  sandbox.SmartPagesWorkflowConverter = {
    convertSession: () => ({ workflow: { schemaVersion: '1.0' } })
  };
  const invalid = createManager();
  invalid.exportExecutableWorkflow();
  assert.equal(invalid.downloads.length, 0);
  assert.match(invalid.errors[0], /WORKFLOW_EXPORT_INVALID/);

  sandbox.SmartPagesWorkflowConverter = {
    convertSession: () => {
      const error = new Error('converter details');
      error.code = 'CONVERTER_BROKE';
      throw error;
    }
  };
  const conversionFailure = createManager();
  conversionFailure.exportExecutableWorkflow();
  assert.equal(conversionFailure.downloads.length, 0);
  assert.match(conversionFailure.errors[0], /^WORKFLOW_EXPORT_CONVERSION:/);
  sandbox.SmartPagesWorkflowConverter = originalConverter;
})().catch(error => {
  console.error(error);
  process.exit(1);
});
