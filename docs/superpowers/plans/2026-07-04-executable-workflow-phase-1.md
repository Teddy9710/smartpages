# SmartPages Executable Workflow Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a versioned SmartPages workflow JSON export and safe manual replay of seven basic actions inside the extension.

**Architecture:** Pure workflow modules validate and convert recorded sessions. The side panel exports the Markdown and JSON pair, while the background service worker owns run state and injects a content-script replayer into the selected tab. The replayer executes one validated step at a time and returns a structured result; the background never marks a step complete until its postcondition passes.

**Tech Stack:** Chrome Extension Manifest V3, vanilla JavaScript, Chrome messaging/scripting/downloads APIs, Node `assert` + `vm` test harness, Vite copy build.

---

## Scope

This plan implements specification phase one only: Schema, Session conversion, dual export, extension-local replay, seven basic actions, conditions, origin enforcement, run state, confirmation pause, and logs. Native Messaging/MCP belongs to phase two. Semantic fallback beyond exact recorded selector plus unique role/name belongs to phase three.

## File Map

- Create `workflow/schema.js`: constants, validation, origin matching, and risk normalization.
- Create `workflow/converter.js`: deterministic Session-to-Workflow conversion and variable references.
- Create `content/workflow-replayer.js`: page-side element lookup, condition checks, and one-step execution.
- Create `tests/workflow-schema.test.js`: Schema rejection and normalization tests.
- Create `tests/workflow-converter.test.js`: conversion and sensitive-input tests.
- Create `tests/workflow-replayer.test.js`: action, ambiguity, condition, and origin tests.
- Create `tests/background-workflow-run.test.js`: run-state and confirmation-routing tests.
- Create `tests/sidepanel-workflow-export.test.js`: dual-export wiring and file-name tests.
- Modify `vite.config.js`: copy the new `workflow/` directory.
- Modify `sidepanel/sidepanel.html`: load workflow modules and add export/replay controls.
- Modify `sidepanel/sidepanel.js`: build/export workflows and control local runs.
- Modify `sidepanel/sidepanel.css`: style workflow controls and run status.
- Modify `background/background.js`: own workflow runs and route replay messages.
- Modify `README.md` and `README.en.md`: document executable workflow preview and limits.

### Task 1: Versioned workflow Schema

**Files:**
- Create: `workflow/schema.js`
- Create: `tests/workflow-schema.test.js`
- Modify: `vite.config.js`

- [ ] **Step 1: Write the failing Schema tests**

```js
// tests/workflow-schema.test.js
const assert = require('node:assert/strict');
const { loadBrowserScript } = require('./workflow-test-helpers');
const api = loadBrowserScript('workflow/schema.js', 'SmartPagesWorkflowSchema');

const valid = {
  schemaVersion: '1.0', workflowId: 'wf-1', workflowVersion: 1,
  title: 'Create customer', allowedOrigins: ['https://example.com'],
  variables: [], steps: [{
    id: 'step-1', action: 'click', target: { selector: '#create' },
    precondition: { url: 'https://example.com/customers' },
    postcondition: { visible: '#form' }, risk: 'low'
  }]
};
assert.equal(api.validateWorkflow(valid).ok, true);
assert.equal(api.validateWorkflow({ ...valid, schemaVersion: '2.0' }).code, 'UNSUPPORTED_SCHEMA');
assert.equal(api.validateWorkflow({ ...valid, steps: [{ ...valid.steps[0], action: 'script' }] }).code, 'UNKNOWN_ACTION');
assert.equal(api.validateWorkflow({ ...valid, allowedOrigins: ['*'] }).code, 'INVALID_ORIGIN');
assert.equal(api.isOriginAllowed('https://example.com/a', valid.allowedOrigins), true);
assert.equal(api.isOriginAllowed('https://evil.example/a', valid.allowedOrigins), false);
```

Create the shared loader used by workflow tests:

```js
// tests/workflow-test-helpers.js
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
function loadBrowserScript(relativePath, exportName, extra = {}) {
  const sandbox = { console, URL, ...extra };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8'), sandbox);
  return sandbox[exportName];
}
module.exports = { loadBrowserScript };
```

