/* eslint-disable no-unreachable */
/**
 * SmartPages - Side Panel Manager
 *
 * Manages the side panel UI for document generation and editing.
 * Uses DocUIHelper for shared document management logic.
 *
 * @module sidepanel
 */

// ============================================================================
// CONSTANTS
// ============================================================================

/** @constant {Object} StateViews - Available state views */
const StateViews = {
  EMPTY: 'empty',
  LOADING: 'loading',
  DESCRIPTION: 'description',
  EDITOR: 'document-editor',
  ERROR: 'error',
  DOCUMENTS: 'documents'
};

/** @constant {Object} DefaultDescriptions - Default document descriptions */
const DefaultDescriptions = [
  { value: 'user-guide', label: '用户操作指南', description: '生成一份详细的用户操作指南' },
  { value: 'tutorial', label: '教程文档', description: '生成一份新手教程文档' },
  { value: 'testing', label: '测试用例', description: '生成测试用例文档' },
  { value: 'bug-report', label: '问题报告', description: '生成问题报告文档' }
];

// ============================================================================
// SIDEPANEL MANAGER CLASS
// ============================================================================

class SidePanelManager {
  static getImageExtensionFromDataUrl(dataUrl, extHint) {
    const mime = String(dataUrl || '').match(/^data:image\/([^;,]+)/i)?.[1] || extHint || 'jpg';
    if (mime === 'jpeg') return 'jpg';
    if (mime === 'svg+xml') return 'svg';
    return mime.replace(/[^a-z0-9]/gi, '').toLowerCase() || 'jpg';
  }

  static extractMarkdownImageAssets(markdown, assetDir) {
    const assets = [];
    let assetIndex = 0;
    const nextAsset = (dataUrl, extHint) => {
      assetIndex += 1;
      const ext = SidePanelManager.getImageExtensionFromDataUrl(dataUrl, extHint);
      const filename = `${assetDir}/screenshot_${String(assetIndex).padStart(2, '0')}.${ext}`;
      assets.push({ filename, dataUrl });
      return filename;
    };
    let linkedMarkdown = String(markdown || '').replace(
      /!\[([^\]]*)\]\((data:image\/([a-z0-9.+-]+);base64,[a-z0-9+/=]+)\)/gi,
      (_match, alt, dataUrl, extHint) => `![${alt}](${nextAsset(dataUrl, extHint)})`
    );
    linkedMarkdown = linkedMarkdown.replace(
      /src=(["'])(data:image\/([a-z0-9.+-]+);base64,[a-z0-9+/=]+)\1/gi,
      (_match, quote, dataUrl, extHint) => `src=${quote}${nextAsset(dataUrl, extHint)}${quote}`
    );
    return { markdown: linkedMarkdown, assets };
  }

  static sanitizeHtmlExportCss(css) {
    const normalized = String(css || '').trim();
    if (!normalized) {
      return { ok: false, css: '', reason: 'empty' };
    }
    if (
      /@import\b/i.test(normalized) ||
      /javascript\s*:/i.test(normalized) ||
      /expression\s*\(/i.test(normalized) ||
      /<\/?script\b/i.test(normalized) ||
      /<\/style\b/i.test(normalized)
    ) {
      return { ok: false, css: '', reason: 'unsafe' };
    }
    return { ok: true, css: normalized };
  }

  static buildWordDocumentHtml(html, title = 'SmartPages Document') {
    const value = String(html || '');
    const bodyHtml = value.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] || value;
    const styleHtml = Array.from(value.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi))
      .map(match => match[1] || '')
      .join('\n');
    const parsedTitle = value.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim();
    const escapedTitle = SidePanelManager.escapeHtml(title || parsedTitle || 'SmartPages Document');
    return `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta charset="UTF-8">
  <meta name="ProgId" content="Word.Document">
  <meta name="Generator" content="SmartPages">
  <title>${escapedTitle}</title>
  <!--[if gte mso 9]>
  <xml>
    <w:WordDocument>
      <w:View>Print</w:View>
      <w:Zoom>100</w:Zoom>
      <w:DoNotOptimizeForBrowser/>
    </w:WordDocument>
  </xml>
  <![endif]-->
  <style>
${styleHtml}
  </style>
</head>
<body>
${bodyHtml}
</body>
</html>`;
  }

