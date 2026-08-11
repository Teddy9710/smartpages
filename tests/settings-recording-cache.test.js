const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'settings', 'settings.html'), 'utf8');
const source = fs.readFileSync(path.join(__dirname, '..', 'settings', 'settings.js'), 'utf8');

assert.match(html, /href="#storage-settings"/);
assert.match(html, /id="storage-settings"[\s\S]*id="btn-clear-recording-cache"/);
assert.match(html, /id="recording-cache-result"[^>]+aria-live="polite"/);
assert.match(source, /this\._bindButton\('btn-clear-recording-cache', \(\) => this\.clearRecordingCache\(\)\)/);
assert.match(source, /async clearRecordingCache\(\)[\s\S]*type: 'CLEAR_RECORDING_CACHE'/);

console.log('settings recording cache tests passed');
