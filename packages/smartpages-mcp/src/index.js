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
