'use strict';

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

function toMcpContent(result) {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(result, null, 2)
      }
    ]
  };
}

async function startMcpServer({ workflowDir, bridge }) {
  const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
  const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
  const { z } = require('zod');

  const server = new McpServer({ name: 'smartpages-mcp', version: '1.3.0' });
  const handlers = createToolHandlers({ workflowDir, bridge });

  server.tool('list_workflows', 'List available SmartPages executable workflows.', {}, async () =>
    toMcpContent(await handlers.list_workflows({})));

  server.tool('start_run', 'Start a SmartPages workflow run in the connected browser extension.', {
    workflowId: z.string(),
    workflowVersion: z.number().int(),
    variables: z.record(z.any()).optional()
  }, async input => toMcpContent(await handlers.start_run(input)));

  server.tool('get_run_status', 'Get status for a SmartPages workflow run.', {
    runId: z.string()
  }, async input => toMcpContent(await handlers.get_run_status(input)));

  server.tool('cancel_run', 'Cancel a SmartPages workflow run.', {
    runId: z.string()
  }, async input => toMcpContent(await handlers.cancel_run(input)));

  await server.connect(new StdioServerTransport());
  return server;
}

module.exports = {
  createToolHandlers,
  startMcpServer
};
