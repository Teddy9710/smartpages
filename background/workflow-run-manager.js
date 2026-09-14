/** Background workflow-run-manager. Loaded by the service worker. */
const WorkflowRunStatus = Object.freeze({
  READY: 'READY', RUNNING: 'RUNNING', WAITING_CONFIRMATION: 'WAITING_CONFIRMATION',
  WAITING_INPUT: 'WAITING_INPUT', FAILED: 'FAILED', COMPLETED: 'COMPLETED', CANCELLED: 'CANCELLED'
});
const WORKFLOW_RUN_STORAGE_KEY = 'smartpagesWorkflowRun';

class WorkflowRunManager {
  constructor() {
    this.run = null;
    this._starting = false;
    this._hydrated = false;
    this._transition = Promise.resolve();
    this._persistence = Promise.resolve();
  }

  _serialize(operation) {
    const next = this._transition.then(operation, operation);
    this._transition = next.catch(() => {});
    return next;
  }

  async _storage(method, value) {
    const area = chrome.storage?.session || chrome.storage?.local;
    if (!area?.[method]) return method === 'get' ? {} : undefined;
    return await area[method](value);
  }

  async ensureHydrated() {
    if (this._hydrated) return;
    const saved = (await this._storage('get', [WORKFLOW_RUN_STORAGE_KEY]))?.[WORKFLOW_RUN_STORAGE_KEY];
    if (saved) {
      this.run = saved;
      if ([WorkflowRunStatus.READY, WorkflowRunStatus.RUNNING].includes(this.run.status)) {
        this.run.status = WorkflowRunStatus.FAILED;
        this.run.endedAt = new Date().toISOString();
        this.run.navigationPending = false;
        this._log(this.run.pendingStep, 'RUN_INTERRUPTED');
      }
    }
    this._hydrated = true;
    if (saved) await this._persist();
  }

  async _persist() {
    if (!this.run) return;
    const checkpoint = structuredClone(this.run);
    checkpoint.variables = {};
    const write = this._persistence.then(() => this._storage('set', { [WORKFLOW_RUN_STORAGE_KEY]: checkpoint }));
    this._persistence = write.catch(() => {});
    await write;
  }

  _error(code, message) {
    const error = new Error(`${code}: ${message}`);
    error.code = code;
    return error;
  }

  _isActive() {
    return this.run && [WorkflowRunStatus.READY, WorkflowRunStatus.RUNNING,
      WorkflowRunStatus.WAITING_CONFIRMATION, WorkflowRunStatus.WAITING_INPUT].includes(this.run.status);
  }

  async start(workflow, variables = {}, tabId) {
    if (this._starting) throw this._error('RUN_IN_PROGRESS', 'A workflow run is already active.');
    this._starting = true;
    try {
      await this.ensureHydrated();
      if (this._isActive()) throw this._error('RUN_IN_PROGRESS', 'A workflow run is already active.');
      const validation = globalThis.SmartPagesWorkflowSchema?.validateWorkflow?.(workflow);
      if (!validation?.ok) throw this._error(validation?.code || 'INVALID_WORKFLOW', validation?.message || 'Workflow is invalid.');
      if (!Number.isInteger(tabId) || tabId <= 0) throw this._error('INVALID_TAB', 'tabId must be a positive integer.');
      let tab;
      try { tab = await chrome.tabs.get(tabId); } catch (_error) { /* normalized below */ }
      if (!tab?.url) throw this._error('INVALID_TAB', 'Tab does not exist or has no URL.');
      if (!globalThis.SmartPagesWorkflowSchema.isOriginAllowed(tab.url, workflow.allowedOrigins)) {
        throw this._error('ORIGIN_NOT_ALLOWED', 'Current tab origin is not allowed.');
      }
      await this._ensureWorkflowReplayer(tabId);
      this.run = {
        runId: globalThis.crypto?.randomUUID?.() || `workflow-${Date.now()}`,
        workflow, variables: { ...(variables || {}) }, tabId,
        status: WorkflowRunStatus.READY, nextStepIndex: 0, pendingStep: null,
        logs: [], startedAt: new Date().toISOString(), endedAt: null,
        navigationPending: false
      };
      await this._notify();
      await this._persist();
      return await this._advance();
    } finally {
      this._starting = false;
    }
  }

