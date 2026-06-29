const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const managerSource = fs.readFileSync(path.join(__dirname, '..', 'upload', 'upload-manager.js'), 'utf8');
const panelSource = fs.readFileSync(path.join(__dirname, '..', 'upload', 'upload-panel.js'), 'utf8');
const requests = [];
const sandbox = {
  console: { log: () => {}, warn: () => {}, error: () => {} },
  window: {},
  fetch: async (url, options) => {
    requests.push({ url, options });
    return {
      ok: true,
      json: async () => ({ commit: { sha: 'abc123' }, content: { download_url: 'https://example.test/file' } })
    };
  }
};
sandbox.globalThis = sandbox;
vm.runInNewContext(managerSource, sandbox);

(async () => {
  const manager = new sandbox.window.DocumentUploadManager();
  manager.readFileAsBase64 = async () => 'ZmlsZQ==';

  await assert.rejects(
    () => manager.uploadToGitHub({ name: 'guide.md' }, { token: 'secret', repo: 'repository', branch: 'main' }),
    /owner\/repository/
  );

  const result = await manager.uploadToGitHub(
    { name: '../private/guide notes.md' },
    { token: 'secret', repo: 'Teddy9710/smartpages', branch: 'main' }
  );

  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, 'https://api.github.com/repos/Teddy9710/smartpages/contents/guide%20notes.md');
  assert.equal(result.filename, 'guide notes.md');
  assert.doesNotMatch(requests[0].url, /\.\.|private/);

  assert.match(panelSource, /finally\s*\{[\s\S]*github-token[\s\S]*\.value\s*=\s*['"]/);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
