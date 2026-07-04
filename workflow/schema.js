(function (global) {
  'use strict';

  const VERSION = '1.0';
  const ACTIONS = Object.freeze(['navigate', 'click', 'input', 'select', 'scroll', 'wait', 'assert']);
  const RISKS = Object.freeze(['low', 'medium', 'high']);
  const TARGET_REQUIRED_ACTIONS = new Set(['navigate', 'click', 'input', 'select', 'assert']);

  function invalid(code, message) {
    return { ok: false, code, message };
  }

  function isExactHttpOrigin(origin) {
    if (typeof origin !== 'string' || origin.includes('*')) return false;
    try {
      const parsed = new URL(origin);
      return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && parsed.origin === origin;
    } catch (_error) {
      return false;
    }
  }

  function validateWorkflow(workflow) {
    if (!workflow || typeof workflow !== 'object' || Array.isArray(workflow)) {
      return invalid('INVALID_WORKFLOW', 'Workflow must be an object.');
    }
    if (workflow.schemaVersion !== VERSION) {
      return invalid('UNSUPPORTED_SCHEMA', `Workflow schemaVersion must be ${VERSION}.`);
    }
    if (typeof workflow.workflowId !== 'string' || workflow.workflowId.trim() === '') {
      return invalid('INVALID_WORKFLOW_ID', 'workflowId must be a non-empty string.');
    }
    if (!Number.isInteger(workflow.workflowVersion) || workflow.workflowVersion <= 0) {
      return invalid('INVALID_WORKFLOW_VERSION', 'workflowVersion must be a positive integer.');
    }
    if (!Array.isArray(workflow.allowedOrigins) || workflow.allowedOrigins.length === 0 ||
        workflow.allowedOrigins.some(origin => !isExactHttpOrigin(origin))) {
      return invalid('INVALID_ALLOWED_ORIGINS', 'allowedOrigins must contain exact HTTP or HTTPS origins.');
    }
    if (!Array.isArray(workflow.variables)) {
      return invalid('INVALID_VARIABLES', 'variables must be an array.');
    }
    if (!Array.isArray(workflow.steps) || workflow.steps.length === 0) {
      return invalid('INVALID_STEPS', 'steps must be a non-empty array.');
    }

    const stepIds = new Set();
    for (const step of workflow.steps) {
      if (!step || typeof step !== 'object' || Array.isArray(step) ||
          typeof step.id !== 'string' || step.id.trim() === '') {
        return invalid('INVALID_STEP_ID', 'Every step must have a non-empty string id.');
      }
      if (stepIds.has(step.id)) {
        return invalid('DUPLICATE_STEP_ID', `Duplicate step id: ${step.id}.`);
      }
      stepIds.add(step.id);
      if (!ACTIONS.includes(step.action)) {
        return invalid('UNKNOWN_ACTION', `Unknown action: ${String(step.action)}.`);
      }
      if (!RISKS.includes(step.risk)) {
        return invalid('INVALID_RISK', `Invalid risk for step ${step.id}.`);
      }
      if (TARGET_REQUIRED_ACTIONS.has(step.action) &&
          (typeof step.target !== 'string' || step.target.trim() === '')) {
        return invalid('MISSING_TARGET', `Action ${step.action} requires a target.`);
      }
    }

    return { ok: true, workflow };
  }

  function isOriginAllowed(url, origins) {
    if (!Array.isArray(origins)) return false;
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
      return origins.some(origin => isExactHttpOrigin(origin) && origin === parsed.origin);
    } catch (_error) {
      return false;
    }
  }

  global.SmartPagesWorkflowSchema = Object.freeze({
    VERSION,
    ACTIONS,
    RISKS,
    validateWorkflow,
    isOriginAllowed,
  });
})(globalThis);
