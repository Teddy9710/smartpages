const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function getReservedTopLevelFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.startsWith('_'))
    .map(entry => entry.name);
}

{
  const root = path.join(__dirname, '..');
  const reservedFiles = getReservedTopLevelFiles(root);

  assert.deepEqual(reservedFiles, []);
}

{
  const dist = path.join(__dirname, '..', 'dist');
  const reservedFiles = getReservedTopLevelFiles(dist);

  assert.deepEqual(reservedFiles, []);
}
