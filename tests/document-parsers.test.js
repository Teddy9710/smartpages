const assert = require('node:assert/strict');
const {
  normalizeExtractedText,
  pageItemsToText,
  extractWordXmlText,
  extractPdfText,
  extractDocxText
} = require('../utils/documentParsers.js');

assert.equal(normalizeExtractedText('Alpha  \r\n\r\n\r\nBeta'), 'Alpha\n\nBeta');
assert.equal(pageItemsToText([
  { str: 'Hello', hasEOL: false },
  { str: 'world', hasEOL: true },
  { str: 'Next line', hasEOL: true }
]), 'Hello world\nNext line');
assert.equal(
  extractWordXmlText('<w:document><w:body><w:p><w:r><w:t>Hello &amp; world</w:t></w:r></w:p><w:p><w:r><w:t>Next</w:t><w:tab/><w:t>cell</w:t></w:r></w:p></w:body></w:document>'),
  'Hello & world\n\nNext\tcell'
);

(async () => {
  let destroyed = false;
  const pages = [
    [{ str: 'First page', hasEOL: true }],
    [{ str: 'Second', hasEOL: false }, { str: 'page', hasEOL: true }]
  ];
  const pdfjs = {
    getDocument({ data }) {
      assert.ok(data instanceof Uint8Array);
      return {
        async destroy() { destroyed = true; },
        promise: Promise.resolve({
          numPages: pages.length,
          async getPage(pageNumber) {
            return {
              async getTextContent() { return { items: pages[pageNumber - 1] }; },
              cleanup() {}
            };
          },
          async destroy() {}
        })
      };
    }
  };
  const pdfResult = await extractPdfText(new Uint8Array([1, 2, 3]).buffer, { pdfjs });
  assert.match(pdfResult.content, /第 1 页[\s\S]*First page/);
  assert.match(pdfResult.content, /第 2 页[\s\S]*Second page/);
  assert.equal(destroyed, true);

  const documentXml = new TextEncoder().encode(
    '<w:document><w:body><w:p><w:r><w:t>Title</w:t></w:r></w:p><w:p><w:r><w:t>Body</w:t></w:r></w:p></w:body></w:document>'
  );
  const docxResult = await extractDocxText(new ArrayBuffer(4), {
    fflate: {
      unzipSync(data) {
        assert.ok(data instanceof Uint8Array);
        return { 'word/document.xml': documentXml };
      },
      strFromU8(data) { return new TextDecoder().decode(data); }
    }
  });
  assert.equal(docxResult.content, 'Title\n\nBody');
  assert.deepEqual(docxResult.warnings, []);

  await assert.rejects(
    () => extractPdfText(new ArrayBuffer(1), {
      pdfjs: {
        getDocument: () => ({
          promise: Promise.resolve({
            numPages: 1,
            getPage: async () => ({ getTextContent: async () => ({ items: [] }) }),
            destroy: async () => {}
          })
        })
      }
    }),
    /OCR/
  );

  console.log('document parser tests passed');
})().catch(error => {
  console.error(error);
  process.exit(1);
});
