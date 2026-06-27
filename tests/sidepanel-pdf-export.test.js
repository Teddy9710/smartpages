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
  return { SidePanelManager: sandbox.SidePanelManager, sandbox };
}

function toUtf16Hex(value) {
  return String(value).split('').map(char => char.charCodeAt(0).toString(16).padStart(4, '0')).join('').toUpperCase();
}

const { SidePanelManager, sandbox } = loadSidePanelManager();

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
  assert.doesNotMatch(result, /<script\b/i);
  assert.doesNotMatch(result, /window\.print\s*\(/);
}

{
  const result = SidePanelManager.buildTextPdfDocument([
    { text: 'Guide', size: 20 },
    { text: 'Save as PDF.', size: 12 }
  ]);

  assert.ok(ArrayBuffer.isView(result));
  assert.equal(Buffer.from(result.slice(0, 5)).toString('ascii'), '%PDF-');
  assert.match(Buffer.from(result).toString('latin1'), /Guide/);
  assert.match(Buffer.from(result).toString('latin1'), /Save as PDF\./);
}

{
  const line = '\u9875\u9762\u64cd\u4f5c\u8ffd\u8e2a:Tracing';
  const result = SidePanelManager.buildTextPdfDocument([
    { text: `\u{1f517} Teddy9710 \u00b7 smartpages \u00b7 ${line}`, size: 12 }
  ]);
  const pdfText = Buffer.from(result).toString('latin1');

  assert.doesNotMatch(pdfText, /\?\? Teddy9710 \? smartpages \?/);
  assert.doesNotMatch(pdfText, /\(:Tracing\) Tj/);
  assert.match(pdfText, new RegExp(toUtf16Hex('Teddy9710 - smartpages -')));
  assert.match(pdfText, new RegExp(toUtf16Hex(line)));
}

{
  const svg = SidePanelManager.buildPdfSvgMarkup('<div xmlns="http://www.w3.org/1999/xhtml"><img src="data:image/png;base64,AAA=" /></div>', 794, 1123);

  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.match(svg, /<foreignObject width="100%" height="100%">/);
  assert.match(svg, /<img src="data:image\/png;base64,AAA=" \/>/);
}

{
  const events = [];
  let loadHandler;
  const manager = Object.create(SidePanelManager.prototype);
  manager._ensureEditorContentFresh = () => {};
  manager._buildDeliverableHtmlFromCurrentContent = () => '<!DOCTYPE html><html><body><main><h1>Guide</h1></main></body></html>';
  manager._extractDocumentTitle = () => 'Guide';
  manager._getExportBaseName = () => 'Guide';
  manager._showNotification = () => {};
  manager._buildDirectPdfBlob = () => {
    throw new Error('direct PDF builder should not be used');
  };
  sandbox.document.getElementById = id => (id === 'markdown-editor' ? { value: '# Guide' } : null);
  sandbox.setTimeout = (callback, delay) => {
    events.push(`timeout:${delay}`);
    callback();
  };
  sandbox.window.open = () => ({
    addEventListener: (type, handler, options) => {
      events.push(`listener:${type}:${options?.once === true}`);
      loadHandler = handler;
    },
    document: {
      open: () => events.push('open'),
      write: html => events.push(html),
      close: () => events.push('close')
    },
    focus: () => events.push('focus'),
    print: () => events.push('print')
  });

  manager.exportPdfDocument();

  assert.equal(events[0], 'listener:load:true');
  assert.equal(events[1], 'open');
  assert.match(events[2], /<main><h1>Guide<\/h1><\/main>/);
  assert.equal(events[3], 'close');
  assert.equal(typeof loadHandler, 'function');

  loadHandler();

  assert.deepEqual(events.slice(4), ['timeout:250', 'focus', 'print']);
}
