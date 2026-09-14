const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../utils/cloudDocumentApi'), 'utf8');
(async () => {
  let appended = 0;
  let fail = true;
  const sdk = { init: () => ({ auth: () => ({ getSession: async () => null }) }) };
  const sandbox = {
    module: { exports: {} }, fetch: async () => {},
    chrome: { runtime: { getURL: path => `chrome-extension://test/${path}` } },
    document: {
      createElement: () => ({ remove() {} }),
      head: { appendChild(script) {
        appended++;
        assert.equal(script.src, 'chrome-extension://test/cloudbase-sdk.js');
        queueMicrotask(() => {
          if (fail) script.onerror();
          else { sandbox.cloudbase = sdk; script.onload(); }
        });
      } }
    }
  };
  vm.runInNewContext(source, sandbox);
  const { CloudBaseDocumentProvider } = sandbox.module.exports;
  const storage = { get: async () => ({ envId: 'test-env', accessKey: 'public-key' }) };
  const first = new CloudBaseDocumentProvider({ storage });
  const second = new CloudBaseDocumentProvider({ storage });
  assert.equal(appended, 0);
  await assert.rejects(first.getSession(), { code: 'SDK_UNAVAILABLE' });
  fail = false;
  await Promise.all([first.getSession(), second.getSession()]);
  assert.equal(appended, 2, 'concurrent callers share one retry');
  await first.getSession();
  assert.equal(appended, 2);
})().catch(error => { console.error(error); process.exitCode = 1; });
