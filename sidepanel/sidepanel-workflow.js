/** Side panel workflow behavior. Loaded before sidepanel.js. */
(globalThis.SmartPagesSidePanelModules ||= []).push(class {
  _buildWorkflowForReplay() {
    this._ensureEditorContentFresh();
    const content = document.getElementById('markdown-editor')?.value || '';
    const converter = globalThis.SmartPagesWorkflowConverter;
    const schema = globalThis.SmartPagesWorkflowSchema;
    if (!content.trim() || !Array.isArray(this.session?.steps) || !this.session.steps.length || !converter?.convertSession || !schema?.validateWorkflow) {
      throw new Error('invalid workflow');
    }
    const baseName = this._getExportBaseName(content);
    const workflow = converter.convertSession(this.session, { title: baseName, workflowId: baseName })?.workflow;
    if (!schema.validateWorkflow(workflow).ok) throw new Error('invalid workflow');
    return workflow;
  }

  async startWorkflowReplay() {
    if (this.workflowRunRequestPending) return;
    const operation = ++this._workflowReplayOperation;
    const updateRevision = this._workflowReplayUpdateRevision;
    this._workflowReplayPendingOperation = operation;
    this.workflowRunRequestPending = true;
    const startButton = document.getElementById('btn-run-workflow');
    if (startButton) startButton.disabled = true;
    this._renderWorkflowRun({ status: 'STARTING' });
    try {
      const workflow = this._buildWorkflowForReplay();
      this._workflowReplayWorkflow = workflow;
      this._workflowReplayVariables = Array.isArray(workflow.variables) ? workflow.variables : [];
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!Number.isInteger(tab?.id)) throw new Error('missing tab');
      try { this._workflowReplayOrigin = new URL(tab.url).origin; } catch (_error) { this._workflowReplayOrigin = ''; }
      const response = await chrome.runtime.sendMessage({ type: 'WORKFLOW_START_RUN', workflow, variables: {}, tabId: tab.id });
      if (!response || response.error) throw new Error('start failed');
      const status = response.status && typeof response.status === 'object' ? response.status : response;
      if (!this._canApplyWorkflowResponse(status, operation, updateRevision)) return;
      this._workflowReplayActiveRunId = status.runId || null;
      this._renderWorkflowRun(status);
    } catch (_error) {
      if (operation !== this._workflowReplayOperation || updateRevision !== this._workflowReplayUpdateRevision) return;
      this.workflowRun = null;
      this._workflowReplayWorkflow = null;
      this._workflowReplayVariables = [];
      this._workflowReplayOrigin = '';
      this._workflowReplayActiveRunId = null;
      this._renderWorkflowRun({ status: 'FAILED', runId: null, currentStepId: null });
      this._showNotification(this._t('workflowRunFailed'), 'error');
    } finally {
      if (this._workflowReplayPendingOperation === operation) {
        this._workflowReplayPendingOperation = null;
        this.workflowRunRequestPending = false;
        if (startButton) startButton.disabled = false;
      }
    }
  }

  _setWorkflowRunElementVisible(element, visible) {
    if (!element) return;
    element.hidden = !visible;
    element.classList?.toggle('hidden', !visible);
  }

  _isTerminalWorkflowStatus(status) {
    return ['FAILED', 'COMPLETED', 'CANCELLED'].includes(status);
  }

  _wouldRegressTerminalWorkflow(status) {
    return this.workflowRun?.runId && this.workflowRun.runId === status?.runId
      && this._isTerminalWorkflowStatus(this.workflowRun.status)
      && status?.status !== this.workflowRun.status;
  }

  _canApplyWorkflowResponse(status, operation, updateRevision) {
    return operation === this._workflowReplayOperation
      && updateRevision === this._workflowReplayUpdateRevision
      && !this._wouldRegressTerminalWorkflow(status);
  }

  _collectWorkflowVariableRefs(value) {
    const names = new Set();
    const visited = new WeakSet();
    let visitedCount = 0;
    const visit = (item, depth) => {
      if (depth > 20 || visitedCount >= 1000 || !item || typeof item !== 'object') return;
      if (visited.has(item)) return;
      visited.add(item);
      visitedCount += 1;
      if (Array.isArray(item)) {
        item.forEach(entry => visit(entry, depth + 1));
        return;
      }
      const prototype = Object.getPrototypeOf(item);
      if (prototype !== null && Object.getPrototypeOf(prototype) !== null) return;
      if (Object.prototype.hasOwnProperty.call(item, 'variable')
          && typeof item.variable === 'string' && item.variable.trim()) {
        names.add(item.variable.trim());
      }
      Object.keys(item).forEach(key => {
        if (!['__proto__', 'prototype', 'constructor'].includes(key)) visit(item[key], depth + 1);
      });
    };
    visit(value, 0);
    return [...names];
  }

  _renderWorkflowRun(status) {
    if (!status || typeof status !== 'object') return;
    const state = String(status.status || 'FAILED');
    const nextStepId = status.currentStepId || status.pendingStep?.id || '';
    const renderKey = `${status.runId || ''}:${state}:${nextStepId}`;
    const transitioned = renderKey !== this._workflowRunRenderKey;
    this.workflowRun = status;
    this._workflowRunRenderKey = renderKey;
    const panel = document.getElementById('workflow-run-panel');
    this._setWorkflowRunElementVisible(panel, true);
    const statusElement = document.getElementById('workflow-run-status');
    if (statusElement) statusElement.textContent = state === 'STARTING' ? this._t('workflowRunStarting') : this._t(`workflowRunStatus${state}`);
    const sanitizedStep = status.pendingStep || {};
    const workflowStep = this._workflowReplayWorkflow?.steps?.find(item => item.id === (status.currentStepId || sanitizedStep.id)) || {};
    const step = { ...workflowStep, ...sanitizedStep };
    if (!step.origin && this._workflowReplayOrigin) step.origin = this._workflowReplayOrigin;
    if (!step.description) {
      const index = this._workflowReplayWorkflow?.steps?.findIndex(item => item.id === step.id);
      step.description = index >= 0 ? (this.session?.steps?.[index]?.description || this.session?.steps?.[index]?.elementName || '') : '';
    }
    const stepId = status.currentStepId || step.id || '';
    const stepElement = document.getElementById('workflow-run-step');
    if (stepElement) stepElement.textContent = stepId || step.description
      ? this._t('workflowRunStep', { id: stepId, description: step.description || '' }) : '';
    const target = typeof step.target === 'object'
      ? (step.target.accessibleName || step.target.name || step.target.selector || '') : (step.target || '');
    const variableNames = [...new Set([
      ...(Array.isArray(status.pendingStep?.variableNames) ? status.pendingStep.variableNames.map(String) : []),
      ...this._collectWorkflowVariableRefs(workflowStep.input),
    ].filter(name => name.trim()))];
    const summary = [
      step.origin && this._t('workflowRunOrigin', { value: step.origin }),
      step.action && this._t('workflowRunAction', { value: step.action }),
      target && this._t('workflowRunTarget', { value: target }),
      variableNames.length && this._t('workflowRunVariables', { value: variableNames.join(', ') })
    ].filter(Boolean).join('\n');
    const summaryElement = document.getElementById('workflow-run-summary');
    if (summaryElement) summaryElement.textContent = summary;

    const inputs = document.getElementById('workflow-run-inputs');
    if (transitioned) inputs?.replaceChildren();
    if (transitioned && state === 'WAITING_INPUT' && inputs) {
      const definitions = new Map((this._workflowReplayVariables || []).map(item => [item.name, item]));
      variableNames.forEach(name => {
        const label = document.createElement('label');
        label.textContent = name;
        const input = document.createElement('input');
        const secret = definitions.get(name)?.secret || /(password|token|secret)/i.test(name);
        input.type = secret ? 'password' : 'text'; input.name = name; input.autocomplete = 'off';
        label.appendChild(input); inputs.appendChild(label);
      });
    }
    const confirmation = state === 'WAITING_CONFIRMATION';
    const waitingInput = state === 'WAITING_INPUT';
    const approveButton = document.getElementById('btn-workflow-approve');
    this._setWorkflowRunElementVisible(approveButton, confirmation || waitingInput);
    if (approveButton) approveButton.textContent = this._t(waitingInput ? 'workflowRunContinue' : 'workflowRunApprove');
    this._setWorkflowRunElementVisible(document.getElementById('btn-workflow-reject'), confirmation);
    this._setWorkflowRunElementVisible(document.getElementById('btn-workflow-cancel'), !['FAILED', 'COMPLETED', 'CANCELLED', 'STARTING'].includes(state));
    if (transitioned && waitingInput) inputs?.querySelectorAll('input')?.[0]?.focus();
    else if (transitioned && confirmation) approveButton?.focus();
  }

  _readWorkflowRunVariables() {
    const result = {};
    document.getElementById('workflow-run-inputs')?.querySelectorAll('input').forEach(input => {
      if (input.name && input.value) result[input.name] = input.value;
      input.value = '';
    });
    return result;
  }

  async _resumeWorkflowStep(approved) {
    if (this.workflowRunRequestPending) return;
    const runId = this.workflowRun?.runId;
    const expectedStepId = this.workflowRun?.currentStepId || this.workflowRun?.pendingStep?.id;
    if (!runId || !expectedStepId) return;
    const operation = ++this._workflowReplayOperation;
    const updateRevision = this._workflowReplayUpdateRevision;
    this._workflowReplayPendingOperation = operation;
    this.workflowRunRequestPending = true;
    const buttons = ['btn-workflow-approve', 'btn-workflow-reject'].map(id => document.getElementById(id)).filter(Boolean);
    buttons.forEach(button => { button.disabled = true; });
    try {
      const variables = approved ? this._readWorkflowRunVariables() : {};
      const response = await chrome.runtime.sendMessage({ type: 'WORKFLOW_RESUME_RUN', runId, expectedStepId, approved, variables });
      if (!response || response.error) throw new Error('resume failed');
      const status = response.status && typeof response.status === 'object' ? response.status : response;
      if (!this._canApplyWorkflowResponse(status, operation, updateRevision)) return;
      this._workflowReplayActiveRunId = status.runId || runId;
      this._renderWorkflowRun(status);
    } catch (_error) {
      if (operation !== this._workflowReplayOperation || updateRevision !== this._workflowReplayUpdateRevision) return;
      this._showNotification(this._t('workflowRunFailed'), 'error');
    } finally {
      if (this._workflowReplayPendingOperation === operation) {
        this._workflowReplayPendingOperation = null;
        this.workflowRunRequestPending = false;
        buttons.forEach(button => { button.disabled = false; });
      }
    }
  }

  approveWorkflowStep() { return this._resumeWorkflowStep(true); }

  rejectWorkflowStep() { return this._resumeWorkflowStep(false); }

  async cancelWorkflowReplay() {
    const runId = this.workflowRun?.runId;
    if (!runId || this.workflowRunRequestPending || ['FAILED', 'COMPLETED', 'CANCELLED'].includes(this.workflowRun?.status)) return;
    const operation = ++this._workflowReplayOperation;
    const updateRevision = this._workflowReplayUpdateRevision;
    this._workflowReplayPendingOperation = operation;
    this.workflowRunRequestPending = true;
    try {
      const response = await chrome.runtime.sendMessage({ type: 'WORKFLOW_CANCEL_RUN', runId });
      if (!response || response.error) throw new Error('cancel failed');
      const status = response.status && typeof response.status === 'object' ? response.status : response;
      if (!this._canApplyWorkflowResponse(status, operation, updateRevision)) return;
      this._workflowReplayActiveRunId = status.runId || runId;
      this._renderWorkflowRun(status);
    } catch (_error) {
      if (operation !== this._workflowReplayOperation || updateRevision !== this._workflowReplayUpdateRevision) return;
      this._showNotification(this._t('workflowRunFailed'), 'error');
    } finally {
      if (this._workflowReplayPendingOperation === operation) {
        this._workflowReplayPendingOperation = null;
        this.workflowRunRequestPending = false;
      }
    }
  }

  exportExecutableWorkflow() {
    this._ensureEditorContentFresh();
    const content = document.getElementById('markdown-editor')?.value || '';

    try {
      if (!content.trim()) {
        const error = new Error(this._t('workflowExportEmptyContent'));
        error.code = 'WORKFLOW_EXPORT_EMPTY_CONTENT';
        throw error;
      }
      if (!Array.isArray(this.session?.steps) || this.session.steps.length === 0) {
        const error = new Error(this._t('workflowExportEmptySession'));
        error.code = 'WORKFLOW_EXPORT_EMPTY_SESSION';
        throw error;
      }

      const converter = globalThis.SmartPagesWorkflowConverter;
      const schema = globalThis.SmartPagesWorkflowSchema;
      if (!converter?.convertSession || !schema?.validateWorkflow) {
        throw new ExtensionError(this._t('workflowExportUnavailable'), 'WORKFLOW_EXPORT_UNAVAILABLE');
      }

      const baseName = this._getExportBaseName(content);
      let workflow;
      try {
        workflow = converter.convertSession(this.session, {
          title: baseName,
          workflowId: baseName
        })?.workflow;
      } catch (conversionError) {
        throw new ExtensionError(this._t('workflowExportConversionFailed'), 'WORKFLOW_EXPORT_CONVERSION');
      }
      const validation = schema.validateWorkflow(workflow);
      if (!validation.ok) {
        throw new ExtensionError(this._t('workflowExportInvalid'), 'WORKFLOW_EXPORT_INVALID');
      }

      const jsonFilename = `${baseName}.smartpages.json`;
      const metadata = `<!-- SmartPages Workflow ID: ${workflow.workflowId}; Version: ${workflow.workflowVersion}; File: ${jsonFilename} -->`;
      const markdownBlob = new Blob([`${metadata}\n\n${content}`], { type: 'text/markdown;charset=utf-8' });
      const jsonBlob = new Blob([`${JSON.stringify(workflow, null, 2)}\n`], { type: 'application/json;charset=utf-8' });

      this._downloadBlob(`${baseName}.md`, markdownBlob);
      this._downloadBlob(jsonFilename, jsonBlob);
    } catch (error) {
      const code = error?.code || 'WORKFLOW_EXPORT_FAILED';
      const message = error?.message || this._t('workflowExportFailed');
      this._showError(`${code}: ${message}`);
    }
  }
});
