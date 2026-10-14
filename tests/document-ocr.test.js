const assert = require('node:assert/strict');
const DocumentUploader = require('../utils/documentUpload.js');

(async () => {
  const pages = [{ pageNumber: 1, dataUrl: 'data:image/jpeg;base64,QUJD' }];
  let requested = false;
  const enabledUploader = new DocumentUploader({
    getConfig: async () => ({
      apiKey: 'test-key',
      multimodalEnabled: true,
      pdfOcrEnabled: true
    }),
    requestOcr: async (config, requestedPages) => {
      requested = true;
      assert.equal(config.apiKey, 'test-key');
      assert.deepEqual(requestedPages, pages);
      return '[[PAGE 1]]\nRecognized text';
    }
  });
  assert.equal(await enabledUploader._ocrPdfPages(pages), '[[PAGE 1]]\nRecognized text');
  assert.equal(requested, true);
  const enabledDependencies = await enabledUploader._getParserDependencies('pdf');
  assert.equal(typeof enabledDependencies.ocrPages, 'function');

  const disabledUploader = new DocumentUploader({
    getConfig: async () => ({ apiKey: 'test-key', multimodalEnabled: true, pdfOcrEnabled: false })
  });
  const disabledDependencies = await disabledUploader._getParserDependencies('pdf');
  assert.equal(disabledDependencies.ocrPages, undefined);
  await assert.rejects(() => disabledUploader._ocrPdfPages(pages), /开启.*OCR/);

  const injectedOcr = async () => 'injected';
  const injectedUploader = new DocumentUploader({
    getConfig: async () => ({ pdfOcrEnabled: false }),
    parserDependencies: { ocrPages: injectedOcr }
  });
  assert.equal((await injectedUploader._getParserDependencies('pdf')).ocrPages, injectedOcr);

  const textOnlyUploader = new DocumentUploader({
    getConfig: async () => ({ apiKey: 'test-key', multimodalEnabled: false, pdfOcrEnabled: true })
  });
  await assert.rejects(() => textOnlyUploader._ocrPdfPages(pages), /支持图片输入/);

  const noKeyUploader = new DocumentUploader({
    getConfig: async () => ({ apiKey: '', multimodalEnabled: true, pdfOcrEnabled: true })
  });
  await assert.rejects(() => noKeyUploader._ocrPdfPages(pages), /API Key/);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
