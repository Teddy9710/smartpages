const fs = require('node:fs');
const path = require('node:path');

// Match the real page's script order so tests exercise feature registration.
module.exports = function loadSidePanelSource() {
  const directory = path.join(__dirname, '..', 'sidepanel');
  const html = fs.readFileSync(path.join(directory, 'sidepanel.html'), 'utf8');
  return [...html.matchAll(/<script src="(sidepanel[^"/]*\.js)"><\/script>/g)]
    .map(match => fs.readFileSync(path.join(directory, match[1]), 'utf8')).join('\n');
};
