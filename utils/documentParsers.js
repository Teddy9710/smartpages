/**
 * Browser-side PDF and DOCX text extraction.
 * Parsing stays inside the extension and stores extracted text only.
 */

const DocumentParsers = (() => {
  const DEFAULT_MAX_OCR_PAGES = 12;
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

  function parseOcrPageSections(value, expectedPageNumbers = []) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return Object.fromEntries(
        expectedPageNumbers
          .map(pageNumber => [pageNumber, normalizeExtractedText(value[pageNumber] || value[String(pageNumber)] || '')])
          .filter(([, text]) => Boolean(text))
      );
    }

    const response = String(value || '').trim();
    if (!response) return {};
    const sections = {};
    const pattern = /\[\[PAGE\s+(\d+)\]\]\s*([\s\S]*?)(?=\[\[PAGE\s+\d+\]\]|$)/gi;
    let match;
    while ((match = pattern.exec(response))) {
      const pageNumber = Number.parseInt(match[1], 10);
      const text = normalizeExtractedText(match[2]);
      if (expectedPageNumbers.includes(pageNumber) && text) sections[pageNumber] = text;
    }
    if (!Object.keys(sections).length && expectedPageNumbers.length === 1) {
      sections[expectedPageNumbers[0]] = normalizeExtractedText(response);
    }
    return sections;
  }

  async function renderPdfPageToDataUrl(page, dependencies = {}) {
    if (typeof dependencies.renderPage === 'function') {
      return dependencies.renderPage(page);
    }
    if (!page?.getViewport || !page?.render) {
      throw new Error('当前 PDF 页面无法渲染，不能执行 OCR');
    }

    const baseViewport = page.getViewport({ scale: 1 });
    const longestEdge = Math.max(baseViewport.width, baseViewport.height) || 1;
    const scale = Math.max(1, Math.min(2.5, 1800 / longestEdge));
    const viewport = page.getViewport({ scale });
    const canvas = typeof dependencies.createCanvas === 'function'
      ? dependencies.createCanvas()
      : (typeof document !== 'undefined' ? document.createElement('canvas') : null);
    if (!canvas) throw new Error('当前环境无法创建 OCR 图像');

    canvas.width = Math.max(1, Math.ceil(viewport.width));
    canvas.height = Math.max(1, Math.ceil(viewport.height));
    const context = canvas.getContext?.('2d', { alpha: false });
    if (!context) throw new Error('当前环境无法渲染 OCR 图像');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    const renderTask = page.render({ canvasContext: context, viewport, background: '#ffffff' });
    await (renderTask?.promise || renderTask);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
    canvas.width = 1;
    canvas.height = 1;
    return dataUrl;
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
    const warnings = [];
    const ocrCandidates = [];
    const maxOcrPages = Number.isInteger(dependencies.maxOcrPages)
      ? Math.max(1, dependencies.maxOcrPages)
      : DEFAULT_MAX_OCR_PAGES;
    try {
      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        const page = await pdf.getPage(pageNumber);
        try {
          const textContent = await page.getTextContent();
          const text = normalizeExtractedText(pageItemsToText(textContent.items));
          pages.push({ pageNumber, text });
          if (!text && typeof dependencies.ocrPages === 'function') {
            if (ocrCandidates.length < maxOcrPages) {
              const dataUrl = await renderPdfPageToDataUrl(page, dependencies);
              ocrCandidates.push({ pageNumber, dataUrl });
            } else {
              warnings.push(`第 ${pageNumber} 页没有文本层，已超过单次 ${maxOcrPages} 页的 OCR 上限`);
            }
          }
        } finally {
          page.cleanup?.();
        }
      }

      if (ocrCandidates.length) {
        try {
          const ocrResponse = await dependencies.ocrPages(ocrCandidates);
          const expectedPages = ocrCandidates.map(candidate => candidate.pageNumber);
          const ocrSections = parseOcrPageSections(ocrResponse, expectedPages);
          pages.forEach(page => {
            if (!page.text && ocrSections[page.pageNumber]) {
              page.text = ocrSections[page.pageNumber];
              page.ocrUsed = true;
            }
          });
          expectedPages
            .filter(pageNumber => !ocrSections[pageNumber])
            .forEach(pageNumber => warnings.push(`第 ${pageNumber} 页 OCR 未返回可用文字`));
        } catch (error) {
          throw new Error(`扫描页 OCR 失败：${error.message}`);
        }
      }
    } finally {
      if (typeof loadingTask.destroy === 'function') await loadingTask.destroy();
      else await pdf.destroy?.();
    }
    const extractedPages = pages.filter(page => page.text);
    const content = normalizeExtractedText(
      extractedPages.map(page => `--- 第 ${page.pageNumber} 页 ---\n${page.text}`).join('\n\n')
    );
    if (!content) {
      throw new Error(typeof dependencies.ocrPages === 'function'
        ? 'PDF 中没有可提取或可识别的文字'
        : 'PDF 中没有可提取的文字；请在设置中开启扫描版 PDF AI OCR');
    }
    return {
      content,
      warnings,
      ocrPageCount: pages.filter(page => page.ocrUsed === true).length
    };
  }

  function decodeXmlEntities(value) {
    const decodeCodePoint = (code, radix) => {
      const value = Number.parseInt(code, radix);
      if (!Number.isInteger(value) || value < 0 || value > 0x10FFFF ||
          (value >= 0xD800 && value <= 0xDFFF)) {
        return '\uFFFD';
      }
      return String.fromCodePoint(value);
    };
    return String(value || '')
      .replace(/&#x([0-9a-f]+);/gi, (_, code) => decodeCodePoint(code, 16))
      .replace(/&#(\d+);/g, (_, code) => decodeCodePoint(code, 10))
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
    DEFAULT_MAX_OCR_PAGES,
    normalizeExtractedText,
    pageItemsToText,
    parseOcrPageSections,
    renderPdfPageToDataUrl,
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
