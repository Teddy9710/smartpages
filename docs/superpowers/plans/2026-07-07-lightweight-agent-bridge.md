# Lightweight Agent Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a lightweight local MCP bridge so external agents can list, start, inspect, and cancel SmartPages executable workflows through the browser extension.

**Architecture:** Add a repo-local `packages/smartpages-mcp` Node package that exposes MCP tools over stdio and forwards run requests to the SmartPages extension over a localhost WebSocket connection. The extension gets a focused background bridge client that connects to the local server, authenticates with a token, and delegates execution to the existing `WorkflowRunManager`.

**Tech Stack:** Node.js CommonJS, built-in `node:test`/`assert`, `ws` for localhost WebSocket, `@modelcontextprotocol/sdk` for MCP stdio, Chrome MV3 extension APIs, existing SmartPages workflow schema and tests.

---

## File Structure

Create:

- `packages/smartpages-mcp/package.json` — package metadata and local scripts for the MCP bridge.
- `packages/smartpages-mcp/src/index.js` — CLI entrypoint that starts MCP stdio and WebSocket bridge.
- `packages/smartpages-mcp/src/protocol.js` — shared message names, error codes, request/response helpers, and safe error normalization.
- `packages/smartpages-mcp/src/token-store.js` — local token creation/loading under `%LOCALAPPDATA%\SmartPages`.
- `packages/smartpages-mcp/src/workflow-store.js` — `.smartpages.json` discovery, schema validation, variable checks, and safe summaries.
- `packages/smartpages-mcp/src/bridge-server.js` — localhost WebSocket server, hello authentication, request forwarding, timeout handling, and extension connection state.
- `packages/smartpages-mcp/src/mcp-server.js` — MCP tool registration for `list_workflows`, `start_run`, `get_run_status`, and `cancel_run`.
- `tests/mcp-protocol.test.js` — protocol helper tests.
- `tests/mcp-token-store.test.js` — token path and persistence tests using temp directories.
- `tests/mcp-workflow-store.test.js` — workflow discovery, schema validation, invalid file, and missing variable tests.
- `tests/mcp-bridge-server.test.js` — WebSocket auth, forwarding, timeout, and disconnect tests.
- `tests/mcp-server-tools.test.js` — MCP tool handler tests using fake store and fake bridge.
- `background/agent-bridge-client.js` — extension WebSocket client and request dispatcher.
- `tests/background-agent-bridge-client.test.js` — bridge client unit tests with fake WebSocket and fake chrome APIs.

Modify:

- `package.json` — add workspace-style scripts for MCP tests and serving.
- `package-lock.json` — capture new dependencies after `npm install`.
- `background/background.js` — import bridge client and expose a small runner adapter around existing workflow messages.
- `manifest.json` — add `connect-src ws://127.0.0.1:* ws://localhost:*` to extension CSP if required by MV3 WebSocket use.
- `settings/settings.html` — add local Agent Bridge settings section.
- `settings/settings.js` — save bridge config, test connection, and show connection state.
- `settings/settings.css` — style bridge status and fields.
- `tests/settings-agent-bridge.test.js` — settings persistence and validation tests.
- `README.md` and `README.en.md` — document lightweight MCP usage.

---

## Task 1: MCP Package Skeleton and Protocol Helpers

**Files:**

- Create: `packages/smartpages-mcp/package.json`
- Create: `packages/smartpages-mcp/src/protocol.js`
- Create: `packages/smartpages-mcp/src/index.js`
- Create: `tests/mcp-protocol.test.js`
- Modify: `package.json`

- [ ] **Step 1: Add failing protocol tests**

Create `tests/mcp-protocol.test.js`:

```js
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
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
node tests/mcp-protocol.test.js
```

Expected: FAIL with `Cannot find module '../packages/smartpages-mcp/src/protocol'`.

- [ ] **Step 3: Create package skeleton**

Create `packages/smartpages-mcp/package.json`:

```json
{
  "name": "smartpages-mcp",
  "version": "0.1.0",
  "private": true,
  "description": "Local MCP bridge for SmartPages executable workflows",
  "main": "src/index.js",
  "bin": {
    "smartpages-mcp": "src/index.js"
  },
  "type": "commonjs",
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.17.0",
    "ws": "^8.18.0"
  }
}
```

Create `packages/smartpages-mcp/src/protocol.js`:

```js
'use strict';

const PROTOCOL_VERSION = 1;

const ERROR_CODES = Object.freeze({
  WORKFLOW_NOT_FOUND: 'WORKFLOW_NOT_FOUND',
  WORKFLOW_INVALID: 'WORKFLOW_INVALID',
  MISSING_VARIABLES: 'MISSING_VARIABLES',
  EXTENSION_OFFLINE: 'EXTENSION_OFFLINE',
  EXTENSION_DISCONNECTED: 'EXTENSION_DISCONNECTED',
  BRIDGE_AUTH_FAILED: 'BRIDGE_AUTH_FAILED',
  PROTOCOL_VERSION_UNSUPPORTED: 'PROTOCOL_VERSION_UNSUPPORTED',
  ORIGIN_MISMATCH: 'ORIGIN_MISMATCH',
  RUN_NOT_FOUND: 'RUN_NOT_FOUND',
  RUN_ALREADY_ACTIVE: 'RUN_ALREADY_ACTIVE',
  RUN_CANCELLED: 'RUN_CANCELLED',
  RUN_FAILED: 'RUN_FAILED',
  TIMEOUT: 'TIMEOUT',
  INVALID_PARAMETERS: 'INVALID_PARAMETERS'
});

function createRequest(type, payload = {}, id = `msg_${Date.now()}_${Math.random().toString(16).slice(2)}`) {
  return { id, type, payload };
}

function createSuccess(id, payload = {}) {
  return { id, ok: true, payload };
}

function createError(id, code, message) {
  return {
    id,
    ok: false,
    error: {
      code: String(code || ERROR_CODES.RUN_FAILED),
      message: String(message || 'SmartPages bridge request failed.')
    }
  };
}

function normalizeError(error) {
  if (!error) {
    return { code: ERROR_CODES.RUN_FAILED, message: 'Unknown SmartPages bridge error.' };
  }
  if (error.code || error.message) {
    return {
      code: String(error.code || ERROR_CODES.RUN_FAILED),
      message: String(error.message || 'SmartPages bridge request failed.')
    };
  }
  return { code: ERROR_CODES.RUN_FAILED, message: String(error) };
}

module.exports = {
  PROTOCOL_VERSION,
  ERROR_CODES,
  createRequest,
  createSuccess,
  createError,
  normalizeError
};
```