- [ ] **Step 2: Run the test and verify the missing module failure**

Run: `node tests/workflow-schema.test.js`

Expected: FAIL with `ENOENT` for `workflow/schema.js`.

- [ ] **Step 3: Implement strict validation**

```js
// workflow/schema.js
(function(root) {
  const VERSION = '1.0';
  const ACTIONS = new Set(['navigate', 'click', 'input', 'select', 'scroll', 'wait', 'assert']);
  const RISKS = new Set(['low', 'medium', 'high']);
  const fail = (code, message) => ({ ok: false, code, message });

  function isOrigin(value) {
    try {
      const url = new URL(value);
      return (url.protocol === 'http:' || url.protocol === 'https:') && url.origin === value;
    } catch (_) { return false; }
  }

  function validateWorkflow(workflow) {
    if (!workflow || typeof workflow !== 'object' || Array.isArray(workflow)) return fail('INVALID_WORKFLOW', 'Workflow must be an object');
    if (workflow.schemaVersion !== VERSION) return fail('UNSUPPORTED_SCHEMA', `Expected schema ${VERSION}`);
    if (!workflow.workflowId || !Number.isInteger(workflow.workflowVersion) || workflow.workflowVersion < 1) return fail('INVALID_IDENTITY', 'workflowId and positive workflowVersion are required');
    if (!Array.isArray(workflow.allowedOrigins) || !workflow.allowedOrigins.length || !workflow.allowedOrigins.every(isOrigin)) return fail('INVALID_ORIGIN', 'allowedOrigins must contain exact HTTP(S) origins');
    if (!Array.isArray(workflow.variables) || !Array.isArray(workflow.steps) || !workflow.steps.length) return fail('INVALID_COLLECTIONS', 'variables and non-empty steps are required');
    const ids = new Set();
    for (const step of workflow.steps) {
      if (!step?.id || ids.has(step.id)) return fail('INVALID_STEP_ID', 'Step IDs must be unique');
      ids.add(step.id);
      if (!ACTIONS.has(step.action)) return fail('UNKNOWN_ACTION', `Unsupported action: ${step.action}`);
      if (!RISKS.has(step.risk)) return fail('INVALID_RISK', `Invalid risk: ${step.risk}`);
      if (step.action !== 'navigate' && !step.target && !['wait', 'assert', 'scroll'].includes(step.action)) return fail('MISSING_TARGET', `Target required for ${step.action}`);
    }
    return { ok: true, workflow };
  }

  function isOriginAllowed(url, origins) {
    try { return origins.includes(new URL(url).origin); } catch (_) { return false; }
  }

  root.SmartPagesWorkflowSchema = Object.freeze({ VERSION, ACTIONS: [...ACTIONS], validateWorkflow, isOriginAllowed });
})(globalThis);
```

- [ ] **Step 4: Copy workflow scripts in builds and verify**

Add `{ src: 'workflow', dest: '.' }` to `copyTargets` in `vite.config.js`, then run:

