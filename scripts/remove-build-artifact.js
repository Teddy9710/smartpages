const fs = require('fs');
const path = require('path');

const artifactPath = path.join(__dirname, '..', 'dist', '_unused_entry.js');
fs.rmSync(artifactPath, { force: true });