Create `packages/smartpages-mcp/src/index.js`:

```js
#!/usr/bin/env node
'use strict';

async function main() {
  console.error('smartpages-mcp is not fully wired yet. Run implementation tasks in order.');
}

if (require.main === module) {
  main().catch(error => {
    console.error(error?.stack || error?.message || String(error));
    process.exit(1);
  });
}

module.exports = { main };
```

- [ ] **Step 4: Add root scripts**

Modify root `package.json` scripts:

```json
{
  "scripts": {
    "mcp:serve": "node packages/smartpages-mcp/src/index.js",
    "test:mcp": "node tests/mcp-protocol.test.js && node tests/mcp-token-store.test.js && node tests/mcp-workflow-store.test.js && node tests/mcp-bridge-server.test.js && node tests/mcp-server-tools.test.js"
  }
}
```

Preserve all existing scripts.

- [ ] **Step 5: Install package dependencies**

Run:

```bash
npm install
```

Expected: `package-lock.json` updates with `ws` and `@modelcontextprotocol/sdk`.

- [ ] **Step 6: Run protocol test**

Run:

```bash
node tests/mcp-protocol.test.js
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json packages/smartpages-mcp tests/mcp-protocol.test.js
git commit -m "feat: scaffold smartpages mcp bridge"
```

---

## Task 2: Token Store

**Files:**

- Create: `packages/smartpages-mcp/src/token-store.js`
- Create: `tests/mcp-token-store.test.js`

- [ ] **Step 1: Add failing token tests**

Create `tests/mcp-token-store.test.js`:

```js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { getSmartPagesDir, loadOrCreateToken } = require('../packages/smartpages-mcp/src/token-store');

test('getSmartPagesDir prefers SMARTPAGES_HOME', () => {
  const dir = path.join(os.tmpdir(), `sp-home-${Date.now()}`);
  assert.equal(getSmartPagesDir({ SMARTPAGES_HOME: dir }), dir);
});

test('loadOrCreateToken persists a reusable token', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'smartpages-token-'));
  const env = { SMARTPAGES_HOME: root };

  const first = loadOrCreateToken({ env });
  const second = loadOrCreateToken({ env });

  assert.equal(first.token, second.token);
  assert.equal(first.filePath, path.join(root, 'bridge-token.json'));
  assert.match(first.token, /^[a-f0-9]{64}$/);
});
```

- [ ] **Step 2: Run failing test**

Run:

```bash
node tests/mcp-token-store.test.js
```

Expected: FAIL with missing module.

- [ ] **Step 3: Implement token store**

Create `packages/smartpages-mcp/src/token-store.js`:

```js
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function getSmartPagesDir(env = process.env) {
  if (env.SMARTPAGES_HOME) return env.SMARTPAGES_HOME;
  if (env.LOCALAPPDATA) return path.join(env.LOCALAPPDATA, 'SmartPages');
  return path.join(os.homedir(), '.smartpages');
}

function loadOrCreateToken(options = {}) {
  const env = options.env || process.env;
  const root = getSmartPagesDir(env);
  fs.mkdirSync(root, { recursive: true });
  const filePath = path.join(root, 'bridge-token.json');

  if (fs.existsSync(filePath)) {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (typeof parsed.token === 'string' && parsed.token.length >= 32) {
      return { token: parsed.token, filePath, created: false };
    }
  }

  const token = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(filePath, JSON.stringify({ token, createdAt: new Date().toISOString() }, null, 2));
  return { token, filePath, created: true };
}

module.exports = {
  getSmartPagesDir,
  loadOrCreateToken
};
```

- [ ] **Step 4: Run token tests**

Run:

```bash
node tests/mcp-token-store.test.js
```

Expected: PASS.

- [ ] **Step 5: Run MCP tests so far**

Run:

```bash
node tests/mcp-protocol.test.js && node tests/mcp-token-store.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/smartpages-mcp/src/token-store.js tests/mcp-token-store.test.js
git commit -m "feat: persist smartpages bridge token"
```

---

## Task 3: Workflow Store

**Files:**

- Create: `packages/smartpages-mcp/src/workflow-store.js`
- Create: `tests/mcp-workflow-store.test.js`

- [ ] **Step 1: Add failing workflow store tests**

Create `tests/mcp-workflow-store.test.js`:

```js
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
```

- [ ] **Step 2: Run failing test**

Run:

```bash
node tests/mcp-workflow-store.test.js
```

Expected: FAIL with missing module.

- [ ] **Step 3: Implement workflow store**

Create `packages/smartpages-mcp/src/workflow-store.js`:

```js
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const schema = require('../../../workflow/schema.js');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function summarizeWorkflow(workflow, fileName) {
  return {
    workflowId: workflow.workflowId,
    workflowVersion: workflow.workflowVersion,
    title: workflow.title || workflow.workflowId,
    fileName,
    allowedOrigins: [...workflow.allowedOrigins],
    variables: (workflow.variables || []).map(variable => ({
      name: variable.name,
      required: variable.required === true,
      secret: variable.secret === true
    })),
    stepCount: workflow.steps.length,
    hasHighRiskSteps: workflow.steps.some(step => step.risk === 'high')
  };
}

function listWorkflows(workflowDir) {
  ensureDir(workflowDir);
  const workflows = [];
  const invalidWorkflows = [];

  for (const fileName of fs.readdirSync(workflowDir).sort()) {
    if (!fileName.endsWith('.smartpages.json')) continue;
    const filePath = path.join(workflowDir, fileName);
    try {
      const workflow = readJson(filePath);
      const validation = schema.validateWorkflow(workflow);
      if (!validation.ok) {
        invalidWorkflows.push({ fileName, code: validation.code, message: validation.message });
        continue;
      }
      workflows.push(summarizeWorkflow(validation.workflow, fileName));
    } catch (error) {
      invalidWorkflows.push({ fileName, code: 'WORKFLOW_INVALID', message: error.message });
    }
  }

  return { workflows, invalidWorkflows };
}

function loadWorkflow(workflowDir, workflowId, workflowVersion) {
  ensureDir(workflowDir);
  for (const fileName of fs.readdirSync(workflowDir).sort()) {
    if (!fileName.endsWith('.smartpages.json')) continue;
    const filePath = path.join(workflowDir, fileName);
    const workflow = readJson(filePath);
    const validation = schema.validateWorkflow(workflow);
    if (!validation.ok) continue;
    if (workflow.workflowId === workflowId && workflow.workflowVersion === workflowVersion) {
      return { workflow, fileName };
    }
  }
  return null;
}

function validateVariables(workflow, variables = {}) {
  const missing = (workflow.variables || [])
    .filter(variable => variable.required === true && !Object.hasOwn(variables, variable.name))
    .map(variable => variable.name);
  return missing.length > 0 ? { ok: false, missing } : { ok: true };
}

module.exports = {
  listWorkflows,
  loadWorkflow,
  validateVariables
};
```

- [ ] **Step 4: Fix schema import for CommonJS if needed**

If `require('../../../workflow/schema.js')` does not return `validateWorkflow`, update `workflow/schema.js` export block at the bottom to support CommonJS tests:

```js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = globalThis.SmartPagesWorkflowSchema;
}
```

Run existing workflow schema tests after this change.

- [ ] **Step 5: Run workflow store tests**

Run:

```bash
node tests/mcp-workflow-store.test.js
```

Expected: PASS.

- [ ] **Step 6: Run schema regression**

Run:

```bash
node tests/workflow-schema.test.js
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/smartpages-mcp/src/workflow-store.js tests/mcp-workflow-store.test.js workflow/schema.js
git commit -m "feat: load smartpages workflow files"
```

---

## Task 4: WebSocket Bridge Server

**Files:**

- Create: `packages/smartpages-mcp/src/bridge-server.js`
- Create: `tests/mcp-bridge-server.test.js`

- [ ] **Step 1: Add failing bridge server tests**

Create `tests/mcp-bridge-server.test.js`:

```js
const assert = require('node:assert/strict');
const test = require('node:test');
const WebSocket = require('ws');

const { BridgeServer } = require('../packages/smartpages-mcp/src/bridge-server');
const { PROTOCOL_VERSION } = require('../packages/smartpages-mcp/src/protocol');

function waitForOpen(ws) {
  return new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });
}

function nextMessage(ws) {
  return new Promise(resolve => {
    ws.once('message', data => resolve(JSON.parse(String(data))));
  });
}

test('BridgeServer authenticates hello and forwards requests', async () => {
  const server = new BridgeServer({ token: 'secret', port: 0, requestTimeoutMs: 500 });
  await server.start();
  const ws = new WebSocket(`ws://127.0.0.1:${server.port}`);
  await waitForOpen(ws);

  ws.send(JSON.stringify({ type: 'hello', protocolVersion: PROTOCOL_VERSION, extensionId: 'ext', token: 'secret' }));
  assert.equal((await nextMessage(ws)).type, 'helloAck');

  const pending = server.forward('getRunStatus', { runId: 'run_1' });
  const request = await nextMessage(ws);
  assert.equal(request.type, 'getRunStatus');
  ws.send(JSON.stringify({ id: request.id, ok: true, payload: { status: 'COMPLETED' } }));

  assert.deepEqual(await pending, { status: 'COMPLETED' });
  ws.close();
  await server.stop();
});

test('BridgeServer rejects wrong token', async () => {
  const server = new BridgeServer({ token: 'secret', port: 0, requestTimeoutMs: 500 });
  await server.start();
  const ws = new WebSocket(`ws://127.0.0.1:${server.port}`);
  await waitForOpen(ws);

  const closed = new Promise(resolve => ws.once('close', resolve));
  ws.send(JSON.stringify({ type: 'hello', protocolVersion: PROTOCOL_VERSION, extensionId: 'ext', token: 'bad' }));
  await closed;

  assert.equal(server.isExtensionConnected(), false);
  await server.stop();
});

test('BridgeServer fails fast when extension is offline', async () => {
  const server = new BridgeServer({ token: 'secret', port: 0, requestTimeoutMs: 50 });
  await server.start();
  await assert.rejects(
    () => server.forward('getRunStatus', { runId: 'run_1' }),
    /EXTENSION_OFFLINE/
  );
  await server.stop();
});
```

- [ ] **Step 2: Run failing bridge tests**

Run:

```bash
node tests/mcp-bridge-server.test.js
```

Expected: FAIL with missing module.

- [ ] **Step 3: Implement bridge server**

Create `packages/smartpages-mcp/src/bridge-server.js`:

```js
'use strict';

const WebSocket = require('ws');
const { ERROR_CODES, PROTOCOL_VERSION, createRequest, createError } = require('./protocol');

class BridgeServer {
  constructor(options) {
    this.token = options.token;
    this.host = options.host || '127.0.0.1';
    this.requestTimeoutMs = options.requestTimeoutMs || 30000;
    this.server = null;
    this.extensionSocket = null;
    this.pending = new Map();
    this.port = options.port || 0;
  }

