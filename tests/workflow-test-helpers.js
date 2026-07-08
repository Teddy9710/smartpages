const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadBrowserScript(relativePath, exportName, extra = {}) {
  const source = fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
  const sandbox = { console, URL, ...extra };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(source, sandbox, { filename: relativePath });
  return sandbox[exportName];
}

module.exports = { loadBrowserScript };