  async _advance() {
    if (!this._isActive()) return this.getStatus();
    while (this.run.nextStepIndex < this.run.workflow.steps.length) {
      if (this.run.status === WorkflowRunStatus.CANCELLED) break;
      const step = this.run.workflow.steps[this.run.nextStepIndex];
      if (step.risk === 'high' && this.run.pendingStep !== step) {
        this.run.pendingStep = step;
        this.run.status = WorkflowRunStatus.WAITING_CONFIRMATION;
        this._log(step, 'AWAITING_CONFIRMATION');
        await this._notify();
        return this.getStatus();
      }
      this.run.status = WorkflowRunStatus.RUNNING;
      this.run.pendingStep = step;
      const claim = { runId: this.run.runId, index: this.run.nextStepIndex, stepId: step.id };
      await this._notify();
      if (!this._matches(claim) || this.run.status !== WorkflowRunStatus.RUNNING) return this.getStatus();
      let result;
      try {
        result = await chrome.tabs.sendMessage(this.run.tabId, {
          type: 'WORKFLOW_EXECUTE_STEP', step,
          variables: { ...this.run.variables }, allowedOrigins: [...this.run.workflow.allowedOrigins]
        });
      } catch (error) {
        result = { ok: false, code: 'EXECUTION_FAILED', message: error?.message };
      }
      if (!this._matches(claim) || this.run.status !== WorkflowRunStatus.RUNNING) return this.getStatus();
      this._log(step, result?.code || (result?.ok ? 'STEP_COMPLETED' : 'EXECUTION_FAILED'));
      if (!result?.ok) {
        this.run.status = result?.code === 'MISSING_VARIABLE'
          ? WorkflowRunStatus.WAITING_INPUT : WorkflowRunStatus.FAILED;
        if (this.run.status === WorkflowRunStatus.FAILED) this.run.endedAt = new Date().toISOString();
        await this._notify();
        return this.getStatus();
      }
      if (result.code === 'NAVIGATION_STARTED') {
        this.run.navigationPending = true;
        await this._notify();
        return this.getStatus();
      }
      this.run.navigationPending = false;
      this.run.pendingStep = null;
      this.run.nextStepIndex += 1;
    }
    if (this.run.status !== WorkflowRunStatus.CANCELLED) {
      this.run.status = WorkflowRunStatus.COMPLETED;
      this.run.endedAt = new Date().toISOString();
      await this._notify();
    }
    return this.getStatus();
  }

  async resume({ approved, variables, runId, expectedStepId } = {}) {
    await this.ensureHydrated();
    if (!this.run || ![WorkflowRunStatus.WAITING_CONFIRMATION, WorkflowRunStatus.WAITING_INPUT].includes(this.run.status)) {
      throw this._error('INVALID_RUN_STATE', 'Workflow run is not waiting for confirmation or input.');
    }
    if (runId !== this.run.runId || expectedStepId !== this.run.pendingStep?.id) {
      throw this._error('STALE_APPROVAL', 'Approval does not match the pending run and step.');
    }
    if (!approved) return await this._cancelUnlocked();
    if (variables && typeof variables === 'object' && !Array.isArray(variables)) {
      Object.assign(this.run.variables, variables);
    }
    this.run.status = WorkflowRunStatus.RUNNING;
    return await this._advance();
  }

  async cancel(runId) {
    await this.ensureHydrated();
    if (typeof runId !== 'string' || !runId.trim()) {
      throw this._error('INVALID_PARAMETERS', 'runId is required to cancel a workflow run.');
    }
    if (this.run && runId !== this.run.runId) {
      throw this._error('STALE_RUN', 'Cancellation does not match the current workflow run.');
    }
    return await this._cancelUnlocked();
  }

  async _cancelUnlocked() {
    if (!this.run) throw this._error('NO_RUN', 'No workflow run exists.');
    if (!this._isActive()) throw this._error('INVALID_RUN_STATE', 'Workflow run is already terminal.');
    const tabId = this.run.tabId;
    this.run.status = WorkflowRunStatus.CANCELLED;
    this.run.endedAt = new Date().toISOString();
    this.run.navigationPending = false;
    this._log(this.run.pendingStep, 'CANCELLED');
    if (Number.isInteger(tabId) && tabId > 0) {
      Promise.resolve(chrome.tabs.sendMessage(tabId, { type: 'WORKFLOW_CANCEL' })).catch(() => {});
    }
    await this._notify();
    return this.getStatus();
  }

