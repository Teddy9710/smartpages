const fs = require('fs');
const path = require('path');

const distPath = path.join(__dirname, '..', 'dist');

if (fs.existsSync(distPath)) {
  fs.readdirSync(distPath)
    .filter(name => name.startsWith('_'))
    .forEach(name => fs.rmSync(path.join(distPath, name), { force: true, recursive: true }));
}