  static buildWordMhtmlDocument(html, title = 'SmartPages Document') {
    const boundary = '----=_SmartPages_Word_Export';
    const assets = [];
    const wordHtml = SidePanelManager.buildWordDocumentHtml(html, title).replace(
      /src=(["'])(data:image\/([a-z0-9.+-]+);base64,([a-z0-9+/=]+))\1/gi,
      (_match, quote, _dataUrl, extHint, base64) => {
        const ext = SidePanelManager.getImageExtensionFromDataUrl(`data:image/${extHint};base64,`, extHint);
        const mimeType = extHint === 'svg+xml' ? 'image/svg+xml' : `image/${ext === 'jpg' ? 'jpeg' : ext}`;
        const filename = `smartpages-image-${assets.length + 1}.${ext}`;
        assets.push({ filename, mimeType, base64 });
        return `src=${quote}cid:${filename}${quote}`;
      }
    );
    const parts = [
      `MIME-Version: 1.0
Content-Type: multipart/related; boundary="${boundary}"

--${boundary}
Content-Type: text/html; charset="utf-8"
Content-Transfer-Encoding: quoted-printable
Content-Location: smartpages-document.html

${SidePanelManager.encodeQuotedPrintable(wordHtml)}`
    ];
    assets.forEach(asset => {
      parts.push(`--${boundary}
Content-Type: ${asset.mimeType}
Content-Transfer-Encoding: base64
Content-Location: ${asset.filename}

${SidePanelManager.wrapBase64(asset.base64)}`);
    });
    parts.push(`--${boundary}--`);
    return parts.join('\n\n');
  }

  static encodeQuotedPrintable(value) {
    return String(value || '')
      .replace(/=/g, '=3D')
      .replace(/\r?\n/g, '\r\n');
  }

  static wrapBase64(value) {
    return String(value || '').replace(/(.{76})/g, '$1\n').trim();
  }

  static getSafeExportFilename(title, fallback = 'SmartPages文档') {
    const reservedNames = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
    const normalized = String(title || '')
      .replace(/<[^>]+>/g, '')
      .replace(/[\\/:*?"<>|]+/g, '_')
      .split('').filter(char => char >= ' ').join('')
      .replace(/\s+/g, ' ')
      .replace(/^_+|_+$/g, '')
      .replace(/[. ]+$/g, '')
      .trim()
      .slice(0, 120);
    if (!normalized || reservedNames.test(normalized)) return fallback;
    return normalized;
  }

  static buildPdfPrintHtml(html, title = 'SmartPages Document') {
    const value = String(html || '');
    const bodyHtml = value.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] || value;
    const styleHtml = Array.from(value.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi))
      .map(match => match[1] || '')
      .join('\n');
    const parsedTitle = value.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim();
    const escapedTitle = SidePanelManager.escapeHtml(title || parsedTitle || 'SmartPages Document');
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapedTitle}</title>
  <style>
${styleHtml}
    @page { size: A4; margin: 16mm; }
    @media print {
      html, body { background: #fff !important; }
      main { min-height: auto !important; box-shadow: none !important; }
      img { page-break-inside: avoid; break-inside: avoid; }
      h1, h2, h3 { page-break-after: avoid; break-after: avoid; }
      table, blockquote, pre { page-break-inside: avoid; break-inside: avoid; }
    }
  </style>
</head>
<body>
${bodyHtml}
  <script>
    window.addEventListener('load', () => {
      setTimeout(() => window.print(), 250);
    });
  </script>
</body>
</html>`;
  }

  static buildPdfSvgMarkup(xhtml, width, height) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><foreignObject width="100%" height="100%">${xhtml}</foreignObject></svg>`;
  }

  static serializePdfHostXhtml(host, width) {
    const wrapper = document.createElement('div');
    wrapper.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
    wrapper.setAttribute('style', `width:${width}px;background:#fff;`);
    Array.from(host.childNodes || []).forEach(node => {
      wrapper.appendChild(node.cloneNode(true));
    });
    if (typeof XMLSerializer !== 'undefined') {
      return new XMLSerializer().serializeToString(wrapper);
    }
    return `<div xmlns="http://www.w3.org/1999/xhtml" style="width:${width}px;background:#fff;">${host.innerHTML}</div>`;
  }

  static buildDeliverableHtml(html, options = {}) {
    const value = String(html || '');
    const bodyHtml = value.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] || value;
    const styleHtml = Array.from(value.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi))
      .map(match => match[1] || '')
      .join('\n');
    const parsedTitle = value.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim();
    const title = options.title || parsedTitle || 'SmartPages Document';
    const sourceTitle = options.sourceTitle || '';
    const sourceUrl = options.sourceUrl || '';
    const stepCount = Number.isFinite(options.stepCount) ? options.stepCount : null;
    const generatedAt = options.generatedAt || new Date().toISOString();
    const metaItems = [
      sourceTitle ? `Source: ${SidePanelManager.escapeHtml(sourceTitle)}` : '',
      sourceUrl ? `URL: ${SidePanelManager.escapeHtml(sourceUrl)}` : '',
      stepCount !== null ? `Steps: ${stepCount}` : '',
      `Generated: ${SidePanelManager.escapeHtml(generatedAt.slice(0, 10))}`
    ].filter(Boolean);

    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="Generator" content="SmartPages">
  <title>${SidePanelManager.escapeHtml(title)}</title>
  <style>
${styleHtml}
    @page { size: A4; margin: 16mm; }
    body { background: #fff; color: #111827; }
    .smartpages-export-meta {
      margin: 0 0 24px;
      padding: 12px 14px;
      border: 1px solid #d1d5db;
      border-radius: 6px;
      background: #f9fafb;
      color: #4b5563;
      font: 12px/1.5 Arial, sans-serif;
    }
    .smartpages-export-meta span { display: inline-block; margin-right: 16px; }
    img { max-width: 100%; height: auto; break-inside: avoid; page-break-inside: avoid; }
    table, blockquote, pre, figure { break-inside: avoid; page-break-inside: avoid; }
    h1, h2, h3 { break-after: avoid; page-break-after: avoid; }
    @media print {
      html, body { background: #fff !important; }
      main { box-shadow: none !important; min-height: auto !important; }
      a { color: inherit; text-decoration: none; }
    }
  </style>
</head>
<body>
  <div class="smartpages-export-meta">${metaItems.map(item => `<span>${item}</span>`).join('')}</div>
${bodyHtml}
</body>
</html>`;
  }

  static getStepScreenshotStatus(step) {
    if (step?.includeScreenshot === false) return 'hidden';
    return step?.screenshot ? 'available' : 'missing';
  }

  static buildTextPdfDocument(lines) {
    const pageWidth = 595;
    const pageHeight = 842;
    const margin = 54;
    let y = pageHeight - margin;
    const commands = ['BT', '/F1 12 Tf'];
    (lines || []).forEach((line) => {
      const size = Number(line?.size) || 12;
      const text = SidePanelManager.normalizePdfFallbackText(line?.text || '');
      if (!text) return;
      const useCjkFont = /[^\x20-\x7e]/.test(text);
      const fontName = useCjkFont ? 'F2' : 'F1';
      const textOperand = useCjkFont
        ? `<${SidePanelManager.encodePdfUtf16Hex(text)}>`
        : `(${SidePanelManager.escapePdfLiteralText(text)})`;
      commands.push(`/${fontName} ${size} Tf`);
      commands.push(`${margin} ${y} Td ${textOperand} Tj`);
      commands.push(`${-margin} ${-Math.round(size * 1.55)} Td`);
      y -= Math.round(size * 1.55);
      if (y < margin) y = pageHeight - margin;
    });
    commands.push('ET');
    const stream = commands.join('\n');
    return SidePanelManager.buildPdfFromObjects([
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 4 0 R /F2 6 0 R >> >> /Contents 5 0 R >>`,
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
      `<< /Length ${SidePanelManager.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
      '<< /Type /Font /Subtype /Type0 /BaseFont /STSong-Light /Encoding /UniGB-UCS2-H /DescendantFonts [7 0 R] >>',
      '<< /Type /Font /Subtype /CIDFontType0 /BaseFont /STSong-Light /CIDSystemInfo << /Registry (Adobe) /Ordering (GB1) /Supplement 5 >> >>'
    ]);
  }

  static buildImagePdfDocument(pages) {
    const pageWidth = 595;
    const pageHeight = 842;
    const objects = ['<< /Type /Catalog /Pages 2 0 R >>'];
    const pageRefs = [];
    const imagePages = (pages || []).filter(page => page?.dataUrl);
    const pageCount = Math.max(1, imagePages.length);
    const pagesObjectIndex = 2;
    let nextObjectIndex = 3;
    imagePages.forEach((page, index) => {
      const pageObjectIndex = nextObjectIndex;
      const imageObjectIndex = nextObjectIndex + 1;
      const contentObjectIndex = nextObjectIndex + 2;
      nextObjectIndex += 3;
      pageRefs.push(`${pageObjectIndex} 0 R`);
      const imageBytes = SidePanelManager.dataUrlBase64ToBytes(page.dataUrl);
      const draw = `q\n${pageWidth} 0 0 ${pageHeight} 0 0 cm\n/Im${index + 1} Do\nQ`;
      objects[pageObjectIndex - 1] = `<< /Type /Page /Parent ${pagesObjectIndex} 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Im${index + 1} ${imageObjectIndex} 0 R >> >> /Contents ${contentObjectIndex} 0 R >>`;
      objects[imageObjectIndex - 1] = {
        header: `<< /Type /XObject /Subtype /Image /Width ${Math.max(1, Math.round(page.width || 1))} /Height ${Math.max(1, Math.round(page.height || 1))} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${imageBytes.length} >>\nstream\n`,
        body: imageBytes,
        footer: '\nendstream'
      };
      objects[contentObjectIndex - 1] = `<< /Length ${SidePanelManager.byteLength(draw)} >>\nstream\n${draw}\nendstream`;
    });
    if (!imagePages.length) {
      return SidePanelManager.buildTextPdfDocument([{ text: 'SmartPages Document', size: 18 }]);
    }
    objects[pagesObjectIndex - 1] = `<< /Type /Pages /Kids [${pageRefs.join(' ')}] /Count ${pageCount} >>`;
    return SidePanelManager.buildPdfFromObjects(objects);
  }

  static buildPdfFromObjects(objects) {
    const chunks = [SidePanelManager.stringToBytes('%PDF-1.4\n')];
    const offsets = [0];
    let offset = chunks[0].length;
    objects.forEach((object, index) => {
      offsets.push(offset);
      const header = SidePanelManager.stringToBytes(`${index + 1} 0 obj\n`);
      chunks.push(header);
      offset += header.length;
      if (typeof object === 'string') {
        const bytes = SidePanelManager.stringToBytes(`${object}\n`);
        chunks.push(bytes);
        offset += bytes.length;
      } else {
        const headerBytes = SidePanelManager.stringToBytes(object.header);
        const footerBytes = SidePanelManager.stringToBytes(object.footer);
        chunks.push(headerBytes, object.body, footerBytes);
        offset += headerBytes.length + object.body.length + footerBytes.length;
      }
      const end = SidePanelManager.stringToBytes('endobj\n');
      chunks.push(end);
      offset += end.length;
    });
    const xrefOffset = offset;
    const xref = [
      'xref',
      `0 ${objects.length + 1}`,
      '0000000000 65535 f ',
      ...offsets.slice(1).map(value => `${String(value).padStart(10, '0')} 00000 n `),
      'trailer',
      `<< /Size ${objects.length + 1} /Root 1 0 R >>`,
      'startxref',
      String(xrefOffset),
      '%%EOF'
    ].join('\n');
    chunks.push(SidePanelManager.stringToBytes(xref));
    const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const output = new Uint8Array(total);
    let cursor = 0;
    chunks.forEach(chunk => {
      output.set(chunk, cursor);
      cursor += chunk.length;
    });
    return output;
  }

  static stringToBytes(value) {
    const bytes = new Uint8Array(String(value).length);
    for (let i = 0; i < bytes.length; i += 1) {
      bytes[i] = String(value).charCodeAt(i) & 0xff;
    }
    return bytes;
  }

  static byteLength(value) {
    return SidePanelManager.stringToBytes(value).length;
  }

  static escapePdfText(value) {
    return SidePanelManager.escapePdfLiteralText(SidePanelManager.normalizePdfFallbackText(value));
  }

  static escapePdfLiteralText(value) {
    return String(value || '')
      .replace(/\\/g, '\\\\')
      .replace(/\(/g, '\\(')
      .replace(/\)/g, '\\)');
  }

  static normalizePdfFallbackText(value) {
    return String(value || '')
      .normalize('NFKC')
      .replace(/[\u{1f300}-\u{1faff}\u{2600}-\u{27bf}]/gu, '')
      .replace(/[\u00b7\u2022\u2027\u2219]/g, '-')
      .replace(/[\u2010-\u2015\u2212]/g, '-')
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201c\u201d]/g, '"')
      .replace(/\u3000/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  static encodePdfUtf16Hex(value) {
    const normalized = String(value || '');
    let hex = 'FEFF';
    for (let i = 0; i < normalized.length; i += 1) {
      hex += normalized.charCodeAt(i).toString(16).padStart(4, '0');
    }
    return hex.toUpperCase();
  }

  static dataUrlBase64ToBytes(dataUrl) {
    const base64 = String(dataUrl || '').split(',')[1] || '';
    if (typeof atob === 'function') {
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
      return bytes;
    }
    return new Uint8Array(Buffer.from(base64, 'base64'));
  }

  static escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  static getAutoHighlightRect(point, image) {
    const imageWidth = Math.max(0, image?.naturalWidth || 0);
    const imageHeight = Math.max(0, image?.naturalHeight || 0);
    if (!point || imageWidth <= 0 || imageHeight <= 0) {
      return { x: 0, y: 0, width: 0, height: 0 };
    }

    const shortSide = Math.min(imageWidth, imageHeight);
    const targetSize = Math.round(Math.min(220, Math.max(80, shortSide * 0.18)));
    const size = Math.min(targetSize, shortSide);
    const x = Math.min(Math.max(0, Math.round(point.x - size / 2)), imageWidth - size);
    const y = Math.min(Math.max(0, Math.round(point.y - size / 2)), imageHeight - size);
    return { x, y, width: size, height: size };
  }

  static normalizeImageEditMode(mode) {
    return ['crop', 'box', 'number', 'blur'].includes(mode) ? mode : 'crop';
  }

  static getNextAnnotationNumber(images) {
    const values = Array.from(images || [])
      .map(image => Number.parseInt(image?.dataset?.annotationNumber, 10))
      .filter(Number.isFinite);
    return values.length ? Math.max(...values) + 1 : 1;
  }

  constructor() {
    this.currentState = StateViews.EMPTY;
    this.session = null;
    this.config = null;
    this.originalBeforeOptimization = null;
    this.isOptimizing = false;
    this.documentApi = new DocumentApi();
    this.docUI = new DocUIHelper({
      api: this.documentApi,
      source: 'sidepanel',
      onNotify: (msg, type) => this._showNotification(msg, type),
      getApi: () => this.documentApi
    });
    this.cleanupFunctions = [];
    this.toastContainer = null;
    this.imageCropState = {
      imageElement: null,
      sourceImage: null,
      rect: null,
      isDragging: false,
      start: null,
      mode: 'crop',
      displayScale: 1,
      canvasScale: 1
    };
    this.htmlExportStyle = {
      mode: 'default',
      customCss: '',
      customName: ''
    };
    this.init();
  }

  async init() {
    await this._applyLanguage();
    this._bindEvents();
    await this._checkForPendingSession();
  }

  // ========================================================================
  // EVENT BINDING
  // ========================================================================

  _bindEvents() {
    this._bindButton('btn-new', () => this.newDocument());
    this._bindButton('btn-start-here', () => this.startRecordingHere());
    this._bindButton('btn-generate', () => this.generateDocument());
    this._bindButton('btn-retry', () => this.retry());
    this._bindButton('btn-preview', () => this.switchToPreview());
    this._bindButton('btn-edit', () => this.switchToEdit());
    this._bindButton('btn-copy', () => this.copyDocument());
    this._bindButton('btn-download', () => this.downloadDocument());
    this._bindButton('btn-export-html', () => this.exportHtmlDocument());
    this._bindButton('btn-export-word', () => this.exportWordDocument());
    this._bindButton('btn-export-pdf', () => this.exportPdfDocument());
    this._bindButton('btn-clear-cache', () => this.clearRecordingCache());
    this._bindButton('btn-ai-optimize', () => this.openOptimizeDialog());
    this._bindButton('btn-revert-optimization', () => this.revertOptimization());
    this._bindButton('btn-close-optimize', () => this.closeOptimizeDialog());
    this._bindButton('btn-cancel-optimize', () => this.closeOptimizeDialog());
    this._bindButton('btn-run-optimize', () => this.optimizeCurrentDocument());
    this._bindButton('btn-documents', () => this.showDocumentsPanel());
    this._bindButton('btn-close-documents', () => this.hideDocumentsPanel());
    this._bindButton('btn-close-image-crop', () => this.closeImageCropDialog());
    this._bindButton('btn-cancel-image-crop', () => this.closeImageCropDialog());
    this._bindButton('btn-reset-image-crop', () => this.resetImageCropSelection());
    this._bindButton('btn-apply-image-crop', () => this.applyImageCrop());
    this._bindButton('btn-image-mode-crop', () => this.setImageEditMode('crop'));
    this._bindButton('btn-image-mode-box', () => this.setImageEditMode('box'));
    this._bindButton('btn-image-mode-number', () => this.setImageEditMode('number'));
    this._bindButton('btn-image-mode-blur', () => this.setImageEditMode('blur'));
    this._bindButton('btn-upload-html-css', () => this._openHtmlCssFilePicker());
    this._bindHtmlExportStyleEvents();
    this._bindEditorEvents();
    this._bindImageCropEvents();
    this._bindDocumentUploadEvents('sidepanel');
  }

  _bindButton(buttonId, handler) {
    const button = document.getElementById(buttonId);
    if (button) {
      const wrappedHandler = handler.bind(this);
      button.addEventListener('click', wrappedHandler);
      this.cleanupFunctions.push(() => button.removeEventListener('click', wrappedHandler));
    } else {
      console.warn(`[Scribe:SidePanel] Button '${buttonId}' not found`);
    }
  }

  _bindHtmlExportStyleEvents() {
    const styleMode = document.getElementById('export-style-mode');
    const cssFile = document.getElementById('html-css-file');
    if (styleMode) {
      const handleStyleModeChange = () => this._handleHtmlExportStyleModeChange();
      styleMode.addEventListener('change', handleStyleModeChange);
      this.cleanupFunctions.push(() => styleMode.removeEventListener('change', handleStyleModeChange));
    }
    if (cssFile) {
      const handleCssFileChange = (event) => this._handleHtmlCssFileChange(event);
      cssFile.addEventListener('change', handleCssFileChange);
      this.cleanupFunctions.push(() => cssFile.removeEventListener('change', handleCssFileChange));
    }
  }

  _bindEditorEvents() {
    const editor = document.getElementById('markdown-editor');
    const preview = document.getElementById('markdown-preview');

    if (editor) {
      const handleEditorInput = debounce(() => {
        if (document.getElementById('preview-pane')?.classList.contains('active')) {
          this._updatePreview(editor.value);
        }
      }, 120);
      editor.addEventListener('input', handleEditorInput);
      this.cleanupFunctions.push(() => editor.removeEventListener('input', handleEditorInput));
    }

    if (preview) {
      const handlePreviewInput = debounce(() => this._syncPreviewToEditor(), 120);
      const handlePreviewClick = (event) => {
        const image = event.target?.closest?.('img[data-image-editable="true"]');
        if (!image || !preview.contains(image)) return;
        event.preventDefault();
        this.openImageCropDialog(image);
      };
      const handlePreviewKeydown = (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        const image = event.target?.closest?.('img[data-image-editable="true"]');
        if (!image || !preview.contains(image)) return;
        event.preventDefault();
        this.openImageCropDialog(image);
      };
      preview.addEventListener('input', handlePreviewInput);
      preview.addEventListener('click', handlePreviewClick);
      preview.addEventListener('keydown', handlePreviewKeydown);
      this.cleanupFunctions.push(() => preview.removeEventListener('input', handlePreviewInput));
      this.cleanupFunctions.push(() => preview.removeEventListener('click', handlePreviewClick));
      this.cleanupFunctions.push(() => preview.removeEventListener('keydown', handlePreviewKeydown));
    }
  }

  _bindImageCropEvents() {
    const canvas = document.getElementById('image-crop-canvas');
    if (!canvas) return;

    const handlePointerDown = (event) => this._startImageCropDrag(event);
    const handlePointerMove = (event) => this._moveImageCropDrag(event);
    const handlePointerUp = (event) => this._endImageCropDrag(event);

    canvas.addEventListener('pointerdown', handlePointerDown);
    canvas.addEventListener('pointermove', handlePointerMove);
    canvas.addEventListener('pointerup', handlePointerUp);
    canvas.addEventListener('pointercancel', handlePointerUp);

    this.cleanupFunctions.push(() => {
      canvas.removeEventListener('pointerdown', handlePointerDown);
      canvas.removeEventListener('pointermove', handlePointerMove);
      canvas.removeEventListener('pointerup', handlePointerUp);
      canvas.removeEventListener('pointercancel', handlePointerUp);
    });
  }

  _bindDocumentUploadEvents(source) {
    const d = this.docUI;
    const browseBtn = document.getElementById(`${source}-browse-btn`);
    const fileInput = document.getElementById(`${source}-document-file`);
    const uploadArea = document.getElementById(`${source}-upload-area`);
    const refreshBtn = document.getElementById(`${source}-refresh-documents`);
    const searchInput = document.getElementById(`${source}-search-documents`);

    if (browseBtn && fileInput) {
      browseBtn.addEventListener('click', () => fileInput.click());
      fileInput.addEventListener('change', (e) => d.handleFileSelect(e));
    }
    if (uploadArea) {
      uploadArea.addEventListener('click', () => fileInput?.click());
      uploadArea.addEventListener('dragover', (e) => d.handleDragOver(e));
      uploadArea.addEventListener('dragleave', (e) => d.handleDragLeave(e));
      uploadArea.addEventListener('drop', (e) => d.handleDrop(e));
    }
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => d.loadDocumentsList());
    }
    if (searchInput) {
      searchInput.addEventListener('input', debounce((e) => d.searchDocuments(e.target.value)));
    }
  }

  // ========================================================================
  // STATE MANAGEMENT
  // ========================================================================

  async _checkForPendingSession() {
    try {
      const response = await sendMessage({ type: 'GET_RECORDING_STATE' });
      if (response?.state === 'stopped' && response?.session) {
        this.session = response.session;
        this._showDescriptionSelector();
      } else {
        this._showEmptyState();
      }
    } catch (error) {
      console.error('[Scribe:SidePanel] Failed to get recording state:', error);
      this._showEmptyState();
    }
  }

  setState(newState) {
    document.querySelectorAll('.state-view').forEach(view => {
      view.classList.remove('active');
      view.classList.add('hidden');
    });
    const el = document.getElementById(`${newState}-state`);
    if (el) { el.classList.remove('hidden'); el.classList.add('active'); }
    this.currentState = newState;
  }

  _showEmptyState() { this.setState(StateViews.EMPTY); }

  showLoadingState(text = '正在处理...') {
    const t = document.getElementById('loading-text');
    if (t) t.textContent = text;
    this.setState(StateViews.LOADING);
  }

  _showDescriptionSelector() {
    this.setState(StateViews.DESCRIPTION);
    this._renderDescriptionOptions();
    this._renderStepEditor();
  }

  showErrorState(message) {
    const el = document.getElementById('error-message');
    if (el) el.textContent = message;
    this.setState(StateViews.ERROR);
  }

  showEditor() { this.setState(StateViews.EDITOR); }

  showDocumentsPanel() { this.setState(StateViews.DOCUMENTS); this.docUI.loadDocumentsList(); }
  hideDocumentsPanel() { this._showEmptyState(); }

  async _applyLanguage() {
    const config = await loadConfig().catch(() => ({ appLanguage: DEFAULT_APP_LANGUAGE }));
    this.language = config.appLanguage === 'en-US' ? 'en-US' : 'zh-CN';
    document.documentElement.lang = this.language;
    const isEn = this.language === 'en-US';
    const text = isEn ? {
      title: 'Document Generator',
      subtitle: 'Turn browser workflows into docs',
      docsTitle: 'Reference Documents',
      uploadTitle: 'Upload reference documents',
      uploadHelp: 'Supported formats: PDF, DOCX, TXT, MD, HTML',
      browse: 'Browse Files',
      search: 'Search documents...',
      refresh: 'Refresh',
      loading: 'Processing...',
      descTitle: 'Choose document type',
      custom: 'Custom',
      customPlaceholder: 'Describe the document you want...',
      generate: 'Generate Document',
      preview: 'Preview',
      edit: 'Edit',
      optimize: 'Optimize',
      revert: 'Revert',
      copy: 'Copy',
      download: 'Download',
      html: 'HTML',
      word: 'Word',
      pdf: 'PDF',
      imageMode: 'Images',
      imageInline: 'Inline',
      imageLinked: 'Package',
      styleMode: 'Style',
      styleDefault: 'Default',
      styleUpload: 'Upload CSS',
      styleAi: 'AI CSS',
      uploadCss: 'Upload CSS',
      cssLoaded: 'CSS style loaded: {{filename}}.',
      cssInvalid: 'This CSS cannot be used. Remove @import, javascript:, or expression().',
      clearCache: 'Clear Cache',
      emptyTitle: 'No recording yet',
      emptyDesc: 'Start recording from the current tab, then generate a document here.',
      start: 'Start Recording',
      errorTitle: 'Something went wrong',
      retry: 'Retry',
      optimizeTitle: 'AI Optimize',
      optimizePlaceholder: 'Tell AI how to improve this document...',
      cancel: 'Cancel',
      runOptimize: 'Start Optimization',
      stepsTitle: 'Recorded Steps',
      stepsSummary: 'Delete, reorder, or rewrite step notes before generation.'
    } : {
      title: '文档生成器',
      subtitle: '将浏览器操作流程转换为文档',
      docsTitle: '参考文档',
      uploadTitle: '上传参考文档',
      uploadHelp: '支持格式: PDF, DOCX, TXT, MD, HTML',
      browse: '浏览文件',
      search: '搜索文档...',
      refresh: '刷新',
      loading: '正在处理...',
      descTitle: '选择文档类型',
      custom: '自定义',
      customPlaceholder: '请输入您想要的文档描述...',
      generate: '生成文档',
      preview: '预览',
      edit: '编辑',
      optimize: '优化',
      revert: '回退',
      copy: '复制',
      download: '下载',
      html: 'HTML',
      word: 'Word',
      pdf: 'PDF',
      imageMode: '图片',
      imageInline: '内联',
      imageLinked: '资源包',
      styleMode: '样式',
      styleDefault: '默认',
      styleUpload: '上传CSS',
      styleAi: 'AI生成',
      uploadCss: '上传CSS',
      cssLoaded: '已加载 CSS 样式：{{filename}}。',
      cssInvalid: '这份 CSS 暂不能使用，请移除 @import、javascript: 或 expression()。',
      clearCache: '清理缓存',
      emptyTitle: '还没有录制内容',
      emptyDesc: '从当前标签页开始录制，然后在这里生成文档。',
      start: '开始录制',
      errorTitle: '出现问题',
      retry: '重试',
      optimizeTitle: 'AI 优化',
      optimizePlaceholder: '告诉 AI 你想如何改进这份文档...',
      cancel: '取消',
      runOptimize: '开始优化',
      stepsTitle: '录制步骤',
      stepsSummary: '生成前可删除、排序或改写步骤说明。'
    };
    Object.assign(text, isEn ? {
      cropTitle: 'Crop Image',
      imageEditTitle: 'Edit Image',
      imageEditTooltip: 'Click to edit image',
      imageEditModeLabel: 'Image editing mode',
      cropClose: 'Close',
      cropReset: 'Reset',
      cropApply: 'Apply Crop',
      cropHint: 'Drag on the image to choose the crop area.',
      cropLoadFailed: 'Unable to load this image for cropping.',
      cropSelectLarger: 'Choose a larger crop area first.',
      cropSelectLargerShort: 'Choose a larger crop area.',
      cropSelected: 'Crop area selected. Apply when ready.',
      cropFailed: 'Cropping failed. Try another image.',
      cropDone: 'Image cropped.',
      startFailed: 'Failed to start recording',
      customRequired: 'Please enter a custom description',
      generating: 'Generating document...',
      generationFailed: 'Failed to generate document. Please try again.',
      copyDone: 'Document copied to clipboard.',
      copyFailed: 'Copy failed. Please select the text manually.',
      contentRequired: 'Please generate or enter document content first.',
      optimizeDone: 'Document optimized. You can revert to the previous version anytime.',
      optimizeFailed: 'Optimization failed. Please try again.',
      reverted: 'Reverted to the previous version.',
      htmlExported: 'HTML file exported.',
      wordExported: 'Word file exported.',
      pdfExported: 'PDF file exported.',
      htmlPackageDone: 'HTML package exported: {{filename}}. Unzip it and open {{html}}.',
      htmlPackageFailed: 'Failed to generate HTML package. Please try again.',
      markdownPackageDone: 'Markdown package exported: {{filename}}. Unzip it and open {{markdown}}.',
      markdownPackageFailed: 'Failed to generate Markdown package. Please try again.',
      cacheCleared: 'Recording cache cleared{{savedText}}',
      clearCacheFailed: 'Failed to clear recording cache.'
    } : {
      cropTitle: '裁剪图片',
      imageEditTitle: '编辑图片',
      imageEditTooltip: '点击编辑图片',
      imageEditModeLabel: '图片编辑模式',
      cropClose: '关闭',
      cropReset: '重置',
      cropApply: '应用裁剪',
      cropHint: '在图片上拖拽选择裁剪区域。',
      cropLoadFailed: '无法加载这张图片进行裁剪。',
      cropSelectLarger: '请先选择更大的裁剪区域。',
      cropSelectLargerShort: '请选择更大的裁剪区域。',
      cropSelected: '已选择裁剪区域，确认后应用。',
      cropFailed: '裁剪失败，请换一张图片重试。',
      cropDone: '图片已裁剪。',
      startFailed: '启动录制失败',
      customRequired: '请输入自定义描述',
      generating: '正在生成文档...',
      generationFailed: '生成文档失败，请重试',
      copyDone: '文档已复制到剪贴板。',
      copyFailed: '复制失败，请手动选择文本',
      contentRequired: '请先生成或输入文档内容',
      optimizeDone: '文档已优化，可随时回退到优化前版本',
      optimizeFailed: '优化失败，请重试',
      reverted: '已回退到优化前版本',
      htmlExported: 'HTML 文件已导出。',
      wordExported: 'Word 文件已导出。',
      pdfExported: 'PDF 文件已导出。',
      htmlPackageDone: 'HTML 资源包已导出：{{filename}}。解压后打开 {{html}}。',
      htmlPackageFailed: 'HTML 资源包生成失败，请重试',
      markdownPackageDone: 'Markdown 资源包已导出：{{filename}}。解压后打开 {{markdown}}。',
      markdownPackageFailed: 'Markdown 资源包生成失败，请重试',
      cacheCleared: '录制缓存已清理{{savedText}}',
      clearCacheFailed: '清理录制缓存失败'
    });
    Object.assign(text, isEn ? {
      cropMode: 'Crop',
      boxMode: 'Box',
      numberMode: 'Number',
      blurMode: 'Blur',
      boxApply: 'Apply Box',
      numberApply: 'Apply Number',
      blurApply: 'Apply Blur',
      boxHint: 'Click to auto-place a highlight box, or drag to choose an area.',
      numberHint: 'Click to auto-place a numbered marker, or drag to choose an area.',
      blurHint: 'Drag over sensitive information to blur it.',
      boxSelectLarger: 'Choose a larger box area first.',
      numberSelectLarger: 'Choose a larger numbered area first.',
      blurSelectLarger: 'Choose a larger blur area first.',
      boxSelectLargerShort: 'Choose a larger box area.',
      numberSelectLargerShort: 'Choose a larger numbered area.',
      blurSelectLargerShort: 'Choose a larger blur area.',
      boxSelected: 'Highlight box selected. Apply when ready.',
      numberSelected: 'Numbered marker selected. Apply when ready.',
      blurSelected: 'Blur area selected. Apply when ready.',
      boxFailed: 'Adding the highlight box failed. Try another image.',
      numberFailed: 'Adding the numbered marker failed. Try another image.',
      blurFailed: 'Blurring failed. Try another image.',
      boxDone: 'Highlight box added.',
      numberDone: 'Numbered marker added.',
      blurDone: 'Blur added.'
    } : {
      cropMode: '裁剪',
      boxMode: '框选',
      numberMode: '编号',
      blurMode: '模糊',
      boxApply: '应用框选',
      numberApply: '应用编号',
      blurApply: '应用模糊',
      boxHint: '点击自动放置高亮框，或拖拽选择区域。',
      numberHint: '点击自动放置编号标注，或拖拽选择区域。',
      blurHint: '拖拽选择需要模糊遮盖的敏感信息区域。',
      boxSelectLarger: '请先选择更大的框选区域。',
      numberSelectLarger: '请先选择更大的编号区域。',
      blurSelectLarger: '请先选择更大的模糊区域。',
      boxSelectLargerShort: '请选择更大的框选区域。',
      numberSelectLargerShort: '请选择更大的编号区域。',
      blurSelectLargerShort: '请选择更大的模糊区域。',
      boxSelected: '已选择高亮框，确认后应用。',
      numberSelected: '已选择编号标注，确认后应用。',
      blurSelected: '已选择模糊区域，确认后应用。',
      boxFailed: '添加高亮框失败，请换一张图片重试。',
      numberFailed: '添加编号标注失败，请换一张图片重试。',
      blurFailed: '模糊处理失败，请换一张图片重试。',
      boxDone: '已添加高亮框。',
      numberDone: '已添加编号标注。',
      blurDone: '已添加模糊遮盖。'
    });
    this.uiText = text;

    const set = (selector, value) => {
      const el = document.querySelector(selector);
      if (el && value) el.textContent = value;
    };
    const setButton = (selector, value) => {
      const el = document.querySelector(selector);
      if (!el) return;
      const icon = el.querySelector('.icon');
      el.textContent = '';
      if (icon) el.appendChild(icon);
      el.append(document.createTextNode(icon ? ` ${value}` : value));
    };

    set('.header-title h1', text.title);
    set('.header-title p', text.subtitle);
    set('#documents-state .panel-header h2', text.docsTitle);
    set('.upload-section h3', text.uploadTitle);
    set('.upload-help', text.uploadHelp);
    setButton('#sidepanel-browse-btn', text.browse);
    const search = document.getElementById('sidepanel-search-documents');
    if (search) search.placeholder = text.search;
    setButton('#sidepanel-refresh-documents', text.refresh);
    set('#loading-text', text.loading);
    set('#description-state h2', text.descTitle);
    set('.custom-input label span', text.custom);
    set('#step-editor-title', text.stepsTitle);
    set('#step-editor-summary', text.stepsSummary);
    const custom = document.getElementById('custom-description');
    if (custom) custom.placeholder = text.customPlaceholder;
    setButton('#btn-generate', text.generate);
    setButton('#btn-preview', text.preview);
    setButton('#btn-edit', text.edit);
    setButton('#btn-ai-optimize', text.optimize);
    setButton('#btn-revert-optimization', text.revert);
    setButton('#btn-copy', text.copy);
    setButton('#btn-download', text.download);
    setButton('#btn-export-html', text.html);
    setButton('#btn-export-word', text.word);
    setButton('#btn-export-pdf', text.pdf);
    set('#export-image-mode-label', text.imageMode);
    const imageMode = document.getElementById('export-image-mode');
    if (imageMode) {
      imageMode.querySelector('option[value="inline"]').textContent = text.imageInline;
      imageMode.querySelector('option[value="linked"]').textContent = text.imageLinked;
    }
    set('#export-style-mode-label', text.styleMode);
    const styleMode = document.getElementById('export-style-mode');
    if (styleMode) {
      styleMode.querySelector('option[value="default"]').textContent = text.styleDefault;
      styleMode.querySelector('option[value="upload"]').textContent = text.styleUpload;
      styleMode.querySelector('option[value="ai"]').textContent = text.styleAi;
    }
    setButton('#btn-upload-html-css', text.uploadCss);
    setButton('#btn-clear-cache', text.clearCache);
    set('#empty-state h2', text.emptyTitle);
    set('#empty-state p', text.emptyDesc);
    setButton('#btn-start-here', text.start);
    set('#error-state h2', text.errorTitle);
    setButton('#btn-retry', text.retry);
    set('#optimize-title', text.optimizeTitle);
    const optimizeInstruction = document.getElementById('optimize-instruction');
    if (optimizeInstruction) optimizeInstruction.placeholder = text.optimizePlaceholder;
    setButton('#btn-cancel-optimize', text.cancel);
    setButton('#btn-run-optimize', text.runOptimize);
    set('#image-crop-title', text.imageEditTitle);
    set('#image-crop-status', text.cropHint);
    setButton('#btn-reset-image-crop', text.cropReset);
    setButton('#btn-cancel-image-crop', text.cancel);
    setButton('#btn-apply-image-crop', text.cropApply);
    setButton('#btn-image-mode-crop', text.cropMode);
    setButton('#btn-image-mode-box', text.boxMode);
    setButton('#btn-image-mode-number', text.numberMode);
    setButton('#btn-image-mode-blur', text.blurMode);
    document.querySelector('.image-edit-toolbar')?.setAttribute('aria-label', text.imageEditModeLabel);
    const closeCrop = document.getElementById('btn-close-image-crop');
    if (closeCrop) {
      closeCrop.title = text.cropClose;
      closeCrop.setAttribute('aria-label', text.cropClose);
    }
  }

  // ========================================================================
  // DESCRIPTION OPTIONS
  // ========================================================================

  _renderDescriptionOptions() {
    const container = document.getElementById('description-list');
    if (!container) return;
    container.replaceChildren();
    const descriptions = this.language === 'en-US'
      ? [
        { value: 'user-guide', label: 'User Guide', description: 'Generate a detailed user operation guide' },
        { value: 'tutorial', label: 'Tutorial', description: 'Generate a beginner-friendly tutorial document' },
        { value: 'testing', label: 'Test Cases', description: 'Generate a test case document' },
        { value: 'bug-report', label: 'Bug Report', description: 'Generate a bug report document' }
      ]
      : DefaultDescriptions;
    descriptions.forEach((desc, index) => {
      container.appendChild(createElement('div', { className: 'description-option' }, [
        createElement('input', { type: 'radio', name: 'description', value: desc.value, id: `desc-${desc.value}`, checked: index === 0 }),
        createElement('label', { htmlFor: `desc-${desc.value}`, textContent: desc.label })
      ]));
    });
  }

  _renderStepEditor() {
    const container = document.getElementById('recorded-steps-list');
    const summary = document.getElementById('step-editor-summary');
    if (!container) return;

    const steps = this.session?.steps || [];
    const isEn = this.language === 'en-US';
    if (summary) {
      summary.textContent = steps.length
        ? (isEn
          ? `${steps.length} steps will be sent to AI. You can clean the flow first.`
          : `将发送 ${steps.length} 个步骤给 AI。生成前可先清理流程。`)
        : (isEn ? 'No recorded steps are available.' : '暂无可编辑的录制步骤。');
    }

    container.replaceChildren();
    if (!steps.length) {
      container.appendChild(createElement('div', { className: 'step-editor-empty' }, isEn ? 'No steps recorded.' : '暂无录制步骤。'));
      return;
    }

    steps.forEach((step, index) => {
      const stepNumber = index + 1;
      const textarea = createElement('textarea', {
        className: 'step-action-input',
        value: this._getStepEditableAction(step),
        'aria-label': isEn ? `Edit step ${stepNumber}` : `编辑步骤 ${stepNumber}`
      });
      textarea.addEventListener('input', () => {
        step.action = textarea.value.trim();
      });

      const header = createElement('div', { className: 'step-editor-item-header' }, [
        createElement('div', { className: 'step-editor-title' }, [
          createElement('strong', { textContent: isEn ? `Step ${stepNumber}` : `步骤 ${stepNumber}` }),
          createElement('span', { textContent: this._getStepTypeLabel(step.type) })
        ]),
        createElement('div', { className: 'step-editor-actions' }, [
          createElement('button', {
            type: 'button',
            className: 'step-action-btn',
            textContent: isEn ? 'Up' : '上移',
            disabled: index === 0,
            onclick: () => this._moveStep(index, -1)
          }),
          createElement('button', {
            type: 'button',
            className: 'step-action-btn',
            textContent: isEn ? 'Down' : '下移',
            disabled: index === steps.length - 1,
            onclick: () => this._moveStep(index, 1)
          }),
          createElement('button', {
            type: 'button',
            className: 'step-action-btn',
            textContent: step.important ? (isEn ? 'Normal' : '普通') : (isEn ? 'Key' : '关键'),
            onclick: () => this._toggleStepImportant(index)
          }),
          createElement('button', {
            type: 'button',
            className: 'step-action-btn',
            textContent: SidePanelManager.getStepScreenshotStatus(step) === 'hidden'
              ? (isEn ? 'Show shot' : '显示截图')
              : (isEn ? 'Hide shot' : '隐藏截图'),
            disabled: !step.screenshot,
            onclick: () => this._toggleStepScreenshot(index)
          }),
          createElement('button', {
            type: 'button',
            className: 'step-action-btn',
            textContent: isEn ? 'Merge next' : '合并下步',
            disabled: index === steps.length - 1,
            onclick: () => this._mergeStepWithNext(index)
          }),
          createElement('button', {
            type: 'button',
            className: 'step-action-btn step-action-danger',
            textContent: isEn ? 'Delete' : '删除',
            onclick: () => this._deleteStep(index)
          })
        ])
      ]);

      const meta = createElement('div', { className: 'step-editor-meta' }, this._getStepMeta(step));
      const screenshotPreview = this._createStepScreenshotPreview(step);
      container.appendChild(createElement('article', { className: 'step-editor-item' }, [
        header,
        screenshotPreview,
        textarea,
        meta
      ]));
    });
  }

  _createStepScreenshotPreview(step) {
    const status = SidePanelManager.getStepScreenshotStatus(step);
    const isEn = this.language === 'en-US';
    const statusText = {
      available: isEn ? 'Screenshot included' : '截图将随文档输出',
      hidden: isEn ? 'Screenshot hidden' : '截图已隐藏',
      missing: isEn ? 'No screenshot' : '无截图'
    }[status];
    const children = [
      createElement('span', { className: `step-screenshot-status ${status}`, textContent: statusText })
    ];
    if (status === 'available') {
      children.unshift(createElement('img', {
        className: 'step-screenshot-thumb',
        src: step.screenshot,
        alt: isEn ? 'Step screenshot preview' : '步骤截图预览'
      }));
    }
    return createElement('div', { className: 'step-screenshot-preview' }, children);
  }

  _getStepEditableAction(step) {
    if (!step) return '';
    if (step.action) return step.action;
    if (step.type === 'navigate') {
      return this.language === 'en-US'
        ? `Navigate from ${step.from || 'current page'} to ${step.to || 'new page'}`
        : `从 ${step.from || '当前页'} 跳转到 ${step.to || '新页面'}`;
    }
    if (step.type === 'scroll') {
      const percentY = Number.isFinite(step.scroll?.percentY) ? step.scroll.percentY : 0;
      return this.language === 'en-US'
        ? `Scroll to about ${percentY}% of the page`
        : `滚动到页面约 ${percentY}% 位置`;
    }
    return step.elementName || step.text || step.selector || '';
  }

  _getStepMeta(step) {
    const parts = [];
    const isEn = this.language === 'en-US';
    if (step.elementName || step.text) parts.push(`${isEn ? 'Element' : '元件'}: ${step.elementName || step.text}`);
    if (step.selector) parts.push(`${isEn ? 'Selector' : '选择器'}: ${step.selector}`);
    if (step.from || step.to) {
      parts.push(`${isEn ? 'Page' : '页面'}: ${step.from || (isEn ? 'current page' : '当前页')} -> ${step.to || (isEn ? 'new page' : '新页面')}`);
    }
    if (step.scroll) {
      const scroll = step.scroll;
      parts.push(`${isEn ? 'Scroll' : '滚动'}: x=${scroll.x || 0}, y=${scroll.y || 0}, ${scroll.percentY || 0}%`);
    }
    const formValueText = this._formatFormValue(step.formValue);
    if (formValueText !== '未记录') parts.push(`${isEn ? 'Value' : '值'}: ${formValueText}`);
    const selectionText = this._formatSelection(step.selection);
    if (selectionText !== '未记录') parts.push(`${isEn ? 'Selection' : '选择'}: ${selectionText}`);
    if (step.important) parts.push(isEn ? 'Marked as key step' : '已标记关键步骤');
    const screenshotStatus = SidePanelManager.getStepScreenshotStatus(step);
    if (screenshotStatus !== 'available') {
      parts.push(screenshotStatus === 'hidden'
        ? (isEn ? 'Screenshot hidden' : '截图已隐藏')
        : (isEn ? 'Screenshot missing' : '截图缺失'));
    }
    return parts.join(' · ') || (isEn ? 'No additional metadata' : '无更多元数据');
  }

  _getStepTypeLabel(type) {
    const labels = this.language === 'en-US'
      ? { click: 'Click', input: 'Input', change: 'Change', submit: 'Submit', navigate: 'Navigation', scroll: 'Scroll', merged: 'Merged' }
      : { click: '点击', input: '输入', change: '变更', submit: '提交', navigate: '跳转', scroll: '滚动', merged: '合并' };
    return labels[type] || (this.language === 'en-US' ? 'Action' : '操作');
  }

  _moveStep(index, offset) {
    const steps = this.session?.steps;
    const targetIndex = index + offset;
    if (!Array.isArray(steps) || targetIndex < 0 || targetIndex >= steps.length) return;
    const [step] = steps.splice(index, 1);
    steps.splice(targetIndex, 0, step);
    this._renderStepEditor();
  }

  _deleteStep(index) {
    const steps = this.session?.steps;
    if (!Array.isArray(steps) || index < 0 || index >= steps.length) return;
    steps.splice(index, 1);
    this._renderStepEditor();
  }

  _toggleStepImportant(index) {
    const step = this.session?.steps?.[index];
    if (!step) return;
    step.important = !step.important;
    this._renderStepEditor();
  }

  _toggleStepScreenshot(index) {
    const step = this.session?.steps?.[index];
    if (!step?.screenshot) return;
    step.includeScreenshot = step.includeScreenshot === false;
    this._renderStepEditor();
  }

  _mergeStepWithNext(index) {
    const steps = this.session?.steps;
    if (!Array.isArray(steps) || index < 0 || index >= steps.length - 1) return;

    const current = steps[index] || {};
    const next = steps[index + 1] || {};
    const currentAction = this._getStepEditableAction(current).trim();
    const nextAction = this._getStepEditableAction(next).trim();
    const action = [currentAction, nextAction].filter(Boolean).join('\n→ ');
    steps.splice(index, 2, {
      ...current,
      type: 'merged',
      action,
      elementName: [current.elementName || current.text, next.elementName || next.text].filter(Boolean).join(' / '),
      selector: next.selector || current.selector,
      rawSelector: next.rawSelector || current.rawSelector,
      x: Number.isFinite(next.x) ? next.x : current.x,
      y: Number.isFinite(next.y) ? next.y : current.y,
      screenshot: next.screenshot || current.screenshot,
      includeScreenshot: next.includeScreenshot === false && current.includeScreenshot === false ? false : undefined,
      important: Boolean(current.important || next.important),
      mergedCount: (current.mergedCount || 1) + (next.mergedCount || 1),
      mergedTypes: [...(current.mergedTypes || [current.type]).filter(Boolean), ...(next.mergedTypes || [next.type]).filter(Boolean)]
    });
    this._renderStepEditor();
  }

  // ========================================================================
  // ACTIONS
  // ========================================================================

  async startRecordingHere() {
    try {
      const [tab] = await queryTabs({ active: true, currentWindow: true });
      if (!tab) throw new ExtensionError('无法获取当前标签页', 'TAB_ERROR');
      const response = await sendMessage({ type: 'START_RECORDING', tabId: tab.id });
      if (response?.error) throw new ExtensionError(response.error, 'RECORDING_ERROR');
      window.close();
    } catch (error) {
      this._showError(`${this._t('startFailed')}: ${error.message}`);
    }
  }

  async generateDocument() {
    try {
      const selectedValue = document.querySelector('input[name="description"]:checked')?.value;
      let description = '';
      if (selectedValue === 'custom') {
        description = document.getElementById('custom-description')?.value?.trim();
        if (!description) { this._showError(this._t('customRequired')); return; }
      } else {
        const selectedDesc = DefaultDescriptions.find(d => d.value === selectedValue);
        description = selectedDesc?.description || '';
      }

      this.showLoadingState(this._t('generating'));
      const config = await loadConfig();
      this.config = config;
      if (!config.apiKey) throw new ExtensionError('请先在设置中配置API密钥', 'CONFIG_ERROR');
      if (!this.session?.steps?.length) throw new ExtensionError('没有可生成文档的录制步骤', 'EMPTY_STEPS');

      const prompt = this._limitPromptForModel(
        this._sanitizePromptForModel(this._buildGenerationPrompt(description, selectedValue, config)),
        config.maxInputTokens
      );
      const request = buildModelApiRequest(config, prompt, {
        temperature: 0.7,
        maxTokens: config.maxTokens || DEFAULT_MAX_TOKENS
      });
      const response = await fetchWithTimeout(
        request.url,
        request.fetchOptions,
        DOC_GEN_TIMEOUT
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new ExtensionError(`API调用失败: ${errorData.error?.message || response.statusText}`, 'API_ERROR');
      }

      const data = await response.json();
      const outputFormat = this._getOutputFormat(config);
      const markdown = this._normalizeGeneratedContent(extractModelResponseText(data, getApiFormat(config)), outputFormat);
      if (!markdown) throw new ExtensionError('AI没有返回可用的文档内容', 'EMPTY_RESPONSE');
      this.showEditor();
      this._setEditorContent(this._injectScreenshots(markdown, outputFormat));
      this._resetOptimizationState();
    } catch (error) {
      console.error('[Scribe:SidePanel] Generation failed:', error);
      this.showErrorState(this._formatUserFacingError(error, this._t('generationFailed')));
    }
  }

  _buildGenerationPrompt(description, docType, config = {}) {
    const sessionInfo = this._buildSessionInfo();
    const stepsText = this._buildStepsText();
    const documentTypeInstructions = this._getDocumentTypeInstructions(docType);
    const outputFormatInstruction = this._getOutputFormatInstruction(config.outputFormat);
    const variables = {
      taskDescription: description,
      sessionInfo,
      steps: stepsText,
      documentTypeInstructions,
      outputFormatInstruction,
      styleGuide: config.styleGuide || '',
      documentExample: this._getDocumentExample(docType, config)
    };
    const promptMode = config.promptMode || DEFAULT_PROMPT_MODE;
    const selectedTemplate = promptMode === 'custom'
      ? (config.customPrompt || DEFAULT_PROMPT_TEMPLATE)
      : DEFAULT_PROMPT_TEMPLATE;
    let prompt = this._applyPromptTemplate(selectedTemplate, variables);

    if (!this._templateIncludesContext(selectedTemplate)) {
      prompt += `\n\n录制上下文：\n${sessionInfo}\n\n操作步骤原始记录：\n${stepsText}\n\n文档类型要求：\n${documentTypeInstructions}`;
    }

    if (promptMode !== 'custom' && config.promptAppend?.trim()) {
      prompt += `\n\n用户补充要求：\n${config.promptAppend.trim()}`;
    }

    const styleReference = this._buildStyleReferencePrompt(docType, config);
    if (styleReference) {
      prompt = `${styleReference}\n\n${prompt}`;
    }

    prompt += `\n\n${outputFormatInstruction}`;
    if (config.appLanguage === 'en-US') {
      prompt += '\n\nOutput language requirement: write the final document in clear English unless the user explicitly asks for another language.';
    } else {
      prompt += '\n\n输出语言要求：除非用户明确要求其他语言，最终文档请使用简体中文。';
    }

    return prompt;
  }

  _getOutputFormat(config = this.config) {
    if (typeof config === 'string') return this._normalizeOutputFormat(config);
    return this._normalizeOutputFormat(config?.outputFormat);
  }

  _normalizeOutputFormat(format) {
    return ['markdown', 'html', 'text'].includes(format) ? format : 'markdown';
  }

  _getOutputFormatInstruction(format) {
    const normalized = this._getOutputFormat(format);
    const instructions = {
      markdown: [
        '输出格式要求：',
        '- 最终只输出 Markdown 文档，不要输出解释、寒暄或代码块围栏。',
        '- 如果参考文档是 HTML，只学习它的层级、组件、表格、列表和提示块表达，并转换为 Markdown 结构。',
        '- 保留每个录制步骤对应的 [截图N] 占位或图片引用。'
      ],
      html: [
        '输出格式要求：',
        '- 如果前面的默认提示词或文档类型要求提到 Markdown，请忽略该格式限制，以本条 HTML 输出要求为准。',
        '- 最终只输出 HTML，不要输出 Markdown，不要用 ```html 代码块包裹。',
        '- 输出可直接保存为 .html 的文档内容；允许使用语义化 HTML 和必要的内联样式，禁止 script、iframe、外部资源和事件处理属性。',
        '- 如果参考文档是 HTML，请尽量沿用它的标题层级、内容区块、表格、列表、提示块和视觉节奏，但事实内容必须以本次录制为准。',
        '- 保留每个录制步骤对应的截图占位，建议使用 <img alt="步骤N截图" src="[截图N]"> 或清晰的 [截图N] 标记。'
      ],
      text: [
        '输出格式要求：',
        '- 如果前面的默认提示词或文档类型要求提到 Markdown，请忽略该格式限制，以本条纯文本输出要求为准。',
        '- 最终只输出纯文本，不要输出 Markdown、HTML 或代码块围栏。',
        '- 如果参考文档是 Markdown 或 HTML，只学习其内容顺序、层级和语气，并转换为纯文本段落。',
        '- 保留每个录制步骤对应的 [截图N] 占位。'
      ]
    };
    return instructions[normalized].join('\n');
  }

