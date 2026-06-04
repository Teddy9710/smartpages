const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const testDir = __dirname;
const testFiles = fs.readdirSync(testDir)
  .filter(file => file.endsWith('.test.js'))
  .sort();

if (testFiles.length === 0) {
  console.log('No test files found.');
  process.exit(0);
}

for (const file of testFiles) {
  const relativePath = path.join('tests', file);
  console.log(`Running ${relativePath}`);
  const result = spawnSync(process.execPath, [relativePath], {
    cwd: path.join(testDir, '..'),
    stdio: 'inherit'
  });
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

console.log(`Passed ${testFiles.length} test files.`);