  async start() {
    this.server = new WebSocket.Server({ host: this.host, port: this.port });
    await new Promise(resolve => this.server.once('listening', resolve));
    this.port = this.server.address().port;
    this.server.on('connection', socket => this._handleConnection(socket));
  }

  async stop() {
    for (const entry of this.pending.values()) {
      clearTimeout(entry.timer);
      entry.reject(new Error(ERROR_CODES.EXTENSION_DISCONNECTED));
    }
    this.pending.clear();
    if (this.extensionSocket) this.extensionSocket.close();
    if (this.server) {
      await new Promise(resolve => this.server.close(resolve));
    }
  }

  isExtensionConnected() {
    return Boolean(this.extensionSocket && this.extensionSocket.readyState === WebSocket.OPEN);
  }

  async forward(type, payload) {
    if (!this.isExtensionConnected()) {
      const error = new Error(ERROR_CODES.EXTENSION_OFFLINE);
      error.code = ERROR_CODES.EXTENSION_OFFLINE;
      throw error;
    }

    const request = createRequest(type, payload);
    const promise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(request.id);
        const error = new Error(ERROR_CODES.TIMEOUT);
        error.code = ERROR_CODES.TIMEOUT;
        reject(error);
      }, this.requestTimeoutMs);
      this.pending.set(request.id, { resolve, reject, timer });
    });

    this.extensionSocket.send(JSON.stringify(request));
    return promise;
  }

  _handleConnection(socket) {
    let authenticated = false;

    socket.on('message', data => {
      let message;
      try {
        message = JSON.parse(String(data));
      } catch (_error) {
        socket.close();
        return;
      }

      if (!authenticated) {
        if (!this._isValidHello(message)) {
          socket.close();
          return;
        }
        authenticated = true;
        if (this.extensionSocket && this.extensionSocket !== socket) this.extensionSocket.close();
        this.extensionSocket = socket;
        socket.send(JSON.stringify({ type: 'helloAck', protocolVersion: PROTOCOL_VERSION }));
        return;
      }

      this._handleResponse(message);
    });

    socket.on('close', () => {
      if (this.extensionSocket === socket) {
        this.extensionSocket = null;
        for (const [id, entry] of this.pending.entries()) {
          clearTimeout(entry.timer);
          entry.reject(Object.assign(new Error(ERROR_CODES.EXTENSION_DISCONNECTED), {
            code: ERROR_CODES.EXTENSION_DISCONNECTED
          }));
          this.pending.delete(id);
        }
      }
    });
  }

  _isValidHello(message) {
    return message &&
      message.type === 'hello' &&
      message.protocolVersion === PROTOCOL_VERSION &&
      typeof message.extensionId === 'string' &&
      message.token === this.token;
  }

  _handleResponse(message) {
    const entry = this.pending.get(message.id);
    if (!entry) return;
    clearTimeout(entry.timer);
    this.pending.delete(message.id);
    if (message.ok) {
      entry.resolve(message.payload);
    } else {
      const code = message.error?.code || ERROR_CODES.RUN_FAILED;
      const error = new Error(`${code}: ${message.error?.message || 'Bridge request failed.'}`);
      error.code = code;
      entry.reject(error);
    }
  }
}

module.exports = {
  BridgeServer
};
```

- [ ] **Step 4: Run bridge tests**

Run:

```bash
node tests/mcp-bridge-server.test.js
```

Expected: PASS.

- [ ] **Step 5: Run MCP tests so far**

Run:

```bash
npm run test:mcp
```

Expected at this point: tests created in Tasks 1-4 PASS; `mcp-server-tools` may not exist until Task 5. If the script references a missing file, temporarily run the explicit files from Tasks 1-4 and finalize the script in Task 5.

- [ ] **Step 6: Commit**

```bash
git add packages/smartpages-mcp/src/bridge-server.js tests/mcp-bridge-server.test.js
git commit -m "feat: add local smartpages bridge server"
```

---

## Task 5: MCP Tool Handlers

**Files:**

- Create: `packages/smartpages-mcp/src/mcp-server.js`
- Create: `tests/mcp-server-tools.test.js`
- Modify: `packages/smartpages-mcp/src/index.js`
- Modify: `package.json`

- [ ] **Step 1: Add failing MCP handler tests**

Create `tests/mcp-server-tools.test.js`:

```js
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
```

- [ ] **Step 2: Run failing test**

Run:

```bash
node tests/mcp-server-tools.test.js
```

Expected: FAIL with missing module.

- [ ] **Step 3: Implement testable tool handlers**

Create `packages/smartpages-mcp/src/mcp-server.js`:

```js
'use strict';

const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const defaultStore = require('./workflow-store');
const { ERROR_CODES, normalizeError } = require('./protocol');

function toolError(code, message, extra = {}) {
  return { error: { code, message }, ...extra };
}

function createToolHandlers({ workflowDir, store = defaultStore, bridge }) {
  return {
    async list_workflows() {
      return store.listWorkflows(workflowDir);
    },

    async start_run(input) {
      const workflowId = input?.workflowId;
      const workflowVersion = input?.workflowVersion;
      if (typeof workflowId !== 'string' || !Number.isInteger(workflowVersion)) {
        return toolError(ERROR_CODES.INVALID_PARAMETERS, 'workflowId and workflowVersion are required.');
      }

      const loaded = store.loadWorkflow(workflowDir, workflowId, workflowVersion);
      if (!loaded) {
        return toolError(ERROR_CODES.WORKFLOW_NOT_FOUND, 'Workflow was not found.');
      }

      const variables = input.variables || {};
      const variableResult = store.validateVariables(loaded.workflow, variables);
      if (!variableResult.ok) {
        return toolError(ERROR_CODES.MISSING_VARIABLES, 'Required workflow variables are missing.', {
          missing: variableResult.missing
        });
      }

      try {
        return await bridge.forward('startRun', {
          workflow: loaded.workflow,
          variables,
          fileName: loaded.fileName
        });
      } catch (error) {
        const normalized = normalizeError(error);
        return toolError(normalized.code, normalized.message);
      }
    },

    async get_run_status(input) {
      if (typeof input?.runId !== 'string' || !input.runId.trim()) {
        return toolError(ERROR_CODES.INVALID_PARAMETERS, 'runId is required.');
      }
      try {
        return await bridge.forward('getRunStatus', { runId: input.runId });
      } catch (error) {
        const normalized = normalizeError(error);
        return toolError(normalized.code, normalized.message);
      }
    },

    async cancel_run(input) {
      if (typeof input?.runId !== 'string' || !input.runId.trim()) {
        return toolError(ERROR_CODES.INVALID_PARAMETERS, 'runId is required.');
      }
      try {
        return await bridge.forward('cancelRun', { runId: input.runId });
      } catch (error) {
        const normalized = normalizeError(error);
        return toolError(normalized.code, normalized.message);
      }
    }
  };
}

