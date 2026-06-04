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

{
  const result = SidePanelManager.buildPdfPrintHtml(
    '<!DOCTYPE html><html><head><title>Guide</title><style>main { color: #111; }</style></head><body><main><h1>Guide</h1><p>Save as PDF.</p></main></body></html>',
    'Guide'
  );

  assert.match(result, /<title>Guide<\/title>/);
  assert.match(result, /@page \{ size: A4; margin: 16mm; \}/);
  assert.match(result, /@media print/);
  assert.match(result, /main \{ color: #111; \}/);
  assert.match(result, /<main><h1>Guide<\/h1><p>Save as PDF\.<\/p><\/main>/);
}
