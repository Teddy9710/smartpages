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

{
  assert.equal(SidePanelManager.normalizeImageEditMode('crop'), 'crop');
  assert.equal(SidePanelManager.normalizeImageEditMode('box'), 'box');
  assert.equal(SidePanelManager.normalizeImageEditMode('number'), 'number');
  assert.equal(SidePanelManager.normalizeImageEditMode('blur'), 'blur');
  assert.equal(SidePanelManager.normalizeImageEditMode('unknown'), 'crop');
}

{
  assert.equal(SidePanelManager.getNextAnnotationNumber([{ dataset: { annotationNumber: '2' } }]), 3);
  assert.equal(SidePanelManager.getNextAnnotationNumber([{ dataset: { annotationNumber: 'bad' } }]), 1);
}

{
  const result = SidePanelManager.sanitizeHtmlExportCss('body { color: red; }\nmain { max-width: 720px; }');

  assert.equal(result.ok, true);
  assert.equal(result.css, 'body { color: red; }\nmain { max-width: 720px; }');
}

{
  const result = SidePanelManager.sanitizeHtmlExportCss('@import url("https://example.com/theme.css");');

  assert.equal(result.ok, false);
}

{
  const result = SidePanelManager.sanitizeHtmlExportCss('a { background-image: url("javascript:alert(1)"); }');

  assert.equal(result.ok, false);
}

{
  const result = SidePanelManager.sanitizeHtmlExportCss('body { width: expression(alert(1)); }');

  assert.equal(result.ok, false);
}

{
  const result = SidePanelManager.sanitizeHtmlExportCss('</style><script>alert(1)</script>');

  assert.equal(result.ok, false);
}

{
  const result = SidePanelManager.extractMarkdownImageAssets(
    '![步骤1截图](data:image/png;base64,AAAA)\n\n![步骤2截图](data:image/jpeg;base64,BBBB)',
    'document_123_assets'
  );

  assert.equal(result.assets.length, 2);
  assert.equal(result.assets[0].filename, 'document_123_assets/screenshot_01.png');
  assert.equal(result.assets[1].filename, 'document_123_assets/screenshot_02.jpg');
  assert.equal(result.markdown, '![步骤1截图](document_123_assets/screenshot_01.png)\n\n![步骤2截图](document_123_assets/screenshot_02.jpg)');
}

{
  const result = SidePanelManager.extractMarkdownImageAssets(
    '<img alt="步骤1截图" src="data:image/webp;base64,CCCC">',
    'document_123_assets'
  );

  assert.equal(result.assets.length, 1);
  assert.equal(result.assets[0].filename, 'document_123_assets/screenshot_01.webp');
  assert.equal(result.markdown, '<img alt="步骤1截图" src="document_123_assets/screenshot_01.webp">');
}
