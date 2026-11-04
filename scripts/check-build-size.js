#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const artifact = path.join(__dirname, '..', 'dist', 'cloudbase-sdk.js');
const maxBytes = Number(process.env.SMARTPAGES_MAX_SDK_BYTES || 600 * 1024);

if (!fs.existsSync(artifact)) {
  console.error(`Build artifact not found: ${artifact}`);
  process.exit(1);
}

const size = fs.statSync(artifact).size;
const sizeKb = (size / 1024).toFixed(1);
const maxKb = (maxBytes / 1024).toFixed(1);

if (size > maxBytes) {
  console.error(`cloudbase-sdk.js is ${sizeKb} KB, above the ${maxKb} KB budget.`);
  process.exit(1);
}

console.log(`cloudbase-sdk.js size OK: ${sizeKb} KB / ${maxKb} KB budget`);