async function startMcpServer({ workflowDir, bridge }) {
  const server = new McpServer({ name: 'smartpages-mcp', version: '0.1.0' });
  const handlers = createToolHandlers({ workflowDir, bridge });

  server.tool('list_workflows', {}, handlers.list_workflows);
  server.tool('start_run', {}, handlers.start_run);
  server.tool('get_run_status', {}, handlers.get_run_status);
  server.tool('cancel_run', {}, handlers.cancel_run);

  await server.connect(new StdioServerTransport());
  return server;
}

module.exports = {
  createToolHandlers,
  startMcpServer
};
```

- [ ] **Step 4: Wire CLI startup**

Modify `packages/smartpages-mcp/src/index.js`:

```js
#!/usr/bin/env node
'use strict';

const path = require('node:path');
const { BridgeServer } = require('./bridge-server');
const { startMcpServer } = require('./mcp-server');
const { getSmartPagesDir, loadOrCreateToken } = require('./token-store');

async function main() {
  const smartPagesDir = getSmartPagesDir(process.env);
  const workflowDir = process.env.SMARTPAGES_WORKFLOW_DIR || path.join(smartPagesDir, 'workflows');
  const { token, filePath } = loadOrCreateToken();
  const bridge = new BridgeServer({ token, port: Number(process.env.SMARTPAGES_BRIDGE_PORT || 0) });
  await bridge.start();

  console.error(`SmartPages MCP bridge listening on ws://127.0.0.1:${bridge.port}`);
  console.error(`Workflow directory: ${workflowDir}`);
  console.error(`Bridge token file: ${filePath}`);
  console.error(`Bridge token: ${token}`);

  await startMcpServer({ workflowDir, bridge });
}

if (require.main === module) {
  main().catch(error => {
    console.error(error?.stack || error?.message || String(error));
    process.exit(1);
  });
}

module.exports = { main };
```

- [ ] **Step 5: Finalize `test:mcp` script**

Ensure root `package.json` includes:

```json
{
  "scripts": {
    "test:mcp": "node tests/mcp-protocol.test.js && node tests/mcp-token-store.test.js && node tests/mcp-workflow-store.test.js && node tests/mcp-bridge-server.test.js && node tests/mcp-server-tools.test.js"
  }
}
```

- [ ] **Step 6: Run MCP handler tests**

Run:

```bash
node tests/mcp-server-tools.test.js
```

Expected: PASS.

- [ ] **Step 7: Run all MCP tests**

Run:

```bash
npm run test:mcp
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/smartpages-mcp/src/index.js packages/smartpages-mcp/src/mcp-server.js tests/mcp-server-tools.test.js package.json
git commit -m "feat: expose smartpages mcp tools"
```

---

## Task 6: Extension Bridge Client

**Files:**

- Create: `background/agent-bridge-client.js`
- Create: `tests/background-agent-bridge-client.test.js`
- Modify: `background/background.js`
- Modify: `manifest.json`

- [ ] **Step 1: Add failing extension bridge tests**

Create `tests/background-agent-bridge-client.test.js`:

```js
const assert = require('node:assert/strict');
const test = require('node:test');

const { createAgentBridgeClient } = require('../background/agent-bridge-client');

class FakeWebSocket {
  constructor(url) {
    this.url = url;
    this.readyState = FakeWebSocket.CONNECTING;
    this.sent = [];
    FakeWebSocket.instances.push(this);
  }
  send(data) { this.sent.push(JSON.parse(data)); }
  close() { this.readyState = FakeWebSocket.CLOSED; this.onclose && this.onclose(); }
  open() { this.readyState = FakeWebSocket.OPEN; this.onopen && this.onopen(); }
  receive(message) { this.onmessage && this.onmessage({ data: JSON.stringify(message) }); }
}
FakeWebSocket.CONNECTING = 0;
FakeWebSocket.OPEN = 1;
FakeWebSocket.CLOSED = 3;
FakeWebSocket.instances = [];

test('bridge client sends hello and dispatches startRun', async () => {
  const calls = [];
  const client = createAgentBridgeClient({
    WebSocketImpl: FakeWebSocket,
    extensionId: 'ext',
    getConfig: async () => ({ enabled: true, host: '127.0.0.1', port: 1234, token: 'secret' }),
    runner: {
      startRun: async payload => {
        calls.push(payload);
        return { runId: 'run_1', status: 'RUNNING' };
      }
    }
  });

  await client.connect();
  const socket = FakeWebSocket.instances[0];
  socket.open();

  assert.equal(socket.url, 'ws://127.0.0.1:1234');
  assert.equal(socket.sent[0].type, 'hello');
  assert.equal(socket.sent[0].token, 'secret');

  socket.receive({ id: 'msg_1', type: 'startRun', payload: { workflow: { workflowId: 'wf' }, variables: {} } });
  await new Promise(resolve => setImmediate(resolve));

  assert.equal(calls.length, 1);
  assert.deepEqual(socket.sent[1], {
    id: 'msg_1',
    ok: true,
    payload: { runId: 'run_1', status: 'RUNNING' }
  });
});