  _buildStyleReferencePrompt(docType, config = {}) {
    const sections = [];
    const styleGuide = this._trimReferenceText(config.styleGuide || '', 6000);
    const example = this._trimReferenceText(this._getDocumentExample(docType, config), 10000);

    if (styleGuide) {
      sections.push(`风格指南：\n${styleGuide}`);
    }

    if (example) {
      sections.push(`当前文档类型示例：\n${example}`);
    }

    if (!sections.length) return '';

    return `\n\n写作风格与示例参考：\n${sections.join('\n\n')}\n\n请严格遵循以上风格指南；如果提供了示例文档，请参考示例的标题层级、段落颗粒度、语气、表格/列表使用方式和截图占位方式。示例可能是 Markdown、纯文本或 HTML；如果是 HTML，请学习它的内容层级、组件组织、表格/列表/提示块等版式表达，并按用户选择的输出格式转换。不要照抄示例中的业务事实、账号、数据、链接或截图。最终文档仍必须以本次录制步骤为准。`;
  }

  _getDocumentExample(docType, config = {}) {
    return config.documentExamples?.[docType] || '';
  }

  _trimReferenceText(text, maxLength) {
    const value = String(text || '').trim();
    if (value.length <= maxLength) return value;
    return value.slice(0, maxLength) + '\n\n[以上参考内容过长，已截断]';
  }

