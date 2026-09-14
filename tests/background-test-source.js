const fs = require('node:fs');
const path = require('node:path');
module.exports = function loadBackgroundSource() {
  const directory = path.join(__dirname, '..', 'background');
  return ['recording-manager.js', 'document-handlers.js', 'workflow-run-manager.js', 'background.js']
    .map(name => fs.readFileSync(path.join(directory, name), 'utf8')).join('\n');
};