test('bridge client reports unknown request errors', async () => {
  const client = createAgentBridgeClient({
    WebSocketImpl: FakeWebSocket,
    extensionId: 'ext',
    getConfig: async () => ({ enabled: true, host: '127.0.0.1', port: 1234, token: 'secret' }),
    runner: {}
  });

  await client.connect();
  const socket = FakeWebSocket.instances.at(-1);
  socket.open();
  socket.receive({ id: 'msg_2', type: 'unknown', payload: {} });
  await new Promise(resolve => setImmediate(resolve));

  assert.equal(socket.sent[1].ok, false);
  assert.equal(socket.sent[1].error.code, 'INVALID_PARAMETERS');
});
```

- [ ] **Step 2: Run failing test**

Run:

```bash
node tests/background-agent-bridge-client.test.js
```

Expected: FAIL with missing module.

- [ ] **Step 3: Implement bridge client**

Create `background/agent-bridge-client.js`:

```js
(function (global) {
  'use strict';

  const DEFAULT_CONFIG = Object.freeze({
    enabled: false,
    host: '127.0.0.1',
    port: '',
    token: ''
  });

  function createAgentBridgeClient(options) {
    const WebSocketImpl = options.WebSocketImpl || global.WebSocket;
    const getConfig = options.getConfig;
    const runner = options.runner;
    const extensionId = options.extensionId || global.chrome?.runtime?.id || 'unknown';
    let socket = null;
    let status = { connected: false, lastError: null };

    function send(message) {
      if (!socket || socket.readyState !== WebSocketImpl.OPEN) return false;
      socket.send(JSON.stringify(message));
      return true;
    }

    async function connect() {
      const config = { ...DEFAULT_CONFIG, ...(await getConfig()) };
      if (!config.enabled || !config.port || !config.token) {
        status = { connected: false, lastError: 'Bridge is not configured.' };
        return status;
      }
      socket = new WebSocketImpl(`ws://${config.host}:${config.port}`);
      socket.onopen = () => {
        status = { connected: true, lastError: null };
        send({
          type: 'hello',
          protocolVersion: 1,
          extensionId,
          token: config.token
        });
      };
      socket.onmessage = event => {
        handleMessage(event.data).catch(error => {
          console.warn('[SmartPages AgentBridge] message failed:', error);
        });
      };
      socket.onerror = () => {
        status = { connected: false, lastError: 'WebSocket error.' };
      };
      socket.onclose = () => {
        status = { connected: false, lastError: 'Bridge disconnected.' };
      };
      return status;
    }

    async function handleMessage(raw) {
      const message = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (!message.id || !message.type) return;
      try {
        const payload = await dispatch(message.type, message.payload || {});
        send({ id: message.id, ok: true, payload });
      } catch (error) {
        send({
          id: message.id,
          ok: false,
          error: {
            code: error.code || 'RUN_FAILED',
            message: error.message || 'SmartPages extension bridge request failed.'
          }
        });
      }
    }

    async function dispatch(type, payload) {
      switch (type) {
        case 'startRun':
          return await runner.startRun(payload);
        case 'getRunStatus':
          return await runner.getRunStatus(payload);
        case 'cancelRun':
          return await runner.cancelRun(payload);
        default: {
          const error = new Error(`Unknown bridge request type: ${type}`);
          error.code = 'INVALID_PARAMETERS';
          throw error;
        }
      }
    }

    return {
      connect,
      handleMessage,
      getStatus: () => ({ ...status })
    };
  }

  global.SmartPagesAgentBridge = Object.freeze({
    createAgentBridgeClient
  });

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { createAgentBridgeClient };
  }
})(globalThis);
```

- [ ] **Step 4: Wire background runner adapter**

Modify the `importScripts` line in `background/background.js`:

```js
importScripts('../utils/common.js', '../workflow/schema.js', 'agent-bridge-client.js');
```

Add after `const workflowRunManager = new WorkflowRunManager();`:

```js
const AGENT_BRIDGE_CONFIG_KEY = 'smartpagesAgentBridge';

async function getAgentBridgeConfig() {
  const result = await storagePromise('local', 'get', [AGENT_BRIDGE_CONFIG_KEY]);
  return result?.[AGENT_BRIDGE_CONFIG_KEY] || {};
}

async function getActiveWorkflowTabId() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs && tabs[0];
  if (!tab?.id) {
    const error = new Error('No active browser tab is available.');
    error.code = 'NO_ACTIVE_TAB';
    throw error;
  }
  return tab.id;
}

const agentBridgeRunner = {
  async startRun(payload) {
    const tabId = await getActiveWorkflowTabId();
    return await workflowRunManager.start(payload.workflow, payload.variables || {}, tabId);
  },
  async getRunStatus(payload) {
    await workflowRunManager.ensureHydrated();
    const status = workflowRunManager.getStatus();
    if (!status || (payload?.runId && status.runId !== payload.runId)) {
      const error = new Error('Workflow run was not found.');
      error.code = 'RUN_NOT_FOUND';
      throw error;
    }
    return status;
  },
  async cancelRun(payload) {
    return await workflowRunManager.cancel(payload.runId);
  }
};