`node tests/workflow-schema.test.js`

Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add workflow/schema.js tests/workflow-schema.test.js tests/workflow-test-helpers.js vite.config.js
git commit -m "feat: define executable workflow schema"
```

### Task 2: Convert recorded Sessions into workflows

**Files:**
- Create: `workflow/converter.js`
- Create: `tests/workflow-converter.test.js`

- [ ] **Step 1: Write conversion tests**

```js
// tests/workflow-converter.test.js
const assert = require('node:assert/strict');
const { loadBrowserScript } = require('./workflow-test-helpers');
const converter = loadBrowserScript('workflow/converter.js', 'SmartPagesWorkflowConverter');
const session = { sessionId: 'session-1', pageUrl: 'https://example.com/customers', pageTitle: 'Customers', steps: [
  { type: 'click', selector: '#new', elementRole: 'button', elementName: 'New', tagName: 'button', action: 'Open form' },
  { type: 'input', selector: '#name', elementRole: 'textbox', elementName: 'Name', formValue: { value: 'Alice' }, action: 'Enter name' },
  { type: 'click', selector: '#save', elementRole: 'button', elementName: 'Save', tagName: 'button', action: 'Save customer' }
] };
const result = converter.convertSession(session, { title: 'Create customer', now: '2026-07-04T00:00:00.000Z' });
assert.equal(result.workflow.allowedOrigins[0], 'https://example.com');
assert.deepEqual(result.workflow.steps.map(step => step.action), ['click', 'input', 'click']);
assert.equal(result.workflow.steps[2].risk, 'high');
assert.equal(result.workflow.steps[1].input.variable, 'name');
assert.equal(result.workflow.variables[0].name, 'name');
assert.equal(JSON.stringify(result.workflow).includes('Alice'), false);
assert.match(result.markdownLink, /\.smartpages\.json/);
```

- [ ] **Step 2: Run and verify failure**

Run: `node tests/workflow-converter.test.js`

Expected: FAIL with missing `workflow/converter.js`.

- [ ] **Step 3: Implement deterministic conversion**

Implement `convertSession(session, options)` as a pure function. Map `change` on a select to `select`, input/change on other controls to `input`, clicks to `click`, navigation to `navigate`, and recorded scrolls to `scroll`. Build targets from `selector`, `rawSelector`, `elementRole`, `elementName`, `text`, `tagName`, and `elementType`. Convert form values into variable references; never copy recorded values.

```js
(function(root) {
  const slug = value => String(value || 'workflow').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'workflow';
  const actionOf = step => step.type === 'navigate' ? 'navigate' : step.type === 'scroll' ? 'scroll' :
    (step.type === 'input' || step.type === 'change') ? ((step.tagName === 'select' || step.elementRole === 'combobox') ? 'select' : 'input') : 'click';
  const isHighRisk = step => /submit|save|send|delete|remove|pay|purchase|confirm|提交|保存|发送|删除|支付|确认/i.test(`${step.elementType || ''} ${step.elementName || ''} ${step.action || ''}`);
  const variableName = (step, index) => slug(step.elementName || step.text || `input-${index + 1}`).replace(/-/g, '_');

  function convertSession(session, options = {}) {
    if (!session?.steps?.length) throw new Error('EMPTY_SESSION');
    const origin = new URL(session.pageUrl).origin;
    const title = options.title || session.pageTitle || 'SmartPages workflow';
    const variables = [];
    const steps = session.steps.map((recorded, index) => {
      const action = actionOf(recorded);
      const step = {
        id: `step-${index + 1}`, action,
        target: { selector: recorded.selector || '', rawSelector: recorded.rawSelector || '', role: recorded.elementRole || '', name: recorded.elementName || recorded.text || '', tagName: recorded.tagName || '' },
        precondition: index === 0 ? { url: session.pageUrl } : {}, postcondition: {},
        risk: isHighRisk(recorded) ? 'high' : 'low', description: recorded.action || `${action} step`
      };
      if (action === 'navigate') step.input = { url: recorded.to || session.pageUrl };
      if (action === 'input' || action === 'select') {
        const name = variableName(recorded, index);
        if (!variables.some(item => item.name === name)) variables.push({ name, required: true, secret: /password|token|secret|密码|密钥/i.test(name) });
        step.input = { variable: name };
      }
      if (action === 'scroll') step.input = { x: recorded.scroll?.x || recorded.x || 0, y: recorded.scroll?.y || recorded.y || 0 };
      return step;
    });
    const id = slug(options.workflowId || session.sessionId || title);
    return { workflow: { schemaVersion: '1.0', workflowId: id, workflowVersion: 1, title, generatedAt: options.now || new Date().toISOString(), allowedOrigins: [origin], variables, steps }, markdownLink: `${id}.smartpages.json` };
  }
  root.SmartPagesWorkflowConverter = Object.freeze({ convertSession });
})(globalThis);
```

- [ ] **Step 4: Run both workflow tests**

Run: `node tests/workflow-schema.test.js && node tests/workflow-converter.test.js`

Expected: both exit 0.

- [ ] **Step 5: Commit**

```bash
git add workflow/converter.js tests/workflow-converter.test.js
git commit -m "feat: convert recordings into workflows"
```

### Task 3: Add dual-product export to the side panel

**Files:**
- Modify: `sidepanel/sidepanel.html`
- Modify: `sidepanel/sidepanel.js`
- Modify: `sidepanel/sidepanel.css`
- Create: `tests/sidepanel-workflow-export.test.js`

- [ ] **Step 1: Write the failing export test**

Load `workflow/schema.js`, `workflow/converter.js`, and `sidepanel/sidepanel.js` in a VM sandbox. Stub `_downloadBlob` to collect file names, set a Session plus Markdown editor content, call `exportExecutableWorkflow()`, and assert the collected names are `create-customer.md` and `create-customer.smartpages.json`. Assert both payloads contain the same `workflowId`.

```js
assert.deepEqual(downloads.map(item => item.name), ['create-customer.md', 'create-customer.smartpages.json']);
assert.match(downloads[0].text, /Workflow ID: create-customer/);
assert.equal(JSON.parse(downloads[1].text).workflowId, 'create-customer');
```

- [ ] **Step 2: Run and verify method-not-found failure**

Run: `node tests/sidepanel-workflow-export.test.js`

Expected: FAIL because `exportExecutableWorkflow` is not defined.

- [ ] **Step 3: Add scripts and the export button**

Before `sidepanel.js` in `sidepanel.html`, load:

```html
<script src="../workflow/schema.js"></script>
<script src="../workflow/converter.js"></script>
```

Add beside the normal download control:

```html
<button id="btn-export-workflow" class="btn-tool" title="导出可执行工作流">
  <span aria-hidden="true">JSON</span> 工作流
