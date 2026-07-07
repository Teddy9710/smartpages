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
