const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadSidePanelManager() {
  const source = fs.readFileSync(path.join(__dirname, '..', 'sidepanel', 'sidepanel.js'), 'utf8');
  const sandbox = {
    console,
    DocumentApi: class {},
    DocUIHelper: class {},
    debounce: (fn) => fn,
    chrome: {
      runtime: {
        onMessage: { addListener: () => {} },
        sendMessage: () => Promise.resolve({})
      },
      storage: {
        sync: {
          get: () => Promise.resolve({})
        }
      },
      tabs: {
        query: () => Promise.resolve([])
      }
    },
    document: {
      addEventListener: () => {},
      getElementById: () => null,
      querySelector: () => null
    },
    window: {
      addEventListener: () => {},
      innerWidth: 1280,
      innerHeight: 800
    }
  };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(`${source}\nglobalThis.SidePanelManager = SidePanelManager;`, sandbox);
  return sandbox.SidePanelManager;
}

const SidePanelManager = loadSidePanelManager();

function assertRect(actual, expected) {
  assert.deepEqual(JSON.parse(JSON.stringify(actual)), expected);
}

{
  const rect = SidePanelManager.getAutoHighlightRect(
    { x: 500, y: 250 },
    { naturalWidth: 1000, naturalHeight: 500 }
  );

  assertRect(rect, { x: 455, y: 205, width: 90, height: 90 });
}

{
  const rect = SidePanelManager.getAutoHighlightRect(
    { x: 20, y: 15 },
    { naturalWidth: 1000, naturalHeight: 500 }
  );

  assertRect(rect, { x: 0, y: 0, width: 90, height: 90 });
}

{
  const rect = SidePanelManager.getAutoHighlightRect(
    { x: 3900, y: 2900 },
    { naturalWidth: 4000, naturalHeight: 3000 }
  );

  assertRect(rect, { x: 3780, y: 2780, width: 220, height: 220 });
}