const agentBridgeClient = globalThis.SmartPagesAgentBridge.createAgentBridgeClient({
  getConfig: getAgentBridgeConfig,
  runner: agentBridgeRunner
});
globalThis.agentBridgeClient = agentBridgeClient;
agentBridgeClient.connect().catch(error => console.warn('[SmartPages AgentBridge] connect failed:', error));
```

- [ ] **Step 5: Add background message routes for settings**

Add message types to a new constant or existing routing:

```js
const AGENT_BRIDGE_MESSAGE_TYPES = [
  'AGENT_BRIDGE_GET_STATUS',
  'AGENT_BRIDGE_RECONNECT'
];
```

In `messageHandler`, route them before unknown message fallback:

```js
} else if (AGENT_BRIDGE_MESSAGE_TYPES.includes(message.type)) {
  return await handleAgentBridgeMessage(message);
}
```

Add handler:

```js
async function handleAgentBridgeMessage(message) {
  switch (message.type) {
    case 'AGENT_BRIDGE_GET_STATUS':
      return agentBridgeClient.getStatus();
    case 'AGENT_BRIDGE_RECONNECT':
      return await agentBridgeClient.connect();
    default:
      return { error: 'Unknown agent bridge message type: ' + message.type, code: 'INVALID_PARAMETERS' };
  }
}
```

- [ ] **Step 6: Update CSP if WebSocket is blocked**

If manual test or build reports CSP issues, modify `manifest.json`:

```json
{
  "content_security_policy": {
    "extension_pages": "script-src 'self'; object-src 'self'; connect-src 'self' ws://127.0.0.1:* ws://localhost:*;"
  }
}
```

- [ ] **Step 7: Run bridge client tests**

Run:

```bash
node tests/background-agent-bridge-client.test.js
```

Expected: PASS.

- [ ] **Step 8: Run background workflow regression**

Run:

```bash
node tests/background-workflow-run.test.js
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add background/agent-bridge-client.js background/background.js manifest.json tests/background-agent-bridge-client.test.js
git commit -m "feat: connect extension to smartpages bridge"
```

---

## Task 7: Settings UI for Local Agent Bridge

**Files:**

- Modify: `settings/settings.html`
- Modify: `settings/settings.js`
- Modify: `settings/settings.css`
- Create: `tests/settings-agent-bridge.test.js`

- [ ] **Step 1: Add failing settings tests**

Create `tests/settings-agent-bridge.test.js`:

```js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('settings page contains agent bridge fields', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'settings', 'settings.html'), 'utf8');
  assert.match(html, /agent-bridge-host/);
  assert.match(html, /agent-bridge-port/);
  assert.match(html, /agent-bridge-token/);
  assert.match(html, /btn-agent-bridge-test/);
});

test('settings script persists smartpagesAgentBridge config', () => {
  const js = fs.readFileSync(path.join(__dirname, '..', 'settings', 'settings.js'), 'utf8');
  assert.match(js, /smartpagesAgentBridge/);
  assert.match(js, /AGENT_BRIDGE_RECONNECT/);
  assert.match(js, /AGENT_BRIDGE_GET_STATUS/);
});
```

- [ ] **Step 2: Run failing settings test**

Run:

```bash
node tests/settings-agent-bridge.test.js
```

Expected: FAIL because fields do not exist.

- [ ] **Step 3: Add settings markup**

In `settings/settings.html`, add a new section near other configuration sections:

```html
<section class="section agent-bridge-section">
  <h2>本地 Agent Bridge</h2>
  <p class="section-desc">连接本机 smartpages-mcp，让 Agent 调用 SmartPages 执行已导出的 workflow。</p>

  <div class="form-group-switch">
    <label for="agent-bridge-enabled">启用本地 Agent Bridge</label>
    <input type="checkbox" id="agent-bridge-enabled" />
  </div>

  <div class="form-group">
    <label for="agent-bridge-host">Host</label>
    <input id="agent-bridge-host" class="input" type="text" value="127.0.0.1" />
  </div>

  <div class="form-group">
    <label for="agent-bridge-port">Port</label>
    <input id="agent-bridge-port" class="input" type="number" placeholder="smartpages-mcp 启动后显示" />
  </div>

  <div class="form-group">
    <label for="agent-bridge-token">Token</label>
    <input id="agent-bridge-token" class="input" type="password" placeholder="粘贴 smartpages-mcp 显示的 token" />
  </div>

  <div class="form-actions">
    <button id="btn-agent-bridge-test" class="btn btn-secondary" type="button">测试连接</button>
  </div>

  <p id="agent-bridge-status" class="help-text">未连接</p>
</section>
```

- [ ] **Step 4: Add settings persistence logic**

In `settings/settings.js`, add constant near other constants:

```js
const AGENT_BRIDGE_CONFIG_KEY = 'smartpagesAgentBridge';
```

In `SettingsManager.bindEvents()`, bind test button:

```js
this._bindButton('btn-agent-bridge-test', () => this.testAgentBridgeConnection());
```

In config load path after existing fields populate, add:

```js
await this.loadAgentBridgeConfig();
```

Add methods to `SettingsManager`:

```js
async loadAgentBridgeConfig() {
  const result = await storagePromise('local', 'get', [AGENT_BRIDGE_CONFIG_KEY]);
  const config = result?.[AGENT_BRIDGE_CONFIG_KEY] || {};
  const enabled = document.getElementById('agent-bridge-enabled');
  const host = document.getElementById('agent-bridge-host');
  const port = document.getElementById('agent-bridge-port');
  const token = document.getElementById('agent-bridge-token');
  if (enabled) enabled.checked = config.enabled === true;
  if (host) host.value = config.host || '127.0.0.1';
  if (port) port.value = config.port || '';
  if (token) token.value = config.token || '';
  await this.refreshAgentBridgeStatus();
}

collectAgentBridgeConfig() {
  return {
    enabled: document.getElementById('agent-bridge-enabled')?.checked === true,
    host: document.getElementById('agent-bridge-host')?.value.trim() || '127.0.0.1',
    port: Number(document.getElementById('agent-bridge-port')?.value || 0),
    token: document.getElementById('agent-bridge-token')?.value.trim() || ''
  };
}

async saveAgentBridgeConfig() {
  const config = this.collectAgentBridgeConfig();
  if (config.enabled && (!config.port || !config.token)) {
    this._showTestResult(this.isEnglish() ? 'Bridge port and token are required.' : '启用 Bridge 时必须填写端口和 token。', 'error');
    return false;
  }
  await storagePromise('local', 'set', { [AGENT_BRIDGE_CONFIG_KEY]: config });
  return true;
}

