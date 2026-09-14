/** Side panel editing behavior. Loaded before sidepanel.js. */
(globalThis.SmartPagesSidePanelModules ||= []).push(class {
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

  static createImageEditHistory(snapshot) {
    return { states: [{ ...snapshot }], index: 0 };
  }

  static pushImageEditHistory(history, snapshot) {
    if (!history?.states?.length) return SidePanelManager.createImageEditHistory(snapshot);
    const next = { ...snapshot };
    const current = history.states[history.index];
    if (JSON.stringify(current) === JSON.stringify(next)) return history;
    history.states = history.states.slice(0, history.index + 1);
    history.states.push(next);
    history.index = history.states.length - 1;
    return history;
  }

  static stepImageEditHistory(history, direction) {
    if (!history?.states?.length) return null;
    const nextIndex = Math.max(0, Math.min(history.states.length - 1, history.index + direction));
    if (nextIndex === history.index) return null;
    history.index = nextIndex;
    return { ...history.states[history.index] };
  }

  static getNextAnnotationNumber(images) {
    const values = Array.from(images || [])
      .map(image => Number.parseInt(image?.dataset?.annotationNumber, 10))
      .filter(Number.isFinite);
    return values.length ? Math.max(...values) + 1 : 1;
  }

  _attachImageEditing(root) {
    if (!root) return;
    const assignedHistoryIds = new Set();
    root.querySelectorAll('img').forEach((img, index) => {
      if (!img.getAttribute('src')) return;
      const history = this._ensureImageEditHistory(img, assignedHistoryIds);
      assignedHistoryIds.add(history.id);
      img.dataset.originalSrc = history.states[0].src;
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
      this._ensureImageEditHistory(imageElement);
      this._updateImageHistoryControls();
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
    this._updateImageHistoryControls();
  }

  _resetImageEditHistories() {
    this.imageEditHistories.clear();
    this.nextImageEditHistoryId = 1;
  }

  _getImageSnapshot(imageElement) {
    const get = name => imageElement?.dataset?.[name] || null;
    return {
      src: imageElement?.getAttribute?.('src') || '',
      imageEdited: get('imageEdited'),
      imageEditOperation: get('imageEditOperation'),
      cropRect: get('cropRect'),
      annotationNumber: get('annotationNumber')
    };
  }

  _ensureImageEditHistory(imageElement, excludedIds = new Set()) {
    const currentSnapshot = this._getImageSnapshot(imageElement);
    let id = imageElement?.dataset?.imageHistoryId;
    let history = id ? this.imageEditHistories.get(id) : null;
    if (!history) {
      const match = Array.from(this.imageEditHistories.entries()).find(([candidateId, candidate]) => (
        !excludedIds.has(candidateId) && candidate.states.some(state => state.src === currentSnapshot.src)
      ));
      if (match) [id, history] = match;
    }
    if (!history) {
      id = `image_history_${this.nextImageEditHistoryId++}`;
      const originalSrc = imageElement?.dataset?.originalSrc || currentSnapshot.src;
      history = SidePanelManager.createImageEditHistory({
        src: originalSrc,
        imageEdited: null,
        imageEditOperation: null,
        cropRect: null,
        annotationNumber: null
      });
      if (originalSrc !== currentSnapshot.src) {
        SidePanelManager.pushImageEditHistory(history, currentSnapshot);
      }
      this.imageEditHistories.set(id, history);
    }
    imageElement.dataset.imageHistoryId = id;
    return { id, ...history };
  }

  _getActiveImageHistory() {
    const imageElement = this.imageCropState.imageElement;
    if (!imageElement) return null;
    const id = imageElement.dataset.imageHistoryId;
    return id ? this.imageEditHistories.get(id) : null;
  }

  _setImageDatasetValue(imageElement, name, value) {
    if (value === null || value === undefined || value === '') delete imageElement.dataset[name];
    else imageElement.dataset[name] = String(value);
  }

  _applyImageSnapshot(imageElement, snapshot) {
    imageElement.setAttribute('src', snapshot.src);
    this._setImageDatasetValue(imageElement, 'imageEdited', snapshot.imageEdited);
    this._setImageDatasetValue(imageElement, 'imageEditOperation', snapshot.imageEditOperation);
    this._setImageDatasetValue(imageElement, 'cropRect', snapshot.cropRect);
    this._setImageDatasetValue(imageElement, 'annotationNumber', snapshot.annotationNumber);
  }

  _commitImageEdit() {
    this._syncPreviewToEditor();
    this._markLocalDocumentDirty();
    this._markCloudDocumentDirty();
    this._saveDraftDebounced();
    this._updateImageHistoryControls();
  }

  _updateImageHistoryControls() {
    const history = this._getActiveImageHistory();
    const restoreButton = document.getElementById('btn-restore-original-image');
    const undoButton = document.getElementById('btn-undo-image-edit');
    const redoButton = document.getElementById('btn-redo-image-edit');
    const current = history?.states?.[history.index];
    const original = history?.states?.[0];
    const isOriginal = Boolean(current && original && JSON.stringify(current) === JSON.stringify(original));
    if (restoreButton) restoreButton.disabled = !history || isOriginal;
    if (undoButton) undoButton.disabled = !history || history.index <= 0;
    if (redoButton) redoButton.disabled = !history || history.index >= history.states.length - 1;
  }

  async _moveImageEditHistory(direction, messageKey) {
    const imageElement = this.imageCropState.imageElement;
    const history = this._getActiveImageHistory();
    const snapshot = SidePanelManager.stepImageEditHistory(history, direction);
    if (!imageElement || !snapshot) return;
    this._applyImageSnapshot(imageElement, snapshot);
    this._commitImageEdit();
    try {
      const sourceImage = await this._loadImageForCrop(snapshot.src);
      if (this.imageCropState.imageElement !== imageElement) return;
      this.imageCropState.sourceImage = sourceImage;
      this.imageCropState.displayScale = this._getImageCropDisplayScale(sourceImage);
      this.resetImageCropSelection();
    } catch (error) {
      console.error('[Scribe:SidePanel] Failed to refresh image edit history:', error);
      this._setImageCropStatus(this._t('cropLoadFailed'));
    }
    this._showNotification(this._t(messageKey), 'success');
  }

  undoImageEdit() {
    return this._moveImageEditHistory(-1, 'imageUndoDone');
  }

  redoImageEdit() {
    return this._moveImageEditHistory(1, 'imageRedoDone');
  }

  async restoreOriginalImage() {
    const imageElement = this.imageCropState.imageElement;
    const history = this._getActiveImageHistory();
    if (!imageElement || !history || history.index === 0) return;
    const original = { ...history.states[0] };
    SidePanelManager.pushImageEditHistory(history, original);
    this._applyImageSnapshot(imageElement, original);
    this._commitImageEdit();
    try {
      const sourceImage = await this._loadImageForCrop(original.src);
      if (this.imageCropState.imageElement !== imageElement) return;
      this.imageCropState.sourceImage = sourceImage;
      this.imageCropState.displayScale = this._getImageCropDisplayScale(sourceImage);
      this.resetImageCropSelection();
    } catch (error) {
      console.error('[Scribe:SidePanel] Failed to restore original image in editor:', error);
      this._setImageCropStatus(this._t('cropLoadFailed'));
    }
    this._showNotification(this._t('imageRestoreDone'), 'success');
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
      const history = this._getActiveImageHistory();
      SidePanelManager.pushImageEditHistory(history, this._getImageSnapshot(imageElement));
      this._commitImageEdit();
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
        // The editor must retain inline screenshots. Replacing a session image with
        // a marker here makes switching from preview to edit appear to lose it.
        // _prepareContentForModel still replaces images with markers for AI requests.
        return `![${alt.replace(/\]/g, '\\]')}](${src})`;
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
});