  _buildSessionInfo() {
    return [
      `页面标题：${this.session?.pageTitle || '未记录'}`,
      `页面地址：${this.session?.pageUrl || '未记录'}`,
      `录制步骤数：${this.session?.steps?.length || 0}`
    ].join('\n');
  }

  _buildStepsText() {
    if (!this.session?.steps?.length) return '无录制步骤';

    return this.session.steps.map((step, index) => {
      const num = index + 1;
      const screenshotMarker = this._getStepScreenshotReference(step, num);
      if (step.type === 'navigate') {
        return [
          `步骤 ${num}｜页面跳转`,
          `- 来源页面：${step.from || '当前页'}`,
          `- 目标页面：${step.to || '新页面'}`,
          `- 截图：${screenshotMarker}`
        ].join('\n');
      }

      if (step.type === 'scroll') {
        const scroll = step.scroll || {};
        return [
          `步骤 ${num}｜页面滚动`,
          `- 操作描述：${step.action || '滚动页面以查看后续内容'}`,
          `- 滚动位置：x=${Number.isFinite(scroll.x) ? scroll.x : 0}, y=${Number.isFinite(scroll.y) ? scroll.y : 0}`,
          `- 页面进度：纵向约 ${Number.isFinite(scroll.percentY) ? scroll.percentY : 0}%`,
          `- 视口尺寸：${scroll.viewportWidth || '未知'} x ${scroll.viewportHeight || '未知'}`,
          `- 页面语义快照：\n${this._formatPageSnapshot(step.pageSnapshot)}`,
          `- 截图：${screenshotMarker}`
        ].join('\n');
      }

      const actionTypeLabel = {
        click: '用户点击',
        input: '用户输入',
        change: '用户变更',
        submit: '表单提交',
        merged: '合并操作'
      }[step.type] || '用户操作';

      return [
        `步骤 ${num}｜${actionTypeLabel}`,
        step.important ? '- 重要性：关键步骤' : '',
        step.mergedCount ? `- 合并来源：${step.mergedCount} 个连续步骤` : '',
        `- 操作描述：${step.action || '点击页面元素'}`,
        `- 元件名称：${step.elementName || step.text || '未识别名称'}`,
        `- 元件角色：${step.elementRole || '未知'}`,
        `- 元件类型：${step.elementType || step.tagName || '未知'}`,
        `- 元件状态：${this._formatElementState(step.elementState)}`,
        `- 表单值：${this._formatFormValue(step.formValue)}`,
        `- 选择项：${this._formatSelection(step.selection)}`,
        `- HTML 标签：${step.tagName || '未知'}`,
        `- CSS 选择器：${step.selector || '未记录'}`,
        `- 原始点击选择器：${step.rawSelector || step.selector || '未记录'}`,
        `- 点击坐标：${Number.isFinite(step.x) && Number.isFinite(step.y) ? `${step.x}, ${step.y}` : '未记录'}`,
        `- 页面语义快照：\n${this._formatPageSnapshot(step.pageSnapshot)}`,
        `- 截图：${screenshotMarker}`
      ].filter(Boolean).join('\n');
    }).join('\n\n');
  }

  _getStepScreenshotReference(step, stepNumber) {
    const status = SidePanelManager.getStepScreenshotStatus(step);
    if (status === 'hidden') return 'hidden by user';
    if (status === 'missing') return 'missing';
    return `[截图${stepNumber}]`;
  }

  _formatElementState(state) {
    if (!state || typeof state !== 'object') return '未记录';
    const entries = Object.entries(state).filter(([, value]) => value !== undefined && value !== null && value !== '');
    if (!entries.length) return '未记录';
    return entries.map(([key, value]) => `${key}=${value}`).join(', ');
  }

  _formatFormValue(formValue) {
    if (!formValue || typeof formValue !== 'object') return '未记录';

    if (formValue.kind === 'select') {
      const selectedText = Array.isArray(formValue.selectedText) ? formValue.selectedText.filter(Boolean) : [];
      const selectedValue = Array.isArray(formValue.selectedValue) ? formValue.selectedValue.filter(Boolean) : [];
      if (selectedText.length) return `已选择：${selectedText.join('、')}`;
      if (selectedValue.length) return `已选择值：${selectedValue.join('、')}`;
      return '未选择';
    }

    if (formValue.kind === 'checkbox' || formValue.kind === 'radio') {
      const state = formValue.checked ? '已选中' : '未选中';
      const label = formValue.label ? `，选项：${formValue.label}` : '';
      const value = formValue.value ? `，值：${formValue.value}` : '';
      return `${state}${label}${value}`;
    }

    if (formValue.isSensitive) {
      return formValue.valueLength ? `已输入敏感内容（${formValue.valueLength} 个字符，已脱敏）` : '未输入';
    }

    if (formValue.value) return `输入内容：${formValue.value}`;
    if (Number.isFinite(formValue.valueLength)) return formValue.valueLength ? `已输入 ${formValue.valueLength} 个字符` : '未输入';
    return '未记录';
  }

  _formatSelection(selection) {
    if (!selection || typeof selection !== 'object') return '未记录';
    const parts = [];
    if (selection.containerLabel) parts.push(`容器：${selection.containerLabel}`);
    if (selection.selectedText) parts.push(`选项：${selection.selectedText}`);
    if (selection.selectedValue) parts.push(`值：${selection.selectedValue}`);
    if (selection.selectedState) parts.push(`状态：${selection.selectedState}`);
    return parts.length ? parts.join('，') : '未记录';
  }

