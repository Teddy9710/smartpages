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
  assert.equal(SidePanelManager.getSafeExportFilename('用户/权限:操作*指南?'), '用户_权限_操作_指南');
  assert.equal(SidePanelManager.getSafeExportFilename('   '), 'SmartPages文档');
  assert.equal(SidePanelManager.getSafeExportFilename('CON'), 'SmartPages文档');
}

{
  const manager = Object.create(SidePanelManager.prototype);

  assert.equal(manager._getExportBaseName('# 用户/权限指南\n\n正文'), '用户_权限指南');
  assert.equal(manager._getExportBaseName('<html><head><title>HTML 指南</title></head><body></body></html>'), 'HTML 指南');
  assert.equal(manager._getExportBaseName('纯文本指南\n第二行'), '纯文本指南');
}

{
  const result = SidePanelManager.buildWordDocumentHtml(
    '<!DOCTYPE html><html><head><title>Guide</title></head><body><main><h1>Guide</h1><p>Open in Word.</p></main></body></html>',
    'Guide'
  );

  assert.match(result, /xmlns:o="urn:schemas-microsoft-com:office:office"/);
  assert.match(result, /<meta charset="UTF-8">/);
  assert.match(result, /<meta name="ProgId" content="Word\.Document">/);
  assert.match(result, /<title>Guide<\/title>/);
  assert.match(result, /<main><h1>Guide<\/h1><p>Open in Word\.<\/p><\/main>/);
}

{
  const result = SidePanelManager.buildWordMhtmlDocument(
    '<!DOCTYPE html><html><head><title>Guide</title></head><body><main><img alt="Step" src="data:image/png;base64,AAAA"></main></body></html>',
    'Guide'
  );

  assert.doesNotMatch(result, /src="data:image\/png;base64,AAAA"/);
  assert.match(result, /src=3D"cid:smartpages-image-1\.png"/);
  assert.match(result, /Content-Location: smartpages-image-1\.png/);
  assert.match(result, /Content-Type: image\/png/);
  assert.match(result, /Content-Transfer-Encoding: base64/);
  assert.match(result, /AAAA/);
}

{
  const result = SidePanelManager.buildDeliverableHtml(
    '<!DOCTYPE html><html><head><title>Guide</title></head><body><main><h1>Guide</h1><img src="data:image/png;base64,AAAA"></main></body></html>',
    {
      title: 'Guide',
      sourceTitle: 'Admin Console',
      sourceUrl: 'https://example.test/admin',
      stepCount: 3,
      generatedAt: '2026-06-09T00:00:00.000Z'
    }
  );

  assert.match(result, /<title>Guide<\/title>/);
  assert.match(result, /Source: Admin Console/);
  assert.match(result, /https:\/\/example\.test\/admin/);
  assert.match(result, /Steps: 3/);
  assert.match(result, /@page \{ size: A4; margin: 16mm; \}/);
  assert.match(result, /break-inside: avoid/);
  assert.match(result, /max-width: 100%/);
}

{
  const result = SidePanelManager.buildDeliverableHtml(
    '<html><head><style>body { background: red; } img { max-width: 20px; }</style></head><body><main>Guide</main></body></html>'
  );

  assert.ok(result.indexOf('body { background: red; }') < result.indexOf('body { background: #fff; color: #111827; }'));
  assert.ok(result.indexOf('img { max-width: 20px; }') < result.indexOf('img { max-width: 100%;'));
}