  async handleTabComplete(tabId, tab) {
    return this._serialize(async () => {
    await this.ensureHydrated();
    if (!this._isActive() || this.run.tabId !== tabId || !this.run.navigationPending) return;
    const step = this.run.pendingStep;
    const claim = { runId: this.run.runId, index: this.run.nextStepIndex, stepId: step?.id };
    this.run.navigationPending = false;
    await this._persist();
    try {
      await this._ensureWorkflowReplayer(tabId);
    } catch (_error) {
      if (this._matches(claim) && this.run.status === WorkflowRunStatus.RUNNING) {
        await this._fail(step, 'REPLAYER_INJECTION_FAILED');
      }
      return;
    }
    if (!this._matches(claim) || this.run.status !== WorkflowRunStatus.RUNNING) return;
    if (!globalThis.SmartPagesWorkflowSchema.isOriginAllowed(tab?.url, this.run.workflow.allowedOrigins)) {
      await this._fail(step, 'ORIGIN_NOT_ALLOWED');
      return;
    }
    const condition = step?.postcondition ?? step?.postconditions;
    const conditionResult = condition
      ? await this._checkNavigationPostcondition(tabId, tab?.url, condition)
      : this._navigationDestinationMatches(step, tab?.url);
    if (!conditionResult) {
      await this._fail(step, 'POSTCONDITION_FAILED');
      return;
    }
    this._log(step, 'STEP_COMPLETED');
    this.run.navigationPending = false;
    this.run.pendingStep = null;
    this.run.nextStepIndex += 1;
    await this._advance();
    });
  }

  _resolveWorkflowValue(value) {
    if (value && typeof value === 'object' && !Array.isArray(value) && Object.hasOwn(value, 'variable')) {
      return this.run.variables?.[value.variable];
    }
    return value;
  }

  _navigationDestinationMatches(step, currentUrl) {
    const expectedUrl = this._resolveWorkflowValue(step?.input?.url);
    return typeof expectedUrl === 'string' && currentUrl === expectedUrl;
  }

  async _checkNavigationPostcondition(tabId, currentUrl, condition) {
    const conditions = Array.isArray(condition) ? condition : [condition];
    const urlConditions = conditions.filter(item => item?.type === 'url');
    const domConditions = conditions.filter(item => item?.type !== 'url');
    const urlMatches = urlConditions.every(item => {
      const expected = this._resolveWorkflowValue(item.value ?? item.url);
      if (expected !== undefined) return currentUrl === expected;
      try {
        const parsed = new URL(currentUrl);
        return (item.origin === undefined || parsed.origin === item.origin) &&
          (item.path === undefined || parsed.pathname === item.path) &&
          (item.origin !== undefined || item.path !== undefined);
      } catch (_error) { return false; }
    });
    if (!urlMatches) return false;
    if (domConditions.length === 0) return urlConditions.length > 0;
    try {
      const result = await chrome.tabs.sendMessage(tabId, {
        type: 'WORKFLOW_CHECK_CONDITION',
        condition: domConditions.length === 1 ? domConditions[0] : domConditions,
        allowedOrigins: [...this.run.workflow.allowedOrigins]
      });
      return result?.ok === true;
    } catch (_error) {
      return false;
    }
  }

  async handleTabRemoved(tabId) {
    return this._serialize(async () => {
      await this.ensureHydrated();
      if (this._isActive() && this.run.tabId === tabId) await this._fail(this.run.pendingStep, 'TAB_CLOSED');
    });
  }

  _matches(claim) {
    return this.run?.runId === claim.runId && this.run.nextStepIndex === claim.index && this.run.pendingStep?.id === claim.stepId;
  }

  async _fail(step, code) {
    this.run.status = WorkflowRunStatus.FAILED;
    this.run.endedAt = new Date().toISOString();
    this.run.navigationPending = false;
    this._log(step, code);
    await this._notify();
  }

  async _ensureWorkflowReplayer(tabId) {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['workflow/schema.js', 'content/workflow-replayer.js']
    });
  }

  _log(step, result) {
    if (!this.run) return;
    this.run.logs.push({
      stepId: step?.id || null, action: step?.action || null,
      result: String(result || 'UNKNOWN'), timestamp: new Date().toISOString()
    });
  }

  getStatus() {
    if (!this.run) return null;
    const pending = this.run.pendingStep;
    const terminal = [WorkflowRunStatus.FAILED, WorkflowRunStatus.COMPLETED, WorkflowRunStatus.CANCELLED]
      .includes(this.run.status);
    return {
      runId: this.run.runId, workflowId: this.run.workflow.workflowId,
      tabId: this.run.tabId, status: this.run.status,
      nextStepIndex: this.run.nextStepIndex,
      currentStepId: terminal ? null : (pending?.id || this.run.workflow.steps[this.run.nextStepIndex]?.id || null),
      pendingStep: pending ? { id: pending.id, action: pending.action, risk: pending.risk } : null,
      logs: this.run.logs.map(log => ({ ...log })),
      startedAt: this.run.startedAt, endedAt: this.run.endedAt
    };
  }

  async _notify() {
    await this._persist();
    try {
      await chrome.runtime.sendMessage({ type: 'WORKFLOW_RUN_CHANGED', status: this.getStatus() });
    } catch (_error) { /* Notifications are best effort. */ }
  }
}

globalThis.WorkflowRunManager = WorkflowRunManager;