  _formatPageSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') return '  未记录';
    const lines = [];
    const addList = (label, values) => {
      if (Array.isArray(values) && values.length) {
        lines.push(`  - ${label}：${values.join('、')}`);
      }
    };
    if (snapshot.title) lines.push(`  - 页面标题：${snapshot.title}`);
    if (snapshot.url) lines.push(`  - 页面地址：${snapshot.url}`);
    addList('页面标题层级', snapshot.headings);
    addList('主要区域', snapshot.landmarks);
    addList('当前页签', snapshot.activeTabs);
    addList('可见页签', snapshot.tabs);
    addList('主要按钮', snapshot.buttons);
    addList('主要链接', snapshot.links);
    addList('输入项', snapshot.inputs);
    addList('下拉/选择控件', snapshot.selects);
    addList('弹窗/抽屉', snapshot.dialogs);
    if (Array.isArray(snapshot.tables) && snapshot.tables.length) {
      snapshot.tables.forEach((table, index) => {
        const name = table.caption || `表格${index + 1}`;
        const headers = table.headers?.length ? `，列：${table.headers.join('、')}` : '';
        const rows = Number.isFinite(table.rowCount) ? `，约 ${table.rowCount} 行` : '';
        lines.push(`  - ${name}${headers}${rows}`);
      });
    }
    if (snapshot.visibleTextSummary) {
      lines.push(`  - 可见文本摘要：${snapshot.visibleTextSummary}`);
    }
    return lines.length ? lines.join('\n') : '  未记录';
  }

  _getDocumentTypeInstructions(docType) {
    const templates = {
      'user-guide': `请生成“用户操作指南”，要求简洁实用，建议结构：
# 标题
## 适用场景
用 1-2 句话说明这个流程适合什么场景。
## 操作前准备
只列必要前置条件，例如登录状态、权限、页面入口；没有就省略。
## 操作流程
按步骤编号输出。每步格式为：
### 步骤N：动作名称
一句话说明怎么操作；如果有必要，再补一句成功后的页面变化。步骤末尾保留 [截图N]。
不要拆成“操作目标、具体操作、页面反馈、判断标准”等固定字段。
登录、输入密码、点击提交这类常规步骤要简短，不要解释密码框、眼睛图标、按钮颜色等常识。
## 结果确认
用 1-3 条说明如何确认流程已完成。
## 注意事项
只列真正重要的注意事项，最多 3 条。`,

      tutorial: `请生成“教程文档”，建议结构：
# 标题
## 学习目标
说明读者完成教程后能掌握什么。
## 背景说明
用简短段落解释这个功能/页面的作用。
## 准备工作
列出账号、权限、浏览器、示例数据等准备事项。
## 分步教学
按录制步骤展开，每步包含：本步操作、必要说明、[截图N]。不要机械拆成过多字段。
## 练习建议
给出 2-3 个读者可自行尝试的变体操作。
## 小结
总结关键路径和成功标准。`,

      testing: `请生成“测试用例文档”，建议结构：
# 标题
## 测试目标
说明要验证的业务能力。
## 测试范围
列出本次覆盖和未覆盖的内容。
## 前置条件
列出账号、权限、测试数据、环境和页面入口。
## 测试步骤
使用表格输出：步骤编号、操作、测试数据/输入、预期结果、截图。
## 验收标准
列出通过/失败判断。
## 异常与边界场景
补充 5-8 条值得回归的异常、空值、权限、网络或重复提交场景。`,

      'bug-report': `请生成“问题报告”，建议结构：
# 标题
## 问题摘要
用 1-2 句话描述问题现象和影响。
## 环境信息
根据上下文列出页面地址、浏览器插件录制来源、时间如未知则写“未记录”。
## 复现步骤
按录制步骤展开，每步包含操作、必要的页面反馈和 [截图N]。
## 预期结果
说明正常情况下应该发生什么。
## 实际结果
基于录制内容谨慎描述已观察到的结果；无法判断时标注“需人工补充”。
## 影响范围
说明可能影响的用户、流程或数据。
## 排查建议
给出前端、权限、数据、网络、后端接口等方向的排查清单。`
    };

    return templates[docType] || `请生成一份结构清晰、内容详实的通用 Markdown 文档，建议结构：
# 标题
## 流程概述
## 前置条件
## 详细操作步骤
## 结果确认
## 注意事项
## 常见问题与解决方案
## 附录：关键页面与截图`;
  }

  _applyPromptTemplate(template, variables) {
    return String(template || DEFAULT_PROMPT_TEMPLATE)
      .replaceAll('{{taskDescription}}', variables.taskDescription)
      .replaceAll('{{sessionInfo}}', variables.sessionInfo)
      .replaceAll('{{steps}}', variables.steps)
      .replaceAll('{{documentTypeInstructions}}', variables.documentTypeInstructions)
      .replaceAll('{{outputFormatInstruction}}', variables.outputFormatInstruction)
      .replaceAll('{{styleGuide}}', variables.styleGuide)
      .replaceAll('{{documentExample}}', variables.documentExample);
  }

  _templateIncludesContext(template) {
    const value = String(template || '');
    return value.includes('{{sessionInfo}}') && value.includes('{{steps}}');
  }

  _injectScreenshots(content, format = this._getOutputFormat()) {
    if (!this.session?.steps?.length) return content;
    return this._injectScreenshotPlaceholdersFixed(content, format);
  }

  _injectScreenshotPlaceholdersFixed(content, format = this._getOutputFormat()) {
    let result = String(content || '');
    this.session.steps.forEach((step, index) => {
      if (!step.screenshot) return;
      if (SidePanelManager.getStepScreenshotStatus(step) === 'hidden') return;
      const stepNumber = index + 1;
      const placeholder = `[截图${stepNumber}]`;
      const englishPlaceholder = `[Screenshot ${stepNumber}]`;
      const imgTag = format === 'html'
        ? `<img alt="步骤${stepNumber}截图" src="${step.screenshot}">`
        : `![步骤${stepNumber}截图](${step.screenshot})`;
      result = result.replace(
        new RegExp('(<img\\b[^>]*?\\bsrc=["\\\'])\\s*(?:\\[截图' + stepNumber + '\\]|\\[Screenshot\\s*' + stepNumber + '\\])\\s*(["\\\'][^>]*>)', 'gi'),
        '$1' + step.screenshot + '$2'
      );
      result = result.split(placeholder).join(imgTag);
      result = result.split(englishPlaceholder).join(imgTag);
    });
    return result;
  }

  _injectScreenshotPlaceholders(content, format = this._getOutputFormat()) {
    if (!this.session?.steps?.length) return content;
    let safeResult = String(content || '');
    this.session.steps.forEach((step, index) => {
      if (!step.screenshot) return;
      const stepNumber = index + 1;
      const placeholder = '[' + '鎴浘' + stepNumber + ']';
      const englishPlaceholder = '[Screenshot ' + stepNumber + ']';
      const imgTag = format === 'html'
        ? '<img alt="' + '姝ラ' + stepNumber + '鎴浘" src="' + step.screenshot + '">'
        : '![' + '姝ラ' + stepNumber + '鎴浘](' + step.screenshot + ')';
      safeResult = safeResult.replace(
        new RegExp('(<img\\b[^>]*?\\bsrc=["\\\'])\\s*(?:\\[' + '鎴浘' + stepNumber + '\\]|\\[Screenshot\\s*' + stepNumber + '\\])\\s*(["\\\'][^>]*>)', 'gi'),
        '$1' + step.screenshot + '$2'
      );
      safeResult = safeResult.split(placeholder).join(imgTag);
      safeResult = safeResult.split(englishPlaceholder).join(imgTag);
    });
    return safeResult;

    var result = content;
    this.session.steps.forEach(function(step, index) {
      var stepNumber = index + 1;
      var placeholder = '[' + '截图' + stepNumber + ']';
      var englishPlaceholder = '[Screenshot ' + stepNumber + ']';
      if (step.screenshot) {
        var imgTag = format === 'html'
          ? '<img alt="' + '步骤' + stepNumber + '截图" src="' + step.screenshot + '">'
          : '![' + '步骤' + stepNumber + '截图](' + step.screenshot + ')';
        if (format === 'html') {
          result = result.replace(
            new RegExp('(<img\\b[^>]*?\\bsrc=["\\\'])\\s*(?:\\[截图' + stepNumber + '\\]|\\[Screenshot\\s*' + stepNumber + '\\]|截图\\s*' + stepNumber + '|Screenshot\\s*' + stepNumber + ')\\s*(["\\\'][^>]*>)', 'gi'),
            '$1' + step.screenshot + '$2'
          );
          result = result.split(placeholder).join(imgTag);
          result = result.split(englishPlaceholder).join(imgTag);
          result = result.replace(new RegExp('(?<![="\\\'>])截图\\s*' + stepNumber + '(?![\\]\\)<])', 'g'), imgTag);
          result = result.replace(new RegExp('(?<![="\\\'>])Screenshot\\s*' + stepNumber + '(?![\\]\\)<])', 'gi'), imgTag);
        } else {
          result = result.split(placeholder).join(imgTag);
          result = result.split(englishPlaceholder).join(imgTag);
          result = result.replace(new RegExp('截图占位[：:]?\\s*步骤\\s*' + stepNumber + '\\s*截图', 'g'), imgTag);
          result = result.replace(new RegExp('步骤\\s*' + stepNumber + '\\s*截图', 'g'), imgTag);
          result = result.replace(new RegExp('截图\\s*' + stepNumber + '(?![\\]\\)])', 'g'), imgTag);
          result = result.replace(new RegExp('Screenshot\\s*' + stepNumber + '(?![\\]\\)])', 'gi'), imgTag);
        }
      }
    });
    return result;
  }

  _getScreenshotMarker(stepNumber) {
    return `[截图${stepNumber}]`;
  }

  _getScreenshotMarkerFromAlt(alt) {
    const match = String(alt || '').match(/(?:步骤|step)?\s*(\d+)\s*(?:截图|screenshot)?/i);
    if (!match) return '';
    const stepNumber = Number.parseInt(match[1], 10);
    return Number.isFinite(stepNumber) ? this._getScreenshotMarker(stepNumber) : '';
  }

  _prepareContentForModel(content) {
    let screenshotIndex = 0;
    const nextMarker = () => {
      screenshotIndex += 1;
      return this._getScreenshotMarker(screenshotIndex);
    };

    return String(content || '')
      .replace(/!\[([^\]]*)\]\(data:image\/[^)]+\)/gi, (_match, alt) => this._getScreenshotMarkerFromAlt(alt) || nextMarker())
      .replace(/<img\b[^>]*>/gi, (imgTag) => {
        const srcMatch = imgTag.match(/\bsrc=(["'])data:image\/[\s\S]*?\1/i);
        if (!srcMatch) return imgTag;
        const altMatch = imgTag.match(/\balt=(["'])([\s\S]*?)\1/i);
        return this._getScreenshotMarkerFromAlt(altMatch?.[2] || '') || nextMarker();
      })
      .replace(/data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/=]+/gi, '[图片内容已省略]');
  }

  _sanitizePromptForModel(content) {
    return this._sanitizeSensitiveText(content);
  }

  _sanitizeSensitiveText(content) {
    let value = String(content || '');
    const labeledSecretPattern = /((?:api[-_\s]?key|secret|token|access[-_\s]?token|refresh[-_\s]?token|authorization|bearer|password|passwd|pwd|验证码|校验码|动态码|密码|口令|密钥|令牌|身份证|证件号|手机号|手机|电话|邮箱|email|phone)\s*[:：=]\s*)([^,\s;，。]+)/gi;

    value = value
      .replace(labeledSecretPattern, '$1[已脱敏]')
      .replace(/\b(?:sk|rk|pk)-[A-Za-z0-9_-]{16,}\b/g, '[API Key 已脱敏]')
      .replace(/\bAIza[A-Za-z0-9_-]{20,}\b/g, '[API Key 已脱敏]')
      .replace(/\bgh[pousr]_[A-Za-z0-9_]{20,}\b/g, '[Token 已脱敏]')
      .replace(/\bxox[baprs]-[A-Za-z0-9-]{20,}\b/g, '[Token 已脱敏]')
      .replace(/\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\b/g, '[JWT 已脱敏]')
      .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[邮箱已脱敏]')
      .replace(/(^|[^\d])((?:\+?86[-\s]?)?1[3-9]\d{9})(?!\d)/g, '$1[手机号已脱敏]')
      .replace(/(^|[^\d])(\d{17}[\dXx])(?!\d)/g, '$1[身份证号已脱敏]');

    return value;
  }

  _limitPromptForModel(content, maxInputTokens = DEFAULT_MAX_INPUT_TOKENS) {
    const tokenBudget = Number.isFinite(Number(maxInputTokens))
      ? Math.min(Math.max(Number(maxInputTokens), MIN_MAX_INPUT_TOKENS), MAX_MAX_INPUT_TOKENS)
      : DEFAULT_MAX_INPUT_TOKENS;
    const charBudget = tokenBudget * 4;
    const value = String(content || '');
    if (value.length <= charBudget) return value;

    const marker = `\n\n[中间内容因超过最大输入 Token 预算已省略，当前预算：${tokenBudget} tokens]\n\n`;
    const remaining = Math.max(charBudget - marker.length, 1000);
    const headLength = Math.floor(remaining * 0.65);
    const tailLength = remaining - headLength;
    return value.slice(0, headLength) + marker + value.slice(-tailLength);
  }

  _setEditorContent(content) {
    const editor = document.getElementById('markdown-editor');
    if (editor) { editor.value = content; this._updatePreview(content); }
  }

  _updatePreview(content) { this._renderDocument(content); }

  _renderDocument(content) {
    const format = this._getOutputFormat();
    if (format === 'html') {
      this._renderHtml(content);
    } else if (format === 'text') {
      this._renderText(content);
    } else {
      this._renderMarkdown(content);
    }
  }

  _renderMarkdown(markdown) {
    const previewDiv = document.getElementById('markdown-preview');
    if (previewDiv && typeof marked !== 'undefined') {
      marked.setOptions({ breaks: true, gfm: true });
      safeSetInnerHTML(previewDiv, marked.parse(markdown), true);
      this._attachImageEditing(previewDiv);
    }
  }

  _renderHtml(html) {
    const previewDiv = document.getElementById('markdown-preview');
    if (!previewDiv) return;
    safeSetInnerHTML(previewDiv, this._extractHtmlBody(html), true);
    this._attachImageEditing(previewDiv);
  }

  _renderText(text) {
    const previewDiv = document.getElementById('markdown-preview');
    if (!previewDiv) return;
    previewDiv.textContent = text || '';
  }

  _attachImageEditing(root) {
    if (!root) return;
    root.querySelectorAll('img').forEach((img, index) => {
      if (!img.getAttribute('src')) return;
      if (!img.dataset.originalSrc) img.dataset.originalSrc = img.getAttribute('src') || '';
      if (!img.dataset.imageId) img.dataset.imageId = `img_${Date.now()}_${index}`;
      if (/^data:image\//i.test(img.getAttribute('src') || '') && !this._isKnownSessionScreenshot(img.getAttribute('src'))) {
        img.dataset.imageEdited = 'true';
      }
      img.dataset.imageEditable = 'true';
      img.contentEditable = 'false';
      img.setAttribute('tabindex', '0');
      img.setAttribute('title', this._t('imageEditTooltip'));
    });
  }

  _isKnownSessionScreenshot(src) {
    if (!src || !Array.isArray(this.session?.steps)) return false;
    return this.session.steps.some(step => step?.screenshot === src);
  }

  async openImageCropDialog(imageElement) {
    const src = imageElement?.getAttribute('src');
    if (!src) return;

    try {
      const sourceImage = await this._loadImageForCrop(src);
      const canvas = document.getElementById('image-crop-canvas');
      if (!canvas) return;

      this.imageCropState = {
        imageElement,
        sourceImage,
        rect: null,
        isDragging: false,
        start: null,
        mode: 'crop',
        displayScale: this._getImageCropDisplayScale(sourceImage),
        canvasScale: 1
      };
      document.getElementById('image-crop-modal')?.classList.remove('hidden');
      this.setImageEditMode('crop', { preserveSelection: true });
    } catch (error) {
      console.error('[Scribe:SidePanel] Failed to open image crop dialog:', error);
      this._showNotification(this._t('cropLoadFailed'), 'error');
    }
  }

  closeImageCropDialog() {
    document.getElementById('image-crop-modal')?.classList.add('hidden');
    this.imageCropState = {
      imageElement: null,
      sourceImage: null,
      rect: null,
      isDragging: false,
      start: null,
      mode: 'crop',
      displayScale: 1,
      canvasScale: 1
    };
  }

  setImageEditMode(mode, options = {}) {
    if (!this.imageCropState.sourceImage) return;
    const nextMode = SidePanelManager.normalizeImageEditMode(mode);
    this.imageCropState.mode = nextMode;
    if (!options.preserveSelection) {
      this.imageCropState.rect = null;
      this.imageCropState.start = null;
      this.imageCropState.isDragging = false;
    }
    document.getElementById('btn-image-mode-crop')?.classList.toggle('active', nextMode === 'crop');
    document.getElementById('btn-image-mode-box')?.classList.toggle('active', nextMode === 'box');
    document.getElementById('btn-image-mode-number')?.classList.toggle('active', nextMode === 'number');
    document.getElementById('btn-image-mode-blur')?.classList.toggle('active', nextMode === 'blur');
    const applyButton = document.getElementById('btn-apply-image-crop');
    if (applyButton) {
      applyButton.textContent = this._getImageEditText(nextMode, 'Apply');
    }
    this._setImageCropStatus(this._getImageEditText(nextMode, 'Hint'));
    this._drawImageCropCanvas();
  }

  resetImageCropSelection() {
    if (!this.imageCropState.sourceImage) return;
    this.imageCropState.rect = null;
    this.imageCropState.start = null;
    this.imageCropState.isDragging = false;
    this._setImageCropStatus(this._getImageEditText(this.imageCropState.mode, 'Hint'));
    this._drawImageCropCanvas();
  }

  applyImageCrop() {
    const { imageElement, sourceImage, rect, mode } = this.imageCropState;
    if (!imageElement || !sourceImage || !rect || rect.width < 4 || rect.height < 4) {
      this._setImageCropStatus(this._getImageEditText(mode, 'SelectLarger'));
      return;
    }

    try {
      const output = document.createElement('canvas');
      const ctx = output.getContext('2d');
      if (['box', 'number', 'blur'].includes(mode)) {
        output.width = sourceImage.naturalWidth;
        output.height = sourceImage.naturalHeight;
        ctx.drawImage(sourceImage, 0, 0);
        if (mode === 'blur') {
          this._drawBlurArea(ctx, sourceImage, rect);
        } else if (mode === 'number') {
          const number = SidePanelManager.getNextAnnotationNumber(document.querySelectorAll('img[data-annotation-number]'));
          this._drawNumberedHighlight(ctx, rect, output.width, output.height, number);
          imageElement.dataset.annotationNumber = String(number);
        } else {
          this._drawHighlightBox(ctx, rect, output.width, output.height);
        }
      } else {
        output.width = Math.round(rect.width);
        output.height = Math.round(rect.height);
        ctx.drawImage(
          sourceImage,
          rect.x,
          rect.y,
          rect.width,
          rect.height,
          0,
          0,
          output.width,
          output.height
        );
      }

      const croppedSrc = output.toDataURL('image/png');
      if (!imageElement.dataset.originalSrc) {
        imageElement.dataset.originalSrc = imageElement.getAttribute('src') || croppedSrc;
      }
      imageElement.setAttribute('src', croppedSrc);
      imageElement.dataset.imageEdited = 'true';
      imageElement.dataset.imageEditOperation = SidePanelManager.normalizeImageEditMode(mode);
      imageElement.dataset.cropRect = `${Math.round(rect.x)},${Math.round(rect.y)},${Math.round(rect.width)},${Math.round(rect.height)}`;
      this._syncPreviewToEditor();
      this.closeImageCropDialog();
      this._showNotification(this._getImageEditText(mode, 'Done'), 'success');
    } catch (error) {
      console.error('[Scribe:SidePanel] Failed to edit image:', error);
      this._setImageCropStatus(this._getImageEditText(mode, 'Failed'));
    }
  }

  _getImageEditText(mode, suffix) {
    const normalized = SidePanelManager.normalizeImageEditMode(mode);
    const prefix = normalized === 'number' ? 'number' : normalized === 'blur' ? 'blur' : normalized === 'box' ? 'box' : 'crop';
    return this._t(`${prefix}${suffix}`);
  }

  _drawHighlightBox(ctx, rect, imageWidth, imageHeight, minLineWidth = 4) {
    const lineWidth = Math.max(minLineWidth, Math.round(Math.min(imageWidth, imageHeight) * 0.008));
    const x = Math.max(lineWidth / 2, rect.x);
    const y = Math.max(lineWidth / 2, rect.y);
    const width = Math.min(rect.width, imageWidth - x - lineWidth / 2);
    const height = Math.min(rect.height, imageHeight - y - lineWidth / 2);
    ctx.save();
    ctx.fillStyle = 'rgba(239, 68, 68, 0.12)';
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = lineWidth;
    ctx.lineJoin = 'round';
    ctx.fillRect(x, y, width, height);
    ctx.strokeRect(x, y, width, height);
    ctx.restore();
  }

  _drawNumberedHighlight(ctx, rect, imageWidth, imageHeight, number) {
    this._drawHighlightBox(ctx, rect, imageWidth, imageHeight);
    const radius = Math.max(14, Math.round(Math.min(imageWidth, imageHeight) * 0.025));
    const x = Math.min(Math.max(radius + 2, rect.x), imageWidth - radius - 2);
    const y = Math.min(Math.max(radius + 2, rect.y), imageHeight - radius - 2);
    ctx.save();
    ctx.fillStyle = '#ef4444';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = Math.max(3, Math.round(radius * 0.18));
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = `700 ${Math.round(radius * 1.1)}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(number), x, y + 1);
    ctx.restore();
  }

  _drawBlurArea(ctx, sourceImage, rect) {
    const x = Math.max(0, Math.round(rect.x));
    const y = Math.max(0, Math.round(rect.y));
    const width = Math.max(1, Math.round(Math.min(rect.width, sourceImage.naturalWidth - x)));
    const height = Math.max(1, Math.round(Math.min(rect.height, sourceImage.naturalHeight - y)));
    ctx.save();
    ctx.filter = 'blur(12px)';
    ctx.drawImage(sourceImage, x, y, width, height, x, y, width, height);
    ctx.restore();
    ctx.save();
    ctx.fillStyle = 'rgba(15, 23, 42, 0.12)';
    ctx.fillRect(x, y, width, height);
    ctx.restore();
  }

  _loadImageForCrop(src) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = src;
    });
  }

  _getImageCropDisplayScale(image) {
    const maxWidth = Math.min(760, Math.max(320, window.innerWidth - 96));
    const maxHeight = Math.min(520, Math.max(240, window.innerHeight - 260));
    return Math.min(1, maxWidth / image.naturalWidth, maxHeight / image.naturalHeight);
  }

  _drawImageCropCanvas() {
    const canvas = document.getElementById('image-crop-canvas');
    const image = this.imageCropState.sourceImage;
    if (!canvas || !image) return;

    const scale = this.imageCropState.displayScale || 1;
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

    const rect = this.imageCropState.rect;
    if (!rect || rect.width <= 0 || rect.height <= 0) return;

    const x = rect.x * scale;
    const y = rect.y * scale;
    const width = rect.width * scale;
    const height = rect.height * scale;

    if (this.imageCropState.mode === 'box' || this.imageCropState.mode === 'number') {
      if (this.imageCropState.mode === 'number') {
        this._drawNumberedHighlight(ctx, { x, y, width, height }, canvas.width, canvas.height, '#');
      } else {
        this._drawHighlightBox(ctx, { x, y, width, height }, canvas.width, canvas.height, 2);
      }
      return;
    }

    if (this.imageCropState.mode === 'blur') {
      ctx.save();
      ctx.fillStyle = 'rgba(15, 23, 42, 0.18)';
      ctx.fillRect(x, y, width, height);
      ctx.strokeStyle = '#0f172a';
      ctx.setLineDash([6, 4]);
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 1, y + 1, Math.max(0, width - 2), Math.max(0, height - 2));
      ctx.restore();
      return;
    }

    ctx.save();
    ctx.fillStyle = 'rgba(15, 23, 42, 0.42)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.clearRect(x, y, width, height);
    ctx.strokeStyle = '#2563eb';
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, Math.max(0, width - 2), Math.max(0, height - 2));
    ctx.restore();
  }

  _startImageCropDrag(event) {
    const point = this._getImageCropPoint(event);
    if (!point) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    this.imageCropState.isDragging = true;
    this.imageCropState.start = point;
    this.imageCropState.rect = { x: point.x, y: point.y, width: 0, height: 0 };
    this._drawImageCropCanvas();
  }

  _moveImageCropDrag(event) {
    if (!this.imageCropState.isDragging || !this.imageCropState.start) return;
    const point = this._getImageCropPoint(event);
    if (!point) return;
    event.preventDefault();
    this.imageCropState.rect = this._normalizeImageCropRect(this.imageCropState.start, point);
    this._drawImageCropCanvas();
  }

  _endImageCropDrag(event) {
    if (!this.imageCropState.isDragging) return;
    const point = this._getImageCropPoint(event);
    const start = this.imageCropState.start;
    if (point && start) {
      const clickThreshold = 6 / (this.imageCropState.displayScale || 1);
      const movedDistance = Math.hypot(point.x - start.x, point.y - start.y);
      if (['box', 'number'].includes(this.imageCropState.mode) && movedDistance <= clickThreshold) {
        this.imageCropState.rect = SidePanelManager.getAutoHighlightRect(point, this.imageCropState.sourceImage);
      } else {
        this.imageCropState.rect = this._normalizeImageCropRect(start, point);
      }
    }
    this.imageCropState.isDragging = false;
    event.currentTarget?.releasePointerCapture?.(event.pointerId);
    const rect = this.imageCropState.rect;
    if (!rect || rect.width < 4 || rect.height < 4) {
      this.imageCropState.rect = null;
      this._setImageCropStatus(this._getImageEditText(this.imageCropState.mode, 'SelectLargerShort'));
    } else {
      this._setImageCropStatus(this._getImageEditText(this.imageCropState.mode, 'Selected'));
    }
    this._drawImageCropCanvas();
  }

  _getImageCropPoint(event) {
    const canvas = document.getElementById('image-crop-canvas');
    const image = this.imageCropState.sourceImage;
    if (!canvas || !image) return null;

    const bounds = canvas.getBoundingClientRect();
    const scale = this.imageCropState.displayScale || 1;
    const cssScaleX = bounds.width ? canvas.width / bounds.width : 1;
    const cssScaleY = bounds.height ? canvas.height / bounds.height : 1;
    const x = Math.max(0, Math.min(image.naturalWidth, ((event.clientX - bounds.left) * cssScaleX) / scale));
    const y = Math.max(0, Math.min(image.naturalHeight, ((event.clientY - bounds.top) * cssScaleY) / scale));
    return { x, y };
  }

  _normalizeImageCropRect(start, end) {
    const image = this.imageCropState.sourceImage;
    const x1 = Math.max(0, Math.min(start.x, end.x));
    const y1 = Math.max(0, Math.min(start.y, end.y));
    const x2 = Math.min(image.naturalWidth, Math.max(start.x, end.x));
    const y2 = Math.min(image.naturalHeight, Math.max(start.y, end.y));
    return {
      x: x1,
      y: y1,
      width: Math.max(0, x2 - x1),
      height: Math.max(0, y2 - y1)
    };
  }

  _setImageCropStatus(message) {
    const status = document.getElementById('image-crop-status');
    if (status) status.textContent = message;
  }

  _syncPreviewToEditor() {
    const preview = document.getElementById('markdown-preview');
    const editor = document.getElementById('markdown-editor');
    if (!preview || !editor) return;

    const format = this._getOutputFormat();
    const content = format === 'html'
      ? preview.innerHTML.trim()
      : format === 'text'
        ? preview.innerText.trim()
        : this._htmlToMarkdown(preview);
    if (editor.value !== content) {
      editor.value = content;
    }
  }

  _ensureEditorContentFresh() {
    if (document.getElementById('preview-pane')?.classList.contains('active')) {
      this._syncPreviewToEditor();
    }
  }

  _htmlToMarkdown(root) {
    const blocks = Array.from(root.childNodes)
      .map(node => this._nodeToMarkdown(node, false))
      .map(text => text.trim())
      .filter(Boolean);

    return this._normalizeMarkdownOutput(blocks.join('\n\n'));
  }

  _nodeToMarkdown(node, inline = false) {
    if (node.nodeType === Node.TEXT_NODE) {
      return this._normalizeTextNode(node.textContent || '');
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return '';

    const tag = node.tagName.toLowerCase();
    if (tag === 'br') return '\n';
    if (tag === 'script' || tag === 'style') return '';

    if (tag === 'h1' || tag === 'h2' || tag === 'h3' || tag === 'h4' || tag === 'h5' || tag === 'h6') {
      const level = Number(tag.slice(1));
      return `${'#'.repeat(level)} ${this._childrenToMarkdown(node, true).trim()}`;
    }

    if (tag === 'p' || tag === 'div' || tag === 'section' || tag === 'article') {
      return this._childrenToMarkdown(node, inline).trim();
    }

    if (tag === 'strong' || tag === 'b') {
      const text = this._childrenToMarkdown(node, true).trim();
      return text ? `**${text}**` : '';
    }

    if (tag === 'em' || tag === 'i') {
      const text = this._childrenToMarkdown(node, true).trim();
      return text ? `*${text}*` : '';
    }

    if (tag === 'code') {
      if (node.parentElement?.tagName?.toLowerCase() === 'pre') return node.textContent || '';
      return `\`${(node.textContent || '').replace(/`/g, '\\`')}\``;
    }

    if (tag === 'pre') {
      const code = node.textContent || '';
      return `\`\`\`\n${code.replace(/\n+$/g, '')}\n\`\`\``;
    }

    if (tag === 'a') {
      const text = this._childrenToMarkdown(node, true).trim() || node.getAttribute('href') || '';
      const href = node.getAttribute('href') || '';
      return href ? `[${text}](${href})` : text;
    }

    if (tag === 'img') {
      const alt = node.getAttribute('alt') || '';
      const src = node.getAttribute('src') || '';
      if (/^data:image\//i.test(src)) {
        if (node.dataset?.imageEdited === 'true' || !this._isKnownSessionScreenshot(src)) {
          return `![${alt.replace(/\]/g, '\\]')}](${src})`;
        }
        return this._getScreenshotMarkerFromAlt(alt) || '[截图]';
      }
      return src ? `![${alt}](${src})` : '';
    }

    if (tag === 'ul' || tag === 'ol') {
      return this._listToMarkdown(node, tag === 'ol');
    }

    if (tag === 'li') {
      return this._childrenToMarkdown(node, false).trim();
    }

    if (tag === 'blockquote') {
      const text = this._childrenToMarkdown(node, false).trim();
      return text.split('\n').map(line => `> ${line}`).join('\n');
    }

    if (tag === 'table') {
      return this._tableToMarkdown(node);
    }

    return this._childrenToMarkdown(node, inline).trim();
  }

  _childrenToMarkdown(element, inline = false) {
    return Array.from(element.childNodes)
      .map(node => this._nodeToMarkdown(node, inline))
      .join(inline ? '' : '\n')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n');
  }

  _listToMarkdown(list, ordered) {
    const items = Array.from(list.children).filter(child => child.tagName?.toLowerCase() === 'li');
    return items.map((item, index) => {
      const prefix = ordered ? `${index + 1}. ` : '- ';
      const text = this._childrenToMarkdown(item, false).trim().replace(/\n/g, '\n  ');
      return `${prefix}${text}`;
    }).join('\n');
  }

  _tableToMarkdown(table) {
    const rows = Array.from(table.querySelectorAll('tr')).map(row =>
      Array.from(row.children).map(cell =>
        this._childrenToMarkdown(cell, true).trim().replace(/\|/g, '\\|')
      )
    ).filter(row => row.length);

    if (!rows.length) return '';

    const columnCount = Math.max(...rows.map(row => row.length));
    const normalizeRow = row => {
      const cells = Array.from({ length: columnCount }, (_, index) => row[index] || '');
      return `| ${cells.join(' | ')} |`;
    };

    const output = [normalizeRow(rows[0])];
    output.push(`| ${Array.from({ length: columnCount }, () => '---').join(' | ')} |`);
    rows.slice(1).forEach(row => output.push(normalizeRow(row)));
    return output.join('\n');
  }

  _normalizeTextNode(text) {
    return String(text || '').replace(/\u00a0/g, ' ');
  }

  _normalizeMarkdownOutput(markdown) {
    return String(markdown || '')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  _normalizeGeneratedContent(content, format) {
    const normalizedFormat = this._getOutputFormat(format);
    const value = String(content || '').trim();
    const fencePattern = normalizedFormat === 'html'
      ? /^```(?:html)?\s*([\s\S]*?)\s*```$/i
      : normalizedFormat === 'markdown'
        ? /^```(?:markdown|md)?\s*([\s\S]*?)\s*```$/i
        : /^```(?:text|txt)?\s*([\s\S]*?)\s*```$/i;
    const match = value.match(fencePattern);
    return (match?.[1] || value).trim();
  }

  _extractHtmlBody(html) {
    const value = String(html || '');
    const doc = new DOMParser().parseFromString(value, 'text/html');
    return doc.body?.innerHTML || value;
  }

  switchToPreview() {
    this._togglePane('preview-pane', 'btn-preview');
    const content = document.getElementById('markdown-editor')?.value;
    if (content) this._updatePreview(content);
  }

  switchToEdit() {
    this._ensureEditorContentFresh();
    this._togglePane('edit-pane', 'btn-edit');
  }

  _togglePane(paneId, buttonId) {
    ['preview-pane', 'edit-pane', 'btn-preview', 'btn-edit'].forEach(id => document.getElementById(id)?.classList.remove('active'));
    document.getElementById(paneId)?.classList.add('active');
    document.getElementById(buttonId)?.classList.add('active');
  }

  async copyDocument() {
    this._ensureEditorContentFresh();
    const content = document.getElementById('markdown-editor')?.value;
    if (!content) return;
    try {
      await navigator.clipboard.writeText(content);
      this._showNotification(this._t('copyDone'), 'success');
    } catch (error) {
      this._showNotification(this._t('copyFailed'), 'error');
    }
  }

  openOptimizeDialog() {
    const content = this._getEditorContent();
    if (!content) {
      this._showNotification(this._t('contentRequired'), 'error');
      return;
    }

    const modal = document.getElementById('optimize-modal');
    const instruction = document.getElementById('optimize-instruction');
    const status = document.getElementById('optimize-status');
    if (instruction && !instruction.value.trim()) {
      instruction.value = this.language === 'en-US'
        ? 'Make the document clearer and more complete. Add necessary background, operation goals, page feedback, notes, and FAQs. Preserve all screenshot placeholders and formatting.'
        : '请让文档内容更完整、更清晰，补充必要背景、操作目的、页面反馈、注意事项和常见问题；保留所有截图占位与 Markdown 格式。';
    }
    if (status) {
      status.textContent = '';
      status.classList.add('hidden');
      status.classList.remove('error', 'success');
    }
    modal?.classList.remove('hidden');
    instruction?.focus();
  }

  closeOptimizeDialog(force = false) {
    if (this.isOptimizing && !force) return;
    document.getElementById('optimize-modal')?.classList.add('hidden');
  }

  async optimizeCurrentDocument() {
    if (this.isOptimizing) return;

    const currentContent = this._getEditorContent();
    const instruction = document.getElementById('optimize-instruction')?.value.trim();
    if (!currentContent) {
      this._setOptimizeStatus(this._t('contentRequired'), 'error');
      return;
    }
    if (!instruction) {
      this._setOptimizeStatus(this.language === 'en-US' ? 'Please enter optimization instructions.' : '请输入优化要求', 'error');
      return;
    }

    try {
      this.isOptimizing = true;
      this._setOptimizeControls(true);
      this._setOptimizeStatus(this.language === 'en-US' ? 'Optimizing with AI...' : '正在调用 AI 优化文档...', 'success');

      const config = await loadConfig();
      this.config = config;
      if (!config.apiKey) throw new ExtensionError('请先在设置中配置API密钥', 'CONFIG_ERROR');

      if (!this.originalBeforeOptimization) {
        this.originalBeforeOptimization = currentContent;
      }

      const request = buildModelApiRequest(
        config,
        this._sanitizePromptForModel(
          this._limitPromptForModel(
            this._buildOptimizationPrompt(
              this._limitPromptForModel(this._prepareContentForModel(currentContent), config.maxInputTokens),
              instruction
            ),
            config.maxInputTokens
          )
        ),
        { temperature: 0.5, maxTokens: config.maxTokens || DEFAULT_MAX_TOKENS }
      );
      const response = await fetchWithTimeout(
        request.url,
        request.fetchOptions,
        DOC_GEN_TIMEOUT
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new ExtensionError(`API调用失败: ${errorData.error?.message || response.statusText}`, 'API_ERROR');
      }

      const data = await response.json();
      const optimized = this._normalizeGeneratedContent(
        extractModelResponseText(data, getApiFormat(config)),
        this._getOutputFormat(config)
      );
      if (!optimized) throw new ExtensionError('AI没有返回优化后的文档', 'EMPTY_RESPONSE');

      this._setEditorContent(this._injectScreenshots(optimized, this._getOutputFormat(config)));
      this._setRevertVisible(true);
      this.switchToPreview();
      this.closeOptimizeDialog(true);
      this._showNotification(this._t('optimizeDone'), 'success');
    } catch (error) {
      console.error('[Scribe:SidePanel] Optimization failed:', error);
      this._setOptimizeStatus(this._formatUserFacingError(error, this._t('optimizeFailed')), 'error');
    } finally {
      this.isOptimizing = false;
      this._setOptimizeControls(false);
    }
  }

  revertOptimization() {
    if (!this.originalBeforeOptimization) return;
    this._setEditorContent(this.originalBeforeOptimization);
    this.originalBeforeOptimization = null;
    this._setRevertVisible(false);
    this.switchToPreview();
    this._showNotification(this._t('reverted'), 'success');
  }

  _buildOptimizationPrompt(markdown, instruction) {
    const format = this._getOutputFormat();
    const formatName = format === 'html' ? 'HTML' : format === 'text' ? '纯文本' : 'Markdown';
    if (this.language === 'en-US') {
      const englishFormatName = format === 'html' ? 'HTML' : format === 'text' ? 'plain text' : 'Markdown';
      return `You are a senior product documentation editor. Improve the following ${englishFormatName} document according to the user's request.

User optimization request:
${instruction}

Hard requirements:
- Output only the complete improved ${englishFormatName} document. Do not include explanations or conversational text.
- Preserve all screenshot references and [Screenshot N] / [截图N] placeholders. Do not delete, renumber, or rewrite image links.
- To keep the request compact, original screenshot images may have been replaced with placeholders. Keep those placeholders so the app can restore the real screenshots after the response.
- Keep factual boundaries. Do not invent account numbers, amounts, order IDs, API return values, or other details that cannot be inferred from the original document.
- You may restructure the document, clarify wording, add necessary background, add notes, and add FAQs.
- Write in clear English for non-technical readers unless the user explicitly asks for another language.

${this._getOutputFormatInstruction(format)}

Original ${englishFormatName} document:
${markdown}`;
    }
    return `你是一名资深产品文档编辑。请根据用户要求优化下面的 ${formatName} 文档。

用户优化要求：
${instruction}

硬性要求：
- 只输出优化后的完整 ${formatName} 文档，不要输出解释或对话。
- 保留原文中的所有截图引用或 [截图N] 占位符，不要删除、重编号或改写图片链接。
- 为避免请求过长，原文中的截图图片可能已被压缩为 [截图N] 占位符；输出时必须保留这些占位符，系统会在返回后自动恢复真实截图。
- 保留事实边界，不要编造具体账号、金额、订单号、接口返回值等无法从原文判断的信息。
- 可以重排结构、补充说明、改写措辞、增加注意事项和常见问题。
- 保持简体中文，面向非技术人员，内容清晰、完整、可执行。

${this._getOutputFormatInstruction(format)}

原始 ${formatName} 文档：
${markdown}`;
  }

  _getEditorContent() {
    this._ensureEditorContentFresh();
    return document.getElementById('markdown-editor')?.value.trim() || '';
  }

  _resetOptimizationState() {
    this.originalBeforeOptimization = null;
    this._setRevertVisible(false);
  }

  _setRevertVisible(visible) {
    document.getElementById('btn-revert-optimization')?.classList.toggle('hidden', !visible);
  }

  _handleHtmlExportStyleModeChange() {
    const mode = document.getElementById('export-style-mode')?.value === 'upload' ? 'upload' : 'default';
    this.htmlExportStyle.mode = mode;
    this._syncHtmlExportStyleControls();
    if (mode === 'upload' && !this.htmlExportStyle.customCss) {
      this._openHtmlCssFilePicker();
    }
  }

  _syncHtmlExportStyleControls() {
    document.getElementById('btn-upload-html-css')?.classList.toggle('hidden', this.htmlExportStyle.mode !== 'upload');
  }

  _openHtmlCssFilePicker() {
    document.getElementById('html-css-file')?.click();
  }

  async _handleHtmlCssFileChange(event) {
    const input = event.target;
    const file = input?.files?.[0];
    if (!file) return;

    try {
      const css = await file.text();
      const sanitized = SidePanelManager.sanitizeHtmlExportCss(css);
      if (!sanitized.ok) {
        this._showNotification(this._t('cssInvalid'), 'error');
        input.value = '';
        return;
      }
      this.htmlExportStyle = {
        mode: 'upload',
        customCss: sanitized.css,
        customName: file.name || 'custom.css'
      };
      const styleMode = document.getElementById('export-style-mode');
      if (styleMode) styleMode.value = 'upload';
      this._syncHtmlExportStyleControls();
      this._showNotification(this._t('cssLoaded', { filename: this.htmlExportStyle.customName }), 'success');
    } catch (error) {
      console.error('[Scribe:SidePanel] Failed to load CSS file:', error);
      this._showNotification(this._t('cssInvalid'), 'error');
    } finally {
      if (input) input.value = '';
    }
  }

  _setOptimizeStatus(message, type) {
    const status = document.getElementById('optimize-status');
    if (!status) return;
    status.textContent = message;
    status.classList.remove('hidden', 'error', 'success');
    status.classList.add(type);
  }

  _setOptimizeControls(disabled) {
    const runButton = document.getElementById('btn-run-optimize');
    const cancelButton = document.getElementById('btn-cancel-optimize');
    const closeButton = document.getElementById('btn-close-optimize');
    const instruction = document.getElementById('optimize-instruction');
    if (runButton) {
      runButton.disabled = disabled;
      runButton.textContent = disabled
        ? (this.language === 'en-US' ? 'Optimizing...' : '优化中...')
        : (this.uiText?.runOptimize || (this.language === 'en-US' ? 'Start Optimization' : '开始优化'));
    }
    if (cancelButton) cancelButton.disabled = disabled;
    if (closeButton) closeButton.disabled = disabled;
    if (instruction) instruction.disabled = disabled;
  }

  downloadDocument() {
    this._ensureEditorContentFresh();
    const content = document.getElementById('markdown-editor')?.value;
    if (!content) return;
    const format = this._getOutputFormat();
    if (format === 'html' && this._getHtmlImageMode() === 'linked') {
      this.exportHtmlDocument();
      return;
    }
    if (format === 'markdown' && this._exportMarkdownWithLinkedImages(content)) {
      return;
    }
    const extension = format === 'html' ? 'html' : format === 'text' ? 'txt' : 'md';
    const mimeType = format === 'html'
      ? 'text/html;charset=utf-8'
      : format === 'text'
        ? 'text/plain;charset=utf-8'
        : 'text/markdown;charset=utf-8';
    const blob = new Blob([format === 'html' ? this._buildStandaloneHtmlFromCurrentContent(content) : content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = createElement('a', { href: url, download: `${this._getExportBaseName(content)}.${extension}` });
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
  }

  exportHtmlDocument() {
    this._ensureEditorContentFresh();
    const content = document.getElementById('markdown-editor')?.value;
    if (!content) return;

    const html = this._buildStandaloneHtmlFromCurrentContent(content);
    if (this._getHtmlImageMode() === 'linked') {
      this._exportHtmlWithLinkedImages(html);
      return;
    }
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = createElement('a', { href: url, download: `${this._getExportBaseName(content)}.html` });
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
    this._showNotification(this._t('htmlExported'), 'success');
  }

  exportWordDocument() {
    this._ensureEditorContentFresh();
    const content = document.getElementById('markdown-editor')?.value;
    if (!content) return;

    const html = this._buildDeliverableHtmlFromCurrentContent(content);
    const title = this._extractDocumentTitle(content);
    const wordHtml = SidePanelManager.buildWordMhtmlDocument(html, title);
    this._downloadBlob(
      `${this._getExportBaseName(content)}.doc`,
      new Blob([wordHtml], { type: 'application/msword;charset=utf-8' })
    );
    this._showNotification(this._t('wordExported'), 'success');
  }

  exportPdfDocument() {
    this._ensureEditorContentFresh();
    const content = document.getElementById('markdown-editor')?.value;
    if (!content) return;

    const html = this._buildDeliverableHtmlFromCurrentContent(content);
    const title = this._extractDocumentTitle(content);
    const printHtml = SidePanelManager.buildPdfPrintHtml(html, title);
    this._openPdfPrintWindow(printHtml, `${this._getExportBaseName(content)}.html`);
    this._showNotification(this._t('pdfExported'), 'success');
  }

  _openPdfPrintWindow(printHtml, fallbackFilename = 'SmartPages-PDF.html') {
    const printWindow = window.open('', '_blank');
    if (!printWindow?.document) {
      this._downloadBlob(fallbackFilename, new Blob([printHtml], { type: 'text/html;charset=utf-8' }));
      return false;
    }

    printWindow.document.open();
    printWindow.document.write(printHtml);
    printWindow.document.close();
    printWindow.focus?.();
    return true;
  }

  async _buildDirectPdfBlob(html, title) {
    try {
      const pages = await this._renderHtmlToPdfImagePages(html);
      if (pages.length) {
        return new Blob([SidePanelManager.buildImagePdfDocument(pages)], { type: 'application/pdf' });
      }
    } catch (error) {
      console.warn('[Scribe:SidePanel] Image-based PDF export failed, using text fallback:', error);
    }
    const lines = this._extractPdfTextLines(html, title);
    return new Blob([SidePanelManager.buildTextPdfDocument(lines)], { type: 'application/pdf' });
  }

  async _renderHtmlToPdfImagePages(html) {
    const bodyHtml = String(html || '').match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] || html;
    const styleHtml = Array.from(String(html || '').matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi))
      .map(match => match[1] || '')
      .join('\n');
    const width = 794;
    const pageHeight = Math.round(width * 842 / 595);
    const host = document.createElement('div');
    host.style.cssText = [
      'position: fixed',
      'left: -12000px',
      'top: 0',
      `width: ${width}px`,
      'background: #fff',
      'color: #111',
      'z-index: -1'
    ].join(';');
    host.innerHTML = `<style>${styleHtml}</style>${bodyHtml}`;
    document.body.appendChild(host);
    try {
      await this._waitForImages(host);
      await document.fonts?.ready?.catch?.(() => {});
      const height = Math.max(pageHeight, Math.ceil(host.scrollHeight || host.offsetHeight || pageHeight));
      const xhtml = SidePanelManager.serializePdfHostXhtml(host, width);
      const svg = SidePanelManager.buildPdfSvgMarkup(xhtml, width, height);
      const image = await this._loadImageFromSvg(svg);
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(image, 0, 0);

      const pages = [];
      for (let y = 0; y < height; y += pageHeight) {
        const sliceHeight = Math.min(pageHeight, height - y);
        const pageCanvas = document.createElement('canvas');
        pageCanvas.width = width;
        pageCanvas.height = pageHeight;
        const pageCtx = pageCanvas.getContext('2d');
        pageCtx.fillStyle = '#fff';
        pageCtx.fillRect(0, 0, width, pageHeight);
        pageCtx.drawImage(canvas, 0, y, width, sliceHeight, 0, 0, width, sliceHeight);
        pages.push({ dataUrl: pageCanvas.toDataURL('image/jpeg', 0.92), width, height: pageHeight });
      }
      return pages;
    } finally {
      host.remove();
    }
  }

  _waitForImages(root) {
    const images = Array.from(root.querySelectorAll('img'));
    return Promise.all(images.map(image => {
      if (image.complete) return Promise.resolve();
      return new Promise(resolve => {
        image.onload = resolve;
        image.onerror = resolve;
      });
    }));
  }

  _loadImageFromDataUrl(dataUrl) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error(`Failed to load PDF render image (${String(dataUrl || '').slice(0, 64)}...)`));
      image.src = dataUrl;
    });
  }

  _loadImageFromSvg(svg) {
    if (typeof Blob === 'undefined' || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
      return this._loadImageFromDataUrl(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
    }

    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
    return new Promise((resolve, reject) => {
      const image = new Image();
      const cleanup = () => URL.revokeObjectURL?.(url);
      image.onload = () => {
        cleanup();
        resolve(image);
      };
      image.onerror = () => {
        cleanup();
        reject(new Error('Failed to load PDF render SVG blob'));
      };
      image.src = url;
    });
  }

  _extractPdfTextLines(html, title) {
    const lines = [{ text: title || 'SmartPages Document', size: 20 }];
    const documentHtml = String(html || '');
    const bodyHtml = documentHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] || documentHtml;
    const text = bodyHtml
      .replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, '\n# $1\n')
      .replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, '\n## $1\n')
      .replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, '\n### $1\n')
      .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '\n- $1')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>|<\/tr>|<\/div>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"');
    text.split('\n').map(line => line.trim()).filter(Boolean).forEach(line => {
      const size = line.startsWith('# ') ? 18 : line.startsWith('## ') ? 15 : line.startsWith('### ') ? 13 : 11;
      lines.push({ text: line.replace(/^#{1,3}\s+/, ''), size });
    });
    return lines;
  }

  _getHtmlImageMode() {
    return document.getElementById('export-image-mode')?.value === 'linked' ? 'linked' : 'inline';
  }

  _exportMarkdownWithLinkedImages(markdown) {
    const baseName = this._getExportBaseName(markdown);
    const assetDir = `${baseName}_assets`;
    const contentWithScreenshots = this._injectScreenshots(markdown, 'markdown');
    const { markdown: linkedMarkdown, assets } = SidePanelManager.extractMarkdownImageAssets(contentWithScreenshots, assetDir);
    if (!assets.length) return false;

    const readme = [
      'SmartPages Markdown 导出说明',
      '',
      `Markdown 文件：${baseName}.md`,
      `图片文件夹：${assetDir}/`,
      '',
      '请保持 Markdown 文件和图片文件夹的相对位置不变。',
      '如果移动或分享文档，请一起移动 Markdown 文件和整个图片文件夹，否则 Markdown 中的图片会无法显示。',
      '',
      `本次导出图片数量：${assets.length}`
    ].join('\n');
    const files = [
      { name: `${baseName}.md`, blob: new Blob([linkedMarkdown], { type: 'text/markdown;charset=utf-8' }) },
      { name: `${assetDir}/README.txt`, blob: new Blob([readme], { type: 'text/plain;charset=utf-8' }) },
      ...assets.map(asset => ({ name: asset.filename, blob: this._dataUrlToBlob(asset.dataUrl) }))
    ];
    this._buildZip(files).then(zipBlob => {
      this._downloadBlob(`${baseName}_package.zip`, zipBlob);
      this._showNotification(this._t('markdownPackageDone', { filename: `${baseName}_package.zip`, markdown: `${baseName}.md` }), 'success');
    }).catch(error => {
      console.error('[Scribe:SidePanel] Failed to build Markdown package:', error);
      this._showNotification(this._t('markdownPackageFailed'), 'error');
    });
    return true;
  }

  _exportHtmlWithLinkedImages(html) {
    const baseName = this._getExportBaseName(html);
    const assetDir = `${baseName}_assets`;
    const assets = [];
    let assetIndex = 0;
    const linkedHtml = String(html || '').replace(/src=(["'])(data:image\/([a-z0-9.+-]+);base64,[a-z0-9+/=]+)\1/gi, (_match, quote, dataUrl, extHint) => {
      assetIndex += 1;
      const ext = this._getImageExtension(dataUrl, extHint);
      const filename = `${assetDir}/screenshot_${String(assetIndex).padStart(2, '0')}.${ext}`;
      assets.push({ filename, dataUrl });
      return `src=${quote}${filename}${quote}`;
    });

    const readme = [
      'Smart Page Scribe HTML 导出说明',
      '',
      `HTML 文件：${baseName}.html`,
      `图片文件夹：${assetDir}/`,
      '',
      '请保持 HTML 文件和图片文件夹的相对位置不变。',
      '如果移动或分享文档，请一起移动 HTML 文件和整个图片文件夹，否则 HTML 中的图片会无法显示。',
      '',
      `本次导出图片数量：${assets.length}`
    ].join('\n');
    const files = [
      { name: `${baseName}.html`, blob: new Blob([linkedHtml], { type: 'text/html;charset=utf-8' }) },
      { name: `${assetDir}/README.txt`, blob: new Blob([readme], { type: 'text/plain;charset=utf-8' }) },
      ...assets.map(asset => ({ name: asset.filename, blob: this._dataUrlToBlob(asset.dataUrl) }))
    ];
    this._buildZip(files).then(zipBlob => {
      this._downloadBlob(`${baseName}_package.zip`, zipBlob);
      this._showNotification(this._t('htmlPackageDone', { filename: `${baseName}_package.zip`, html: `${baseName}.html` }), 'success');
    }).catch(error => {
      console.error('[Scribe:SidePanel] Failed to build HTML package:', error);
      this._showNotification(this._t('htmlPackageFailed'), 'error');
    });
  }

  async _buildZip(files) {
    const encoder = new TextEncoder();
    const chunks = [];
    const centralDirectory = [];
    let offset = 0;

    for (const file of files) {
      const nameBytes = encoder.encode(file.name.replace(/\\/g, '/'));
      const data = new Uint8Array(await file.blob.arrayBuffer());
      const crc = this._crc32(data);
      const localHeader = this._createZipLocalHeader(nameBytes, data.length, crc);
      chunks.push(localHeader, data);
      centralDirectory.push({
        nameBytes,
        crc,
        size: data.length,
        offset
      });
      offset += localHeader.length + data.length;
    }

    const centralStart = offset;
    centralDirectory.forEach(entry => {
      const header = this._createZipCentralHeader(entry.nameBytes, entry.size, entry.crc, entry.offset);
      chunks.push(header);
      offset += header.length;
    });
    chunks.push(this._createZipEndRecord(centralDirectory.length, offset - centralStart, centralStart));
    return new Blob(chunks, { type: 'application/zip' });
  }

  _createZipLocalHeader(nameBytes, size, crc) {
    const header = new Uint8Array(30 + nameBytes.length);
    const view = new DataView(header.buffer);
    view.setUint32(0, 0x04034b50, true);
    view.setUint16(4, 20, true);
    view.setUint16(6, 0, true);
    view.setUint16(8, 0, true);
    view.setUint16(10, 0, true);
    view.setUint16(12, 0, true);
    view.setUint32(14, crc, true);
    view.setUint32(18, size, true);
    view.setUint32(22, size, true);
    view.setUint16(26, nameBytes.length, true);
    view.setUint16(28, 0, true);
    header.set(nameBytes, 30);
    return header;
  }

  _createZipCentralHeader(nameBytes, size, crc, offset) {
    const header = new Uint8Array(46 + nameBytes.length);
    const view = new DataView(header.buffer);
    view.setUint32(0, 0x02014b50, true);
    view.setUint16(4, 20, true);
    view.setUint16(6, 20, true);
    view.setUint16(8, 0, true);
    view.setUint16(10, 0, true);
    view.setUint16(12, 0, true);
    view.setUint16(14, 0, true);
    view.setUint32(16, crc, true);
    view.setUint32(20, size, true);
    view.setUint32(24, size, true);
    view.setUint16(28, nameBytes.length, true);
    view.setUint16(30, 0, true);
    view.setUint16(32, 0, true);
    view.setUint16(34, 0, true);
    view.setUint16(36, 0, true);
    view.setUint32(38, 0, true);
    view.setUint32(42, offset, true);
    header.set(nameBytes, 46);
    return header;
  }

  _createZipEndRecord(fileCount, centralSize, centralOffset) {
    const header = new Uint8Array(22);
    const view = new DataView(header.buffer);
    view.setUint32(0, 0x06054b50, true);
    view.setUint16(4, 0, true);
    view.setUint16(6, 0, true);
    view.setUint16(8, fileCount, true);
    view.setUint16(10, fileCount, true);
    view.setUint32(12, centralSize, true);
    view.setUint32(16, centralOffset, true);
    view.setUint16(20, 0, true);
    return header;
  }

  _crc32(bytes) {
    if (!this._crcTable) {
      this._crcTable = Array.from({ length: 256 }, (_value, index) => {
        let c = index;
        for (let k = 0; k < 8; k += 1) {
          c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        }
        return c >>> 0;
      });
    }
    let crc = 0xffffffff;
    for (let i = 0; i < bytes.length; i += 1) {
      crc = this._crcTable[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  _downloadBlob(filename, blob) {
    const url = URL.createObjectURL(blob);
    if (chrome?.downloads?.download) {
      chrome.downloads.download({ url, filename, saveAs: false }, () => {
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      });
      return;
    }
    const a = createElement('a', { href: url, download: filename });
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
  }

  _dataUrlToBlob(dataUrl) {
    const match = String(dataUrl || '').match(/^data:([^;,]+);base64,(.*)$/);
    if (!match) return new Blob([], { type: 'application/octet-stream' });
    const mimeType = match[1];
    const binary = atob(match[2]);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new Blob([bytes], { type: mimeType });
  }

  _getImageExtension(dataUrl, extHint) {
    return SidePanelManager.getImageExtensionFromDataUrl(dataUrl, extHint);
  }

  async clearRecordingCache() {
    try {
      const before = await sendMessage({ type: 'GET_STORAGE_USAGE' }).catch(() => null);
      const response = await sendMessage({ type: 'CLEAR_RECORDING_CACHE' });
      if (response?.error) throw new ExtensionError(response.error, 'CACHE_CLEAR_ERROR');
      const after = await sendMessage({ type: 'GET_STORAGE_USAGE' }).catch(() => null);
      const saved = before && after ? Math.max(0, before.bytes - after.bytes) : 0;
      const savedText = saved > 0 ? `，释放约 ${this._formatBytes(saved)}` : '';
      this._showNotification(this._t('cacheCleared', { savedText }), 'success');
    } catch (error) {
      console.error('[Scribe:SidePanel] Failed to clear recording cache:', error);
      this._showNotification(this._formatUserFacingError(error, this._t('clearCacheFailed')), 'error');
    }
  }

  _formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    let value = bytes;
    let unitIndex = 0;
    while (value >= 1024 && unitIndex < units.length - 1) {
      value /= 1024;
      unitIndex += 1;
    }
    return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
  }

  _buildStandaloneHtmlFromCurrentContent(content) {
    const format = this._getOutputFormat();
    const contentWithScreenshots = this._injectScreenshots(content, format);
    let html = '';
    if (format === 'html') {
      html = this._ensureStandaloneHtml(contentWithScreenshots);
    } else if (format === 'text') {
      html = this._buildStandaloneHtmlFromBody(`<pre>${this._escapeHtml(contentWithScreenshots)}</pre>`, 'SmartPages Document');
    } else {
      html = this._buildStandaloneHtml(contentWithScreenshots);
    }
    return this._applyHtmlExportStyle(html);
  }

  _buildDeliverableHtmlFromCurrentContent(content) {
    const html = this._buildStandaloneHtmlFromCurrentContent(content);
    return SidePanelManager.buildDeliverableHtml(html, {
      title: this._extractDocumentTitle(content),
      sourceTitle: this.session?.pageTitle || '',
      sourceUrl: this.session?.pageUrl || '',
      stepCount: this.session?.steps?.length || 0
    });
  }

  _buildStandaloneHtml(markdown) {
    const bodyHtml = this._markdownToSafeHtml(markdown);
    const title = this._extractDocumentTitle(markdown);
    return this._buildStandaloneHtmlFromBody(bodyHtml, title);
  }

  _applyHtmlExportStyle(html) {
    const css = this._getHtmlExportCss();
    const styleBlock = `<style>\n${css}\n  </style>`;
    const value = String(html || '');
    if (/<style[\s\S]*?<\/style>/i.test(value)) {
      return value.replace(/<style[\s\S]*?<\/style>/i, styleBlock);
    }
    if (/<\/head>/i.test(value)) {
      return value.replace(/<\/head>/i, `  ${styleBlock}\n</head>`);
    }
    return this._buildStandaloneHtmlFromBody(value, 'SmartPages Document').replace(/<style[\s\S]*?<\/style>/i, styleBlock);
  }

  _getHtmlExportCss() {
    if (this.htmlExportStyle.mode === 'upload' && this.htmlExportStyle.customCss) {
      return this.htmlExportStyle.customCss;
    }
    return this._getDefaultHtmlExportCss();
  }

  _getDefaultHtmlExportCss() {
    return `    :root {
      color-scheme: light;
      --text: #1f2937;
      --muted: #6b7280;
      --border: #e5e7eb;
      --surface: #ffffff;
      --code-bg: #f3f4f6;
      --accent: #2563eb;
    }
    body {
      margin: 0;
      background: #f9fafb;
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif;
      line-height: 1.7;
    }
    main {
      max-width: 920px;
      margin: 0 auto;
      padding: 40px 24px 56px;
      background: var(--surface);
      min-height: 100vh;
      box-sizing: border-box;
    }
    h1, h2, h3, h4 { line-height: 1.3; margin: 1.4em 0 0.6em; }
    h1 { padding-bottom: 14px; border-bottom: 1px solid var(--border); }
    p, ul, ol, blockquote, pre, table { margin: 0 0 1em; }
    a { color: var(--accent); }
    img {
      display: block;
      max-width: 100%;
      height: auto;
      object-fit: contain;
      margin: 16px 0;
      border: 1px solid var(--border);
      border-radius: 6px;
    }
    code {
      background: var(--code-bg);
      border-radius: 4px;
      padding: 2px 5px;
      font-family: Consolas, "SFMono-Regular", monospace;
      font-size: 0.92em;
    }
    pre { overflow: auto; padding: 14px 16px; background: var(--code-bg); border-radius: 6px; }
    pre code { padding: 0; background: transparent; }
    blockquote { color: var(--muted); padding-left: 14px; border-left: 4px solid var(--border); }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 8px 10px; border: 1px solid var(--border); text-align: left; }`;
  }

  _buildStandaloneHtmlFromBody(bodyHtml, title) {
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${this._escapeHtml(title)}</title>
  <style>
${this._getDefaultHtmlExportCss()}
  </style>
</head>
<body>
  <main>
${bodyHtml}
  </main>
</body>
</html>`;
  }

  _ensureStandaloneHtml(html) {
    const value = String(html || '').trim();
    if (/<!doctype html|<html[\s>]/i.test(value)) {
      return value;
    }
    const doc = new DOMParser().parseFromString(value, 'text/html');
    const title = doc.querySelector('h1')?.textContent?.trim() || 'SmartPages Document';
    return this._buildStandaloneHtmlFromBody(doc.body?.innerHTML || value, title);
  }

  _markdownToSafeHtml(markdown) {
    if (typeof marked === 'undefined') {
      return `<pre>${this._escapeHtml(markdown)}</pre>`;
    }

    marked.setOptions({ breaks: true, gfm: true });
    const rawHtml = marked.parse(markdown);
    const doc = new DOMParser().parseFromString(rawHtml, 'text/html');
    doc.querySelectorAll('script, iframe, object, embed, form, link, style').forEach(el => el.remove());
    doc.querySelectorAll('*').forEach(el => {
      for (const attr of Array.from(el.attributes)) {
        if (attr.name.startsWith('on')) el.removeAttribute(attr.name);
      }
    });
    return doc.body.innerHTML;
  }

  _extractDocumentTitle(markdown) {
    const content = String(markdown || '');
    const heading = content.split('\n').find(line => line.trim().startsWith('# '));
    if (heading) return heading.replace(/^#\s+/, '').trim();

    const htmlTitle = content.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim();
    if (htmlTitle) return htmlTitle;

    const h1 = content.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]?.trim();
    if (h1) return h1.replace(/<[^>]+>/g, '').trim();

    const firstLine = content.split('\n').map(line => line.trim()).find(Boolean);
    return firstLine ? firstLine.slice(0, 80) : 'SmartPages文档';
  }

  _getExportBaseName(content) {
    return SidePanelManager.getSafeExportFilename(this._extractDocumentTitle(content));
  }

  _escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  newDocument() {
    this.session = null;
    this._resetOptimizationState();
    this._showEmptyState();
  }

  retry() {
    if (this.session) this._showDescriptionSelector(); else this._showEmptyState();
  }

  // ========================================================================
  // UTILITY METHODS
  // ========================================================================

  _t(key, replacements = {}) {
    let value = this.uiText?.[key] || key;
    Object.entries(replacements).forEach(([name, replacement]) => {
      value = value.replaceAll(`{{${name}}}`, String(replacement ?? ''));
    });
    return value;
  }

  _showError(message) { this._showNotification(message, 'error'); }

  _showNotification(message, type = 'info') {
    const container = this._getToastContainer();
    const toast = document.createElement('div');
    toast.className = `smartpages-toast smartpages-toast-${type || 'info'}`;
    toast.textContent = String(message || '');
    container.appendChild(toast);
    setTimeout(() => toast.classList.add('visible'), 0);
    setTimeout(() => {
      toast.classList.remove('visible');
      setTimeout(() => toast.remove(), 200);
    }, type === 'error' ? 5000 : 3000);
  }

  _getToastContainer() {
    if (this.toastContainer?.isConnected) return this.toastContainer;
    const styleId = 'smartpages-toast-style';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = `
        .smartpages-toast-container {
          position: fixed;
          top: 16px;
          right: 16px;
          z-index: 2147483647;
          display: flex;
          flex-direction: column;
          gap: 8px;
          max-width: min(360px, calc(100vw - 32px));
          pointer-events: none;
        }
        .smartpages-toast {
          padding: 10px 12px;
          border-radius: 6px;
          background: #1f2937;
          color: #fff;
          box-shadow: 0 8px 24px rgba(15, 23, 42, 0.18);
          font-size: 13px;
          line-height: 1.4;
          opacity: 0;
          transform: translateY(-4px);
          transition: opacity 0.18s ease, transform 0.18s ease;
          word-break: break-word;
        }
        .smartpages-toast.visible {
          opacity: 1;
          transform: translateY(0);
        }
        .smartpages-toast-success { background: #047857; }
        .smartpages-toast-error { background: #b91c1c; }
      `;
      document.head.appendChild(style);
    }
    this.toastContainer = document.createElement('div');
    this.toastContainer.className = 'smartpages-toast-container';
    document.body.appendChild(this.toastContainer);
    return this.toastContainer;
  }

  _formatUserFacingError(error, fallback) {
    if (error?.code === 'EXTENSION_CONTEXT_INVALIDATED') {
      return '扩展上下文已失效，请刷新当前页面后重试。';
    }
    if (error?.code === 'NETWORK_ERROR') {
      return error.message || '网络请求失败，请检查模型 API 地址、网络代理或服务商跨域设置。';
    }
    return error?.message || fallback;
  }

  cleanup() {
    this.cleanupFunctions.forEach(fn => fn());
    this.cleanupFunctions = [];
    this.toastContainer?.remove();
    this.toastContainer = null;
  }
}

// ============================================================================
// INITIALIZATION
// ============================================================================

let sidePanelManager = null;

document.addEventListener('DOMContentLoaded', () => { sidePanelManager = new SidePanelManager(); });

window.addEventListener('unload', () => { if (sidePanelManager) sidePanelManager.cleanup(); });

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'START_AI_ANALYSIS' && sidePanelManager) {
    sidePanelManager.session = message.session;
    sidePanelManager.config = message.config;
    sidePanelManager._showDescriptionSelector();
  }
});
