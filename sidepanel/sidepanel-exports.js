/** Side panel exports behavior. Loaded before sidepanel.js. */
(globalThis.SmartPagesSidePanelModules ||= []).push(class {
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
    if (imagePages.some(page => !/^data:image\/jpeg;base64,/i.test(page.dataUrl))) {
      throw new Error('Image PDF pages must be JPEG data URLs');
    }
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
    const blob = new Blob([format === 'html' ? this._buildDeliverableHtmlFromCurrentContent(content) : content], { type: mimeType });
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

    const html = this._buildDeliverableHtmlFromCurrentContent(content);
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

    printWindow.addEventListener('load', () => {
      setTimeout(() => {
        printWindow.focus?.();
        printWindow.print?.();
      }, 250);
    }, { once: true });
    printWindow.document.open();
    printWindow.document.write(printHtml);
    printWindow.document.close();
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
    safeSetInnerHTML(host, bodyHtml, true);
    const styleElement = document.createElement('style');
    styleElement.textContent = styleHtml;
    host.prepend(styleElement);
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
      let payload = data;
      let compressionMethod = 0;
      if (this._shouldCompressZipFile(file)) {
        const compressed = await this._compressZipData(data);
        if (compressed && compressed.length < data.length) {
          payload = compressed;
          compressionMethod = 8;
        }
      }
      const localHeader = this._createZipLocalHeader(nameBytes, payload.length, data.length, crc, compressionMethod);
      chunks.push(localHeader, payload);
      centralDirectory.push({
        nameBytes,
        crc,
        size: data.length,
        compressedSize: payload.length,
        compressionMethod,
        offset
      });
      offset += localHeader.length + payload.length;
    }

    const centralStart = offset;
    centralDirectory.forEach(entry => {
      const header = this._createZipCentralHeader(
        entry.nameBytes,
        entry.compressedSize,
        entry.size,
        entry.crc,
        entry.offset,
        entry.compressionMethod
      );
      chunks.push(header);
      offset += header.length;
    });
    chunks.push(this._createZipEndRecord(centralDirectory.length, offset - centralStart, centralStart));
    return new Blob(chunks, { type: 'application/zip' });
  }

  _shouldCompressZipFile(file) {
    const type = String(file?.blob?.type || '').toLowerCase();
    const name = String(file?.name || '').toLowerCase();
    return type.startsWith('text/') || /\.(?:txt|md|html|css|js|json|xml|csv)$/i.test(name);
  }

  async _compressZipData(data) {
    if (typeof CompressionStream === 'undefined' || typeof Response === 'undefined') return null;
    try {
      const stream = new Blob([data]).stream().pipeThrough(new CompressionStream('deflate-raw'));
      return new Uint8Array(await new Response(stream).arrayBuffer());
    } catch (error) {
      console.warn('[Scribe:SidePanel] ZIP compression unavailable; storing file without compression.', error);
      return null;
    }
  }

  _createZipLocalHeader(nameBytes, compressedSize, size, crc, compressionMethod = 0) {
    const header = new Uint8Array(30 + nameBytes.length);
    const view = new DataView(header.buffer);
    view.setUint32(0, 0x04034b50, true);
    view.setUint16(4, 20, true);
    view.setUint16(6, 0, true);
    view.setUint16(8, compressionMethod, true);
    view.setUint16(10, 0, true);
    view.setUint16(12, 0, true);
    view.setUint32(14, crc, true);
    view.setUint32(18, compressedSize, true);
    view.setUint32(22, size, true);
    view.setUint16(26, nameBytes.length, true);
    view.setUint16(28, 0, true);
    header.set(nameBytes, 30);
    return header;
  }

  _createZipCentralHeader(nameBytes, compressedSize, size, crc, offset, compressionMethod = 0) {
    const header = new Uint8Array(46 + nameBytes.length);
    const view = new DataView(header.buffer);
    view.setUint32(0, 0x02014b50, true);
    view.setUint16(4, 20, true);
    view.setUint16(6, 20, true);
    view.setUint16(8, 0, true);
    view.setUint16(10, compressionMethod, true);
    view.setUint16(12, 0, true);
    view.setUint16(14, 0, true);
    view.setUint32(16, crc, true);
    view.setUint32(20, compressedSize, true);
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
    sanitizeHtmlDocument(doc);
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
});