async testAgentBridgeConnection() {
  const saved = await this.saveAgentBridgeConfig();
  if (!saved) return;
  const result = await chrome.runtime.sendMessage({ type: 'AGENT_BRIDGE_RECONNECT' });
  await this.refreshAgentBridgeStatus(result);
}

async refreshAgentBridgeStatus(existingStatus = null) {
  const status = existingStatus || await chrome.runtime.sendMessage({ type: 'AGENT_BRIDGE_GET_STATUS' }).catch(() => null);
  const target = document.getElementById('agent-bridge-status');
  if (!target) return;
  if (status?.connected) {
    target.textContent = this.isEnglish() ? 'Connected' : '已连接';
    target.className = 'help-text status-success';
  } else {
    target.textContent = status?.lastError || (this.isEnglish() ? 'Not connected' : '未连接');
    target.className = 'help-text status-warning';
  }
}
```

Inside existing `saveConfig()`, before final success message, call:

```js
const bridgeSaved = await this.saveAgentBridgeConfig();
if (!bridgeSaved) return;
```

- [ ] **Step 5: Add settings styles**

Add to `settings/settings.css`:

```css
.agent-bridge-section {
  border-top: 1px solid var(--border-color, #e5e7eb);
  margin-top: 24px;
  padding-top: 24px;
}

.status-success {
  color: #047857;
}

.status-warning {
  color: #b45309;
}
```

- [ ] **Step 6: Run settings tests**

Run:

```bash
node tests/settings-agent-bridge.test.js
```

Expected: PASS.

- [ ] **Step 7: Run syntax checks**

Run:

```bash
node tests/validate-syntax-check.test.js
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add settings/settings.html settings/settings.js settings/settings.css tests/settings-agent-bridge.test.js
git commit -m "feat: add agent bridge settings"
```

---

## Task 8: Documentation, Verification, and Acceptance

**Files:**

- Modify: `README.md`
- Modify: `README.en.md`
- Modify: `tests/run-tests.js` only if needed to include MCP tests automatically.

- [ ] **Step 1: Add README usage docs**

Add a “本地 Agent Bridge / Local Agent Bridge” section to `README.md`:

```md
## 本地 Agent Bridge（实验性）

SmartPages 可以把导出的 `.smartpages.json` workflow 暴露给本机 Agent 调用。

1. 导出 `.smartpages.json` workflow。
2. 将文件放入 `%LOCALAPPDATA%\SmartPages\workflows\`。
3. 启动本地 MCP Bridge：

   ```bash
   npm run mcp:serve
   ```

4. 复制终端显示的 host、port 和 token。
5. 打开 SmartPages 设置页，启用“本地 Agent Bridge”，填入 port 和 token，点击“测试连接”。
6. 在 Agent 的 MCP 配置中使用 `smartpages-mcp`。

第一版只支持本机调用。SmartPages 不会提供任意 JavaScript 执行、任意文件读取或绕过扩展权限的工具。
```

Add equivalent English text to `README.en.md`:

```md
## Local Agent Bridge (Experimental)

SmartPages can expose exported `.smartpages.json` workflows to a local agent through MCP.

1. Export a `.smartpages.json` workflow.
2. Put the file in `%LOCALAPPDATA%\SmartPages\workflows\`.
3. Start the local MCP bridge:

   ```bash
   npm run mcp:serve
   ```

4. Copy the host, port, and token printed in the terminal.
5. Open SmartPages settings, enable Local Agent Bridge, enter the port and token, then test the connection.
6. Configure your agent to use `smartpages-mcp`.

The first version only supports local calls. SmartPages does not expose arbitrary JavaScript execution, arbitrary file reads, or tools that bypass browser extension permissions.
```

- [ ] **Step 2: Ensure test runner covers new tests**

Check `tests/run-tests.js`. It already runs every `*.test.js` file in `tests/`, so no change should be needed. If a new MCP test requires a long-running server, keep it self-contained and close servers in the test.

- [ ] **Step 3: Run MCP test suite**

Run:

```bash
npm run test:mcp
```

Expected: PASS.

- [ ] **Step 4: Run full project verification**

Run:

```bash
npm run verify
```

Expected: PASS for unit tests, lint, typecheck, and build.

- [ ] **Step 5: Manual smoke test**

Run:

```bash
npm run mcp:serve
```

Expected stderr includes:

```text
SmartPages MCP bridge listening on ws://127.0.0.1:<port>
Workflow directory: <path>
Bridge token file: <path>
Bridge token: <token>
```

Load the extension build in Chrome/Edge, open settings, enter the printed port/token, and click “测试连接”. Expected: settings status changes to connected or a structured connection error appears.

- [ ] **Step 6: Commit docs and final runner changes**

```bash
git add README.md README.en.md tests/run-tests.js
git commit -m "docs: document smartpages agent bridge"
```

- [ ] **Step 7: Final status check**

Run:

```bash
git status --short
```

Expected: no uncommitted files.

---

## Self-Review Checklist

- Spec coverage:
  - Local `smartpages-mcp` Node process: Tasks 1, 2, 4, 5.
  - MCP tools `list_workflows`, `start_run`, `get_run_status`, `cancel_run`: Task 5.
  - Local workflow directory and schema validation: Task 3.
  - Localhost WebSocket bridge and token auth: Tasks 2 and 4.
  - Extension bridge client and existing runner delegation: Task 6.
  - Settings UI for host/port/token/status: Task 7.
  - Structured errors and offline handling: Tasks 4 and 5.
  - Tests and docs: Tasks 1-8.
- Scope check:
  - No Native Messaging.
  - No `.exe` installer.
  - No cloud workflow library.
  - No arbitrary JavaScript or arbitrary file tools.
  - No multi-client coordination beyond replacing the existing extension socket.
- Placeholder scan:
  - No unfinished placeholder steps.
  - Each implementation task has explicit files, commands, and expected results.
