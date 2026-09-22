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

  static getStepScreenshotStatus(step) {
    if (step?.includeScreenshot === false) return 'hidden';
    return step?.screenshot ? 'available' : 'missing';
  }

  constructor() {
    this.currentState = StateViews.EMPTY;
    this.session = null;
    this.config = null;
    this.originalBeforeOptimization = null;
    this.isGenerating = false;
    this.isOptimizing = false;
    this.documentApi = new DocumentApi();
    this.cloudDocuments = new CloudDocumentProvider();
    this.localDrafts = new LocalDocumentDraftStore();
    this.localDocuments = new LocalDirectoryDocumentStore();
    this.localDocumentState = { fileName: null, dirty: true };
    this.documentNavigationStack = [];
    this.cloudDocumentState = { id: null, revision: 0, dirty: true };
    this.isCloudAuthenticating = false;
    this._saveDraftDebounced = debounce(() => this._saveLocalDraft(), 500);
    this._searchCloudHistoryDebounced = debounce(() => this.loadCloudDocuments(), 250);
    this.docUI = new DocUIHelper({
      api: this.documentApi,
      source: 'sidepanel',
      onNotify: (msg, type) => this._showNotification(msg, type),
      getApi: () => this.documentApi
    });
    this.cleanupFunctions = [];
    this.workflowRun = null;
    this.workflowRunRequestPending = false;
    this._workflowReplayOperation = 0;
    this._workflowReplayUpdateRevision = 0;
    this._workflowReplayPendingOperation = null;
    this._workflowReplayActiveRunId = null;
    this.toastContainer = null;
    this.imageEditHistories = new Map();
    this.nextImageEditHistoryId = 1;
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
    if (this.currentState === StateViews.EMPTY) await this._restoreLocalDraft();
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
    this._bindButton('btn-copy-export', () => this.copyDocument());
    this._bindButton('btn-more-tools', event => this.toggleToolbarMenu(event));
    this._bindButton('btn-automation-tools', event => this.toggleAutomationMenu(event));
    this._bindButton('btn-configure-html-export', () => this.toggleHtmlExportSettings());
    this._bindButton('btn-download', () => this.downloadDocument());
    this._bindButton('btn-local-save', () => this.saveCurrentDocumentLocally());
    this._bindButton('btn-local-documents', () => this.openLocalDocumentsDialog());
    this._bindButton('btn-document-back', () => this.returnToPreviousDocument());
    this._bindButton('btn-close-local-documents', () => this.closeLocalDocumentsDialog());
    this._bindButton('btn-choose-local-folder', () => this.chooseLocalDocumentsFolder());
    this._bindButton('btn-refresh-local-documents', () => this.loadLocalDocuments());
    this._bindButton('btn-cloud-save', () => this.saveCurrentDocumentToCloud());
    this._bindButton('btn-history', () => this.openCloudDocumentsDialog());
    this._bindButton('btn-close-cloud-documents', () => this.closeCloudDocumentsDialog());
    this._bindButton('btn-open-cloud-settings', () => chrome.runtime.openOptionsPage());
    this._bindButton('btn-cloud-sign-up', () => this.signUpForCloud());
    this._bindButton('btn-refresh-cloud-documents', () => this.loadCloudDocuments());
    this._bindButton('btn-cloud-sign-out', () => this.signOutFromCloud());
    this._bindButton('btn-export-workflow', () => this.exportExecutableWorkflow());
    this._bindButton('btn-run-workflow', () => this.startWorkflowReplay());
    this._bindButton('btn-workflow-approve', () => this.approveWorkflowStep());
    this._bindButton('btn-workflow-reject', () => this.rejectWorkflowStep());
    this._bindButton('btn-workflow-cancel', () => this.cancelWorkflowReplay());
    this._bindButton('btn-export-html', () => this.exportHtmlDocument());
    this._bindButton('btn-export-word', () => this.exportWordDocument());
    this._bindButton('btn-export-pdf', () => this.exportPdfDocument());
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
    this._bindButton('btn-restore-original-image', () => this.restoreOriginalImage());
    this._bindButton('btn-undo-image-edit', () => this.undoImageEdit());
    this._bindButton('btn-redo-image-edit', () => this.redoImageEdit());
    this._bindButton('btn-apply-image-crop', () => this.applyImageCrop());
    this._bindButton('btn-image-mode-crop', () => this.setImageEditMode('crop'));
    this._bindButton('btn-image-mode-box', () => this.setImageEditMode('box'));
    this._bindButton('btn-image-mode-number', () => this.setImageEditMode('number'));
    this._bindButton('btn-image-mode-blur', () => this.setImageEditMode('blur'));
    this._bindButton('btn-upload-html-css', () => this._openHtmlCssFilePicker());
    this._bindToolbarMenuEvents();
    this._bindHtmlExportStyleEvents();
    this._bindEditorEvents();
    this._bindImageCropEvents();
    this._bindDocumentUploadEvents('sidepanel');
    const cloudAuthForm = document.getElementById('cloud-auth-form');
    if (cloudAuthForm) {
      const handleCloudSignIn = event => { event.preventDefault(); this.signInToCloud(); };
      cloudAuthForm.addEventListener('submit', handleCloudSignIn);
      this.cleanupFunctions.push(() => cloudAuthForm.removeEventListener('submit', handleCloudSignIn));
    }
    const cloudHistorySearch = document.getElementById('cloud-history-search');
    if (cloudHistorySearch) {
      const handleSearch = () => this._searchCloudHistoryDebounced();
      cloudHistorySearch.addEventListener('input', handleSearch);
      this.cleanupFunctions.push(() => cloudHistorySearch.removeEventListener('input', handleSearch));
    }
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
        this._markLocalDocumentDirty();
        this._markCloudDocumentDirty();
        this._saveDraftDebounced();
        if (document.getElementById('preview-pane')?.classList.contains('active')) {
          this._updatePreview(editor.value);
        }
      }, 120);
      editor.addEventListener('input', handleEditorInput);
      this.cleanupFunctions.push(() => editor.removeEventListener('input', handleEditorInput));
    }

    if (preview) {
      const handlePreviewInput = debounce(() => {
        this._syncPreviewToEditor();
        this._markLocalDocumentDirty();
        this._markCloudDocumentDirty();
        this._saveDraftDebounced();
      }, 120);
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
    const modal = document.getElementById('image-crop-modal');

    const handlePointerDown = (event) => this._startImageCropDrag(event);
    const handlePointerMove = (event) => this._moveImageCropDrag(event);
    const handlePointerUp = (event) => this._endImageCropDrag(event);
    const handleKeyDown = (event) => {
      if (!(event.ctrlKey || event.metaKey) || modal?.classList.contains('hidden')) return;
      const key = String(event.key || '').toLowerCase();
      if (key === 'z') {
        event.preventDefault();
        if (event.shiftKey) this.redoImageEdit();
        else this.undoImageEdit();
      } else if (key === 'y') {
        event.preventDefault();
        this.redoImageEdit();
      }
    };

    canvas.addEventListener('pointerdown', handlePointerDown);
    canvas.addEventListener('pointermove', handlePointerMove);
    canvas.addEventListener('pointerup', handlePointerUp);
    canvas.addEventListener('pointercancel', handlePointerUp);
    document.addEventListener('keydown', handleKeyDown);

    this.cleanupFunctions.push(() => {
      canvas.removeEventListener('pointerdown', handlePointerDown);
      canvas.removeEventListener('pointermove', handlePointerMove);
      canvas.removeEventListener('pointerup', handlePointerUp);
      canvas.removeEventListener('pointercancel', handlePointerUp);
      document.removeEventListener('keydown', handleKeyDown);
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
      uploadHelp: 'Supported formats: TXT, MD, HTML, RTF, PDF, DOCX',
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
      workflowExport: 'JSON Workflow',
      workflowExportTitle: 'Export executable workflow',
      workflowRun: 'Test Run',
      workflowRunTitle: 'Test run workflow',
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
      retry: 'Back and review',
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
      uploadHelp: '支持格式: TXT, MD, HTML, RTF, PDF, DOCX',
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
      workflowExport: 'JSON 工作流',
      workflowExportTitle: '导出可执行工作流',
      workflowRun: '测试运行',
      workflowRunTitle: '测试运行工作流',
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
      retry: '返回检查',
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
      imageRestoreOriginal: 'Restore original',
      imageUndo: 'Undo',
      imageRedo: 'Redo',
      imageUndoDone: 'Undid the last image edit.',
      imageRedoDone: 'Redid the image edit.',
      imageRestoreDone: 'Original image restored.',
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
      workflowExportEmptyContent: 'Enter document content before exporting a workflow.',
      workflowExportEmptySession: 'Record at least one step before exporting a workflow.',
      workflowExportUnavailable: 'Workflow export is unavailable. Please reload the extension and try again.',
      workflowExportConversionFailed: 'Failed to convert the recording into an executable workflow.',
      workflowExportInvalid: 'The generated workflow is invalid and could not be exported.',
      workflowExportFailed: 'Failed to export executable workflow.',
      workflowRunStarting: 'Starting test run…',
      workflowRunFailed: 'Test run failed. Please try again.',
      workflowRunInvalid: 'Workflow cannot be run.',
      workflowRunStatusRUNNING: 'Running', workflowRunStatusWAITING_CONFIRMATION: 'Confirmation required',
      workflowRunStatusWAITING_INPUT: 'Input required', workflowRunStatusFAILED: 'Failed',
      workflowRunStatusCOMPLETED: 'Completed', workflowRunStatusCANCELLED: 'Cancelled',
      workflowRunStep: 'Step {{id}}: {{description}}', workflowRunOrigin: 'Site: {{value}}',
      workflowRunAction: 'Action: {{value}}', workflowRunTarget: 'Target: {{value}}',
      workflowRunVariables: 'Variables: {{value}}', workflowRunNoVariables: 'None',
      workflowRunApprove: 'Approve', workflowRunContinue: 'Continue', workflowRunReject: 'Reject', workflowRunCancel: 'Cancel',
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
      imageRestoreOriginal: '恢复原图',
      imageUndo: '撤销',
      imageRedo: '重做',
      imageUndoDone: '已撤销上一步图片编辑。',
      imageRedoDone: '已重做图片编辑。',
      imageRestoreDone: '已恢复原图。',
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
      workflowExportEmptyContent: '请先输入文档内容，再导出工作流。',
      workflowExportEmptySession: '请先录制至少一个步骤，再导出工作流。',
      workflowExportUnavailable: '工作流导出功能暂不可用，请重新加载扩展后重试。',
      workflowExportConversionFailed: '无法将录制内容转换为可执行工作流。',
      workflowExportInvalid: '生成的工作流无效，无法导出。',
      workflowExportFailed: '导出可执行工作流失败。',
      workflowRunStarting: '正在启动测试运行…',
      workflowRunFailed: '测试运行失败，请重试。',
      workflowRunInvalid: '当前工作流无法运行。',
      workflowRunStatusRUNNING: '运行中', workflowRunStatusWAITING_CONFIRMATION: '需要确认',
      workflowRunStatusWAITING_INPUT: '需要输入', workflowRunStatusFAILED: '失败',
      workflowRunStatusCOMPLETED: '已完成', workflowRunStatusCANCELLED: '已取消',
      workflowRunStep: '步骤 {{id}}：{{description}}', workflowRunOrigin: '网站：{{value}}',
      workflowRunAction: '操作：{{value}}', workflowRunTarget: '目标：{{value}}',
      workflowRunVariables: '变量：{{value}}', workflowRunNoVariables: '无',
      workflowRunApprove: '批准', workflowRunContinue: '继续', workflowRunReject: '拒绝', workflowRunCancel: '取消',
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
    setButton('#btn-copy-export', isEn ? 'Copy content' : '复制内容');
    setButton('#btn-download', isEn ? 'Original file' : '原始文件');
    setButton('#btn-export-workflow', text.workflowExport);
    setButton('#btn-run-workflow', text.workflowRun);
    setButton('#btn-workflow-approve', text.workflowRunApprove);
    setButton('#btn-workflow-reject', text.workflowRunReject);
    setButton('#btn-workflow-cancel', text.workflowRunCancel);
    const workflowRunButton = document.getElementById('btn-run-workflow');
    if (workflowRunButton) {
      workflowRunButton.title = text.workflowRunTitle;
      workflowRunButton.setAttribute('aria-label', text.workflowRunTitle);
    }
    const workflowExportButton = document.getElementById('btn-export-workflow');
    if (workflowExportButton) {
      workflowExportButton.title = text.workflowExportTitle;
      workflowExportButton.setAttribute('aria-label', text.workflowExportTitle);
    }
    setButton('#btn-configure-html-export', text.html);
    setButton('#btn-export-html', isEn ? 'Export HTML' : '导出 HTML');
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
    setButton('#btn-restore-original-image', text.imageRestoreOriginal);
    setButton('#btn-undo-image-edit', text.imageUndo);
    setButton('#btn-redo-image-edit', text.imageRedo);
    const undoImageButton = document.getElementById('btn-undo-image-edit');
    const redoImageButton = document.getElementById('btn-redo-image-edit');
    if (undoImageButton) undoImageButton.title = `${text.imageUndo} (Ctrl+Z)`;
    if (redoImageButton) redoImageButton.title = `${text.imageRedo} (Ctrl+Y)`;
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
    const cloudText = isEn ? {
      save: 'Save current document', library: 'History', unsaved: 'Unsaved', title: 'Generated Document History',
      config: 'Configure Supabase or Tencent CloudBase in Settings first.', settings: 'Open Settings',
      authHelp: 'Sign in to view generated-document history and versions. Reference uploads stay separate.', email: 'Email', password: 'Password',
      signIn: 'Sign In', signUp: 'Sign Up', refresh: 'Refresh', signOut: 'Sign Out'
    } : {
      save: '保存当前文档', library: '生成历史', unsaved: '未保存', title: '生成文档历史',
      config: '请先在设置页配置 Supabase 或腾讯云 CloudBase。', settings: '打开设置',
      authHelp: '登录后可查看生成文档的历史和版本；参考文档不会显示在这里。', email: '邮箱', password: '密码',
      signIn: '登录', signUp: '注册', refresh: '刷新', signOut: '退出'
    };
    setButton('#btn-cloud-save', cloudText.save);
    const historyButton = document.getElementById('btn-history');
    if (historyButton) {
      historyButton.title = cloudText.title;
      historyButton.setAttribute('aria-label', cloudText.title);
    }
    set('#cloud-documents-title', cloudText.title);
    set('#cloud-config-required p', cloudText.config);
    setButton('#btn-open-cloud-settings', cloudText.settings);
    set('#cloud-auth-form p', cloudText.authHelp);
    set('label[for="cloud-email"]', cloudText.email);
    set('label[for="cloud-password"]', cloudText.password);
    setButton('#btn-cloud-sign-in', cloudText.signIn);
    setButton('#btn-cloud-sign-up', cloudText.signUp);
    setButton('#btn-refresh-cloud-documents', cloudText.refresh);
    setButton('#btn-cloud-sign-out', cloudText.signOut);
    const historySearch = document.getElementById('cloud-history-search');
    if (historySearch) historySearch.placeholder = isEn ? 'Search generated documents...' : '搜索生成文档...';
    this._setCloudSaveStatus(cloudText.unsaved);
    const localText = isEn ? {
      save: 'Save', library: 'History', unsaved: 'Not saved locally', title: 'Local Document History',
      choose: 'Choose Folder', refresh: 'Refresh', noFolder: 'No folder selected',
      help: 'SmartPages only lists .md, .html, and .txt documents created by it.'
    } : {
      save: '保存', library: '历史', unsaved: '未保存本地', title: '本地文档历史',
      choose: '选择文件夹', refresh: '刷新', noFolder: '尚未选择文件夹',
      help: 'SmartPages 只显示由它创建的 .md、.html 和 .txt 文档。'
    };
    setButton('#btn-local-save', localText.save);
    setButton('#btn-local-documents', localText.library);
    setButton('#btn-document-back', isEn ? 'Back' : '返回');
    set('#local-documents-title', localText.title);
    setButton('#btn-choose-local-folder', localText.choose);
    setButton('#btn-refresh-local-documents', localText.refresh);
    set('#local-folder-name', localText.noFolder);
    set('.local-folder-help', localText.help);
    this._setLocalSaveStatus(localText.unsaved);
    const exportText = isEn ? {
      export: 'Export', formats: 'Choose delivery format', automation: 'Automation', workflow: 'Executable workflow',
      workflowHelp: 'Export the recorded flow or test it on the current page.', html: 'HTML export settings'
    } : {
      export: '导出', formats: '选择交付格式', automation: '自动化', workflow: '可执行工作流',
      workflowHelp: '导出录制流程，或在当前页面测试运行。', html: 'HTML 导出设置'
    };
    setButton('#btn-more-tools', exportText.export);
    setButton('#btn-automation-tools', exportText.automation);
    set('#toolbar-export-title', exportText.formats);
    set('#toolbar-workflow-title', exportText.workflow);
    set('.toolbar-menu-help', exportText.workflowHelp);
    set('#toolbar-html-title', exportText.html);
  }

  _bindToolbarMenuEvents() {
    const menu = document.getElementById('toolbar-more-menu');
    const wrap = document.getElementById('btn-more-tools')?.closest('.toolbar-more-wrap');
    const automationMenu = document.getElementById('toolbar-automation-menu');
    const automationWrap = document.getElementById('btn-automation-tools')?.closest('.toolbar-more-wrap');
    if (!menu || !wrap || !automationMenu || !automationWrap) return;

    const handleDocumentClick = event => {
      if (!wrap.contains(event.target)) this.closeToolbarMenu();
      if (!automationWrap.contains(event.target)) this.closeAutomationMenu();
    };
    const handleDocumentKeydown = event => {
      if (event.key === 'Escape') {
        const exportOpen = !menu.classList.contains('hidden');
        const automationOpen = !automationMenu.classList.contains('hidden');
        this.closeToolbarMenu(exportOpen);
        this.closeAutomationMenu(!exportOpen && automationOpen);
      }
    };
    const handleMenuClick = event => {
      const button = event.target.closest('button');
      if (button && !button.hasAttribute('data-menu-keep-open')) this.closeToolbarMenu();
    };
    const handleAutomationClick = event => {
      if (event.target.closest('button')) this.closeAutomationMenu();
    };

    document.addEventListener('click', handleDocumentClick);
    document.addEventListener('keydown', handleDocumentKeydown);
    menu.addEventListener('click', handleMenuClick);
    automationMenu.addEventListener('click', handleAutomationClick);
    this.cleanupFunctions.push(() => document.removeEventListener('click', handleDocumentClick));
    this.cleanupFunctions.push(() => document.removeEventListener('keydown', handleDocumentKeydown));
    this.cleanupFunctions.push(() => menu.removeEventListener('click', handleMenuClick));
    this.cleanupFunctions.push(() => automationMenu.removeEventListener('click', handleAutomationClick));
  }

  toggleToolbarMenu(event) {
    event?.stopPropagation();
    const menu = document.getElementById('toolbar-more-menu');
    const button = document.getElementById('btn-more-tools');
    if (!menu || !button) return;
    const willOpen = menu.classList.contains('hidden');
    if (willOpen) this.closeAutomationMenu();
    menu.classList.toggle('hidden', !willOpen);
    button.setAttribute('aria-expanded', String(willOpen));
  }

  toggleAutomationMenu(event) {
    event?.stopPropagation();
    const menu = document.getElementById('toolbar-automation-menu');
    const button = document.getElementById('btn-automation-tools');
    if (!menu || !button) return;
    const willOpen = menu.classList.contains('hidden');
    if (willOpen) this.closeToolbarMenu();
    menu.classList.toggle('hidden', !willOpen);
    button.setAttribute('aria-expanded', String(willOpen));
  }

  toggleHtmlExportSettings() {
    const settings = document.getElementById('html-export-settings');
    settings?.classList.toggle('hidden');
  }

  closeToolbarMenu(focusButton = false) {
    const menu = document.getElementById('toolbar-more-menu');
    const button = document.getElementById('btn-more-tools');
    menu?.classList.add('hidden');
    button?.setAttribute('aria-expanded', 'false');
    if (focusButton) button?.focus();
  }

  closeAutomationMenu(focusButton = false) {
    const menu = document.getElementById('toolbar-automation-menu');
    const button = document.getElementById('btn-automation-tools');
    menu?.classList.add('hidden');
    button?.setAttribute('aria-expanded', 'false');
    if (focusButton) button?.focus();
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

  // ========================================================================
  // ACTIONS
  // ========================================================================

  _setEditorContent(content, options = {}) {
    if (!options.preserveImageHistory) this._resetImageEditHistories();
    const editor = document.getElementById('markdown-editor');
    if (editor) {
      editor.value = content;
      this._updatePreview(content);
      this._markLocalDocumentDirty();
      this._markCloudDocumentDirty();
      this._saveDraftDebounced();
    }
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
    if (!previewDiv) return;
    if (typeof marked === 'undefined') {
      console.warn('[Scribe:SidePanel] marked library not loaded; using plain text preview.');
      previewDiv.textContent = markdown || '';
      return;
    }

    marked.setOptions({ breaks: true, gfm: true });
    safeSetInnerHTML(previewDiv, marked.parse(markdown), true);
    this._attachImageEditing(previewDiv);
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

  _normalizeGeneratedContent(content, format) {
    const normalizedFormat = this._getOutputFormat(format);
    const value = String(content || '').trim();
    const fencePattern = normalizedFormat === 'html'
      ? /^```(?:html)?\s*([\s\S]*?)\s*```$/i
      : normalizedFormat === 'markdown'
        ? /^```(?:markdown|md)?\s*([\s\S]*?)\s*```$/i
        : /^```(?:text|txt)?\s*([\s\S]*?)\s*```$/i;
    const match = value.match(fencePattern);
    return this._stripModelPreamble((match?.[1] || value).trim(), normalizedFormat);
  }

  _stripModelPreamble(content, format) {
    let value = String(content || '').trim();
    value = value.replace(/^<think>[\s\S]*?<\/think>\s*/i, '').trim();

    const documentStartPattern = format === 'html'
      ? /<!doctype\s+html\b|<html\b|<main\b|<article\b|<h1\b/i
      : format === 'markdown'
        ? /^#{1,6}\s+\S/m
        : null;
    if (!documentStartPattern) return value;

    const documentStart = value.search(documentStartPattern);
    if (documentStart <= 0) return value;

    const prefix = value.slice(0, documentStart).trim();
    const hasAnalysisOpening = /^(?:the user (?:wants|asked)|we need to|i need to|let me|i(?:'ll| will))\b/i.test(prefix);
    const hasAnalysisLanguage = /\b(?:let me (?:analy[sz]e|write|create|generate)|so the flow is|recorded steps?|following the requested format|step\s+\d+\s*:)/i.test(prefix);
    return hasAnalysisOpening || hasAnalysisLanguage
      ? value.slice(documentStart).trim()
      : value;
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
        {
          temperature: 0.5,
          maxTokens: config.maxTokens || DEFAULT_MAX_TOKENS,
          images: this._getModelScreenshotInputs(config)
        }
      );
      const response = await fetchWithTimeout(
        request.url,
        request.fetchOptions,
        DOC_GEN_TIMEOUT
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const apiError = new ExtensionError(`API调用失败: ${errorData.error?.message || response.statusText}`, 'API_ERROR');
        apiError.status = response.status;
        throw apiError;
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

  // ========================================================================
  // LOCAL DRAFTS AND CLOUD DOCUMENTS
  // ========================================================================

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

  newDocument() {
    this.session = null;
    this.documentNavigationStack = [];
    this._updateDocumentBackButton();
    this.localDocumentState = { fileName: null, dirty: true };
    this.cloudDocumentState = { id: null, revision: 0, dirty: true };
    this.localDrafts.clear().catch(error => console.warn('[SmartPages:Draft] Failed to clear draft:', error));
    const editor = document.getElementById('markdown-editor');
    if (editor) editor.value = '';
    this._setLocalSaveStatus(this.language === 'en-US' ? 'Not saved locally' : '未保存本地');
    this._setCloudSaveStatus(this.language === 'en-US' ? 'Unsaved' : '未保存');
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
    return formatUserFacingError(error, this.language, fallback);
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

// Install non-enumerable class methods while retaining the public manager API.
for (const feature of globalThis.SmartPagesSidePanelModules) {
  for (const [target, origin, excluded] of [
    [SidePanelManager.prototype, feature.prototype, ['constructor']],
    [SidePanelManager, feature, ['name', 'length', 'prototype']]
  ]) {
    for (const name of Object.getOwnPropertyNames(origin)) {
      if (!excluded.includes(name)) Object.defineProperty(target, name, Object.getOwnPropertyDescriptor(origin, name));
    }
  }
}

let sidePanelManager = null;

document.addEventListener('DOMContentLoaded', () => { sidePanelManager = new SidePanelManager(); });

window.addEventListener('unload', () => { if (sidePanelManager) sidePanelManager.cleanup(); });

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'WORKFLOW_RUN_CHANGED' && sidePanelManager && message.status?.runId
      && message.status.runId === sidePanelManager._workflowReplayActiveRunId
      && !sidePanelManager._wouldRegressTerminalWorkflow(message.status)) {
    sidePanelManager._workflowReplayUpdateRevision += 1;
    sidePanelManager._renderWorkflowRun(message.status);
  } else if (message.type === 'START_AI_ANALYSIS' && sidePanelManager) {
    sidePanelManager.session = message.session;
    sidePanelManager.config = message.config;
    sidePanelManager._showDescriptionSelector();
  }
});