</button>
```

- [ ] **Step 4: Implement export without changing normal document download**

Bind `btn-export-workflow` in `_bindEvents`. Implement `exportExecutableWorkflow()` to call `convertSession`, validate the result, prepend this metadata to the current Markdown, and call `_downloadBlob` twice:

```js
const metadata = `<!-- SmartPages Workflow ID: ${workflow.workflowId}; Version: ${workflow.workflowVersion}; File: ${base}.smartpages.json -->\n\n`;
this._downloadBlob(`${base}.md`, new Blob([metadata + markdown], { type: 'text/markdown;charset=utf-8' }));
this._downloadBlob(`${base}.smartpages.json`, new Blob([JSON.stringify(workflow, null, 2) + '\n'], { type: 'application/json;charset=utf-8' }));
```

If conversion or validation fails, show the existing error state with a stable error code rather than downloading a partial pair.

- [ ] **Step 5: Style and localize the control**

Reuse `.btn-tool`; add only a narrow JSON badge rule and English/Chinese strings in the existing translation objects. Do not redesign the toolbar.

- [ ] **Step 6: Verify tests and build**

Run: `node tests/sidepanel-workflow-export.test.js && npm run build`

Expected: test exits 0; build completes and `dist/workflow/schema.js` plus `dist/workflow/converter.js` exist.

- [ ] **Step 7: Commit**

```bash
git add sidepanel/ workflow/ tests/sidepanel-workflow-export.test.js vite.config.js
git commit -m "feat: export executable workflow pair"
```

### Task 4: Execute and verify one step in the page

**Files:**
- Create: `content/workflow-replayer.js`
- Create: `tests/workflow-replayer.test.js`

- [ ] **Step 1: Write failing tests for page execution**

Use a small fake DOM with exact selector lookups and role/name candidates. Cover: exact-selector click, input value plus `input`/`change` events, unique role/name fallback, ambiguous fallback, failed precondition, failed postcondition, disallowed navigation, wait upper bound, and unsupported action.

```js
assert.deepEqual(await replayer.executeStep(clickStep, context), { ok: true, code: 'STEP_COMPLETED' });
assert.equal((await replayer.executeStep(ambiguousStep, context)).code, 'AMBIGUOUS_TARGET');
assert.equal((await replayer.executeStep(crossOriginStep, context)).code, 'ORIGIN_NOT_ALLOWED');
```

- [ ] **Step 2: Run and verify missing module failure**

Run: `node tests/workflow-replayer.test.js`

Expected: FAIL with missing `content/workflow-replayer.js`.

- [ ] **Step 3: Implement a self-contained page replayer**

Expose `window.SmartPagesWorkflowReplayer` with `findTarget`, `checkCondition`, and `executeStep`. Exact selectors are tried first. Fallback collects elements matching `[role="..."]` and compares normalized accessible text; it succeeds only with one candidate. Implement actions using native DOM APIs:

```js
const handlers = {
  click: (element) => element.click(),
  input: (element, value) => { element.focus(); element.value = String(value); element.dispatchEvent(new Event('input', { bubbles: true })); element.dispatchEvent(new Event('change', { bubbles: true })); },
  select: (element, value) => { element.value = String(value); element.dispatchEvent(new Event('change', { bubbles: true })); },
  scroll: (_element, input) => window.scrollTo(Number(input.x) || 0, Number(input.y) || 0),
  wait: async (_element, input) => new Promise(resolve => setTimeout(resolve, Math.min(Math.max(Number(input.ms) || 0, 0), 10000))),
  assert: () => {},
  navigate: (_element, input) => { location.assign(input.url); }
};
```

Resolve `{ variable: name }` from `context.variables`. Check `precondition` before and `postcondition` after the handler. Return only serializable objects with stable codes.

- [ ] **Step 4: Add a singleton message listener**

Handle `WORKFLOW_EXECUTE_STEP` and return the awaited step result. Store the listener at `window.smartPagesWorkflowReplayListener` and remove an older instance before registering, matching the recorder singleton pattern.

- [ ] **Step 5: Run the replayer test**

Run: `node tests/workflow-replayer.test.js`

Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add content/workflow-replayer.js tests/workflow-replayer.test.js
git commit -m "feat: replay verified workflow steps"
```

