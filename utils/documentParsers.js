/**
 * Browser-side PDF and DOCX text extraction.
 * Parsing stays inside the extension and stores extracted text only.
 */

const DocumentParsers = (() => {
  let pdfjsPromise = null;
  let fflatePromise = null;

  function normalizeExtractedText(value) {
    return String(value || '')
      .replace(/\r\n?/g, '\n')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  async function loadPdfJs() {
    if (!pdfjsPromise) {
      const moduleUrl = typeof chrome !== 'undefined' && chrome.runtime?.getURL
        ? chrome.runtime.getURL('libs/pdfjs/pdf.min.mjs')
        : '../libs/pdfjs/pdf.min.mjs';
      pdfjsPromise = import(moduleUrl).then(pdfjs => {
        if (pdfjs.GlobalWorkerOptions) {
          pdfjs.GlobalWorkerOptions.workerSrc = typeof chrome !== 'undefined' && chrome.runtime?.getURL
            ? chrome.runtime.getURL('libs/pdfjs/pdf.worker.min.mjs')
            : '../libs/pdfjs/pdf.worker.min.mjs';
        }
        return pdfjs;
      });
    }
    return pdfjsPromise;
  }

  async function loadFflate() {
    if (!fflatePromise) {
      const moduleUrl = typeof chrome !== 'undefined' && chrome.runtime?.getURL
        ? chrome.runtime.getURL('libs/fflate/browser.js')
        : '../libs/fflate/browser.js';
      fflatePromise = import(moduleUrl);
    }
    return fflatePromise;
  }

  function pageItemsToText(items = []) {
    const lines = [];
    let currentLine = '';
    items.forEach(item => {
      if (!item || typeof item.str !== 'string') return;
      currentLine += item.str;
      if (item.hasEOL) {
        lines.push(currentLine.trimEnd());
        currentLine = '';
      } else if (item.str && !item.str.endsWith(' ')) {
        currentLine += ' ';
      }
    });
    if (currentLine.trim()) lines.push(currentLine.trimEnd());
    return lines.join('\n');
  }

  async function extractPdfText(arrayBuffer, dependencies = {}) {
    const pdfjs = dependencies.pdfjs || await loadPdfJs();
    const data = arrayBuffer instanceof Uint8Array ? arrayBuffer : new Uint8Array(arrayBuffer);
    const assetBase = typeof chrome !== 'undefined' && chrome.runtime?.getURL
      ? chrome.runtime.getURL('libs/pdfjs/')
      : '';
    const loadingTask = pdfjs.getDocument({
      data,
      isEvalSupported: false,
      ...(assetBase ? {
        cMapUrl: `${assetBase}cmaps/`,
        cMapPacked: true,
        standardFontDataUrl: `${assetBase}standard_fonts/`
      } : {})
    });
    const pdf = await loadingTask.promise;
    const pages = [];
    try {
      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        const page = await pdf.getPage(pageNumber);
        const textContent = await page.getTextContent();
        const text = normalizeExtractedText(pageItemsToText(textContent.items));
        if (text) pages.push(`--- 第 ${pageNumber} 页 ---\n${text}`);
        page.cleanup?.();
      }
    } finally {
      if (typeof loadingTask.destroy === 'function') await loadingTask.destroy();
      else await pdf.destroy?.();
    }
    const content = normalizeExtractedText(pages.join('\n\n'));
    if (!content) {
      throw new Error('PDF 中没有可提取的文字；扫描版 PDF 暂不支持 OCR');
    }
    return { content, warnings: [] };
  }

  function decodeXmlEntities(value) {
    return String(value || '')
      .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
      .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number.parseInt(code, 10)))
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&amp;/g, '&');
  }

  function extractWordXmlText(xml) {
    const withLayout = String(xml || '')
      .replace(/<w:tab\b[^>]*\/?\s*>/gi, '\t')
      .replace(/<w:(?:br|cr)\b[^>]*\/?\s*>/gi, '\n')
      .replace(/<\/w:p\s*>/gi, '\n\n')
      .replace(/<\/w:tr\s*>/gi, '\n')
      .replace(/<\/w:tc\s*>/gi, '\t');
    const text = withLayout.replace(/<[^>]+>/g, '');
    return normalizeExtractedText(decodeXmlEntities(text));
  }

  async function extractDocxText(arrayBuffer, dependencies = {}) {
    const fflate = dependencies.fflate || await loadFflate();
    let archive;
    try {
      archive = fflate.unzipSync(new Uint8Array(arrayBuffer));
    } catch {
      throw new Error('DOCX 文件损坏、已加密或不是有效的 Word 文档');
    }
    const documentXml = archive['word/document.xml'];
    if (!documentXml) throw new Error('DOCX 中缺少主文档内容');
    const content = extractWordXmlText(fflate.strFromU8(documentXml));
    if (!content) throw new Error('DOCX 中没有可提取的文字');
    return { content, warnings: [] };
  }

  async function extractDocumentText(arrayBuffer, extension, dependencies = {}) {
    if (extension === 'pdf') return extractPdfText(arrayBuffer, dependencies);
    if (extension === 'docx') return extractDocxText(arrayBuffer, dependencies);
    throw new Error(`不支持的二进制文档格式: ${extension}`);
  }

  return {
    normalizeExtractedText,
    pageItemsToText,
    decodeXmlEntities,
    extractWordXmlText,
    extractPdfText,
    extractDocxText,
    extractDocumentText
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = DocumentParsers;
} else {
  globalThis.DocumentParsers = DocumentParsers;
}
