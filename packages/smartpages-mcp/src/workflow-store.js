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