### Task 5: Add background-owned run state

**Files:**
- Modify: `background/background.js`
- Create: `tests/background-workflow-run.test.js`

- [ ] **Step 1: Write failing state-machine tests**

Load the background script with stubbed Chrome APIs. Assert:

```js
assert.equal((await manager.start(workflow, variables, 17)).status, 'WAITING_CONFIRMATION');
assert.equal(manager.getStatus().currentStepId, 'step-3');
assert.equal((await manager.resume({ approved: false })).status, 'CANCELLED');
assert.equal(sentMessages.some(message => message.type === 'WORKFLOW_EXECUTE_STEP'), true);
```

Also test invalid workflow, wrong origin, execute failure, postcondition failure, cancel, and successful completion.

- [ ] **Step 2: Run and verify the missing manager failure**

Run: `node tests/background-workflow-run.test.js`

Expected: FAIL because `WorkflowRunManager` is absent.

- [ ] **Step 3: Implement `WorkflowRunManager`**

Keep a single active run with `runId`, `workflow`, `variables`, `tabId`, `status`, `nextStepIndex`, `pendingStep`, and append-only `logs`. `start` validates input and tab origin. `_advance` loops through low-risk steps but stops before every `high` step with `WAITING_CONFIRMATION`. `resume({ approved })` either executes the pending step or cancels. A completed step increments `nextStepIndex` only after receiving `{ ok: true }`.

- [ ] **Step 4: Inject and message the replayer**

Add `_ensureWorkflowReplayer(tabId)` using:

```js
await chrome.scripting.executeScript({ target: { tabId }, files: ['workflow/schema.js', 'content/workflow-replayer.js'] });
```

Send one `WORKFLOW_EXECUTE_STEP` message per action, with resolved variables and `allowedOrigins`. Do not send the entire remaining workflow to the page.

- [ ] **Step 5: Add background message routes**

Add `WORKFLOW_START_RUN`, `WORKFLOW_RESUME_RUN`, `WORKFLOW_GET_RUN_STATUS`, and `WORKFLOW_CANCEL_RUN` to a dedicated route list. Return manager results through the existing asynchronous message handler.

- [ ] **Step 6: Run background and existing tests**

Run: `node tests/background-workflow-run.test.js && npm test`

Expected: new test exits 0 and the full test runner reports all test files passed.

- [ ] **Step 7: Commit**

```bash
git add background/background.js tests/background-workflow-run.test.js
git commit -m "feat: manage local workflow runs"
```

### Task 6: Add manual replay and confirmation UI

**Files:**
- Modify: `sidepanel/sidepanel.html`
- Modify: `sidepanel/sidepanel.js`
- Modify: `sidepanel/sidepanel.css`
- Create: `tests/sidepanel-workflow-run.test.js`

- [ ] **Step 1: Write failing UI-controller tests**

Stub `chrome.runtime.sendMessage` and `chrome.tabs.query`. Assert the side panel sends `WORKFLOW_START_RUN` with the active tab, renders `WAITING_CONFIRMATION` without auto-resuming, sends an explicit approved/denied response, displays the current step description, and disables duplicate start clicks.

- [ ] **Step 2: Run and verify missing methods**

Run: `node tests/sidepanel-workflow-run.test.js`

Expected: FAIL because `startWorkflowReplay` and confirmation handlers do not exist.

- [ ] **Step 3: Add compact replay UI**

Add a “测试运行” button next to workflow export and a hidden run panel containing status, current step, approve, reject, and cancel buttons. The confirmation text must include site origin, action, target name, and variable name; do not render secret values.

- [ ] **Step 4: Implement run-controller methods**

Implement `startWorkflowReplay`, `_renderWorkflowRun`, `approveWorkflowStep`, `rejectWorkflowStep`, and `cancelWorkflowRun`. Build and validate the Workflow locally before sending it. Query the active tab once at start. Polling is unnecessary in phase one: update from each command response and listen for `WORKFLOW_RUN_CHANGED` notifications.

- [ ] **Step 5: Add accessible styles**

Use the current spacing/color variables. Confirmation buttons must have visible focus states; the dangerous approve button uses the existing danger palette, and the run panel remains usable at the side panel's narrow width.

- [ ] **Step 6: Run focused and full verification**

Run: `node tests/sidepanel-workflow-run.test.js && npm test && npm run typecheck`

Expected: all commands exit 0.

- [ ] **Step 7: Commit**

```bash
git add sidepanel/ tests/sidepanel-workflow-run.test.js
git commit -m "feat: add manual workflow replay controls"
```

### Task 7: Security regression coverage and documentation

**Files:**
- Create: `tests/workflow-security.test.js`
- Modify: `README.md`
- Modify: `README.en.md`

- [ ] **Step 1: Write security regression tests**

Assert exported JSON never contains recorded input values, unknown actions are rejected, wildcard/file/extension origins are rejected, high-risk steps stop before dispatch, secret variables are omitted from logs, and cross-origin navigation never calls `location.assign`.

- [ ] **Step 2: Run the test before fixes**

Run: `node tests/workflow-security.test.js`

Expected: FAIL on any uncovered security invariant; if all already pass, record the passing output and do not add production code merely to force a failure.

- [ ] **Step 3: Make the minimum fixes required by the regression test**

Changes must stay within `workflow/schema.js`, `workflow/converter.js`, `content/workflow-replayer.js`, or the run manager. Do not add phase-two signing, MCP, or Native Messaging code.

- [ ] **Step 4: Document the preview feature and limits**

Add concise Chinese and English sections describing dual export, local manual replay, supported actions, exact-origin restriction, high-risk confirmation, and the explicit absence of MCP support in phase one.

- [ ] **Step 5: Run final verification**

Run: `npm run verify`

Expected: tests, lint, typecheck, and build all exit 0. Confirm `dist/workflow/schema.js`, `dist/workflow/converter.js`, and `dist/content/workflow-replayer.js` exist.

- [ ] **Step 6: Perform a manual smoke test**

Load `dist/` as an unpacked extension, record a three-step flow on a local fixture page, generate a document, export both products, start manual replay, verify the run pauses before a submit-like action, approve it, and inspect the completed structured log. Record the fixture URL and observed result in the commit message body or handoff notes.

- [ ] **Step 7: Commit**

```bash
git add workflow/ content/workflow-replayer.js background/background.js sidepanel/ tests/workflow-security.test.js README.md README.en.md
git commit -m "docs: describe executable workflow preview"
```

## Completion Gate

Phase one is complete only when `npm run verify` passes, the dual files share identity/version, unsafe JSON is rejected, no recorded secret value appears in exports or logs, manual replay completes a safe example, and high-risk actions demonstrably pause before execution. Do not start the MCP Bridge plan until these conditions hold.
