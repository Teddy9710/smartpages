/** Side panel documents behavior. Loaded before sidepanel.js. */
(globalThis.SmartPagesSidePanelModules ||= []).push(class {
  async _saveLocalDraft() {
    let content = document.getElementById('markdown-editor')?.value || '';
    if (!content.trim()) return;
    try {
      if (this.cloudDocumentState.id) {
        content = await this.cloudDocuments.dehydrateAssets(content);
      }
      await this.localDrafts.save({
        id: this.cloudDocumentState.id,
        revision: this.cloudDocumentState.revision,
        title: this._extractDocumentTitle(content),
        format: this._getOutputFormat(),
        content
      });
    } catch (error) {
      console.warn('[SmartPages:Draft] Failed to save local draft:', error);
    }
  }

  async _restoreLocalDraft() {
    try {
      const draft = await this.localDrafts.load();
      if (!draft?.content?.trim()) return;
      let restoredContent = draft.content;
      if (draft.id && (/smartpages-asset:\/\//.test(restoredContent) || /\/storage\/v1\/object\/sign\//.test(restoredContent))) {
        restoredContent = await this.cloudDocuments.refreshAssetUrls(restoredContent).catch(() => restoredContent);
      }
      this.showEditor();
      this.config = { ...(this.config || {}), outputFormat: draft.format || 'markdown' };
      this._setEditorContent(restoredContent);
      this.cloudDocumentState = {
        id: draft.id || null,
        revision: Number(draft.revision) || 0,
        dirty: true
      };
      this._setCloudSaveStatus(this.language === 'en-US' ? 'Local draft' : '本地草稿', '');
    } catch (error) {
      console.warn('[SmartPages:Draft] Failed to restore local draft:', error);
    }
  }

  _markLocalDocumentDirty() {
    if (!this.localDocumentState) return;
    this.localDocumentState.dirty = true;
    this._setLocalSaveStatus(this.language === 'en-US' ? 'Not saved locally' : '未保存本地');
  }

  _setLocalSaveStatus(message, type = '') {
    const status = document.getElementById('local-save-status');
    if (!status) return;
    status.textContent = message;
    status.className = `cloud-save-status${type ? ` ${type}` : ''}`;
  }

  _setLocalDialogStatus(message = '', type = '') {
    const status = document.getElementById('local-dialog-status');
    if (!status) return;
    status.textContent = message;
    status.className = `cloud-dialog-status${type ? ` ${type}` : ''}${message ? '' : ' hidden'}`;
  }

  async openLocalDocumentsDialog() {
    document.getElementById('local-documents-modal')?.classList.remove('hidden');
    this._setLocalDialogStatus();
    if (!this.localDocuments.isSupported()) {
      this._setLocalDialogStatus(this.language === 'en-US' ? 'Local folder access is not supported in this browser.' : '当前浏览器不支持本地文件夹访问。', 'error');
      return;
    }
    const granted = await this.localDocuments.hasPermission().catch(() => false);
    if (granted) await this.loadLocalDocuments();
    else {
      const folderName = document.getElementById('local-folder-name');
      if (folderName) folderName.textContent = this.language === 'en-US' ? 'Choose or re-authorize a folder' : '请选择或重新授权文件夹';
    }
  }

  closeLocalDocumentsDialog() {
    document.getElementById('local-documents-modal')?.classList.add('hidden');
  }

  async chooseLocalDocumentsFolder() {
    this._setLocalDialogStatus(this.language === 'en-US' ? 'Waiting for folder selection...' : '请选择文档保存文件夹...');
    try {
      const handle = await this.localDocuments.chooseDirectory();
      const folderName = document.getElementById('local-folder-name');
      if (folderName) folderName.textContent = handle.name;
      this._setLocalDialogStatus();
      await this.loadLocalDocuments();
    } catch (error) {
      if (error?.name !== 'AbortError') this._setLocalDialogStatus(error.message, 'error');
      else this._setLocalDialogStatus();
    }
  }

  async saveCurrentDocumentLocally() {
    this._ensureEditorContentFresh();
    const content = document.getElementById('markdown-editor')?.value || '';
    if (!content.trim()) {
      this._showError(this._t('contentRequired'));
      return;
    }
    if (!await this.localDocuments.hasPermission().catch(() => false)) {
      await this.openLocalDocumentsDialog();
      return;
    }
    const button = document.getElementById('btn-local-save');
    if (button) button.disabled = true;
    this._setLocalSaveStatus(this.language === 'en-US' ? 'Saving...' : '保存中...', 'saving');
    try {
      const saved = await this.localDocuments.saveDocument({
        fileName: this.localDocumentState.fileName,
        title: this._extractDocumentTitle(content),
        format: this._getOutputFormat(),
        content
      });
      this.localDocumentState = { fileName: saved.fileName, dirty: false };
      this._setLocalSaveStatus(this.language === 'en-US' ? 'Saved locally' : '已保存本地', 'saved');
      this._showNotification(this.language === 'en-US' ? `Saved in ${await this.localDocuments.getDirectoryName()}.` : `文档已保存到“${await this.localDocuments.getDirectoryName()}”文件夹。`, 'success');
    } catch (error) {
      this._setLocalSaveStatus(this.language === 'en-US' ? 'Local save failed' : '本地保存失败', 'error');
      this._showError(error.message);
    } finally {
      if (button) button.disabled = false;
    }
  }

  async loadLocalDocuments() {
    const list = document.getElementById('local-documents-list');
    if (!list) return;
    list.textContent = this.language === 'en-US' ? 'Loading...' : '正在加载...';
    try {
      const documents = await this.localDocuments.listDocuments();
      const folderName = document.getElementById('local-folder-name');
      if (folderName) folderName.textContent = await this.localDocuments.getDirectoryName();
      list.textContent = '';
      if (!documents.length) {
        list.textContent = this.language === 'en-US' ? 'No local documents yet.' : '这个文件夹里还没有 SmartPages 文档。';
        return;
      }
      documents.forEach(localDocument => list.appendChild(this._createLocalDocumentItem(localDocument)));
    } catch (error) {
      list.textContent = '';
      this._setLocalDialogStatus(error.message, 'error');
    }
  }

  _createLocalDocumentItem(localDocument) {
    const item = document.createElement('div');
    item.className = 'cloud-document-item';
    const title = document.createElement('div');
    title.className = 'cloud-document-title';
    title.textContent = localDocument.title || 'SmartPages document';
    const meta = document.createElement('div');
    meta.className = 'cloud-document-meta';
    meta.textContent = `${localDocument.format} · ${new Date(localDocument.updatedAt).toLocaleString()}`;
    const actions = document.createElement('div');
    actions.className = 'cloud-document-actions';
    const openButton = document.createElement('button');
    openButton.type = 'button';
    openButton.className = 'btn btn-small btn-primary';
    openButton.textContent = this.language === 'en-US' ? 'Open' : '打开';
    openButton.addEventListener('click', () => this.openLocalDocument(localDocument.fileName));
    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'btn btn-small btn-secondary';
    deleteButton.textContent = this.language === 'en-US' ? 'Delete' : '删除';
    deleteButton.addEventListener('click', () => this.deleteLocalDocument(localDocument.fileName));
    actions.append(openButton, deleteButton);
    item.append(title, meta, actions);
    return item;
  }

  _pushCurrentDocumentForNavigation() {
    const content = document.getElementById('markdown-editor')?.value || '';
    if (!content.trim()) return;
    this.documentNavigationStack.push({
      content,
      format: this._getOutputFormat(),
      localDocumentState: { ...this.localDocumentState },
      cloudDocumentState: { ...this.cloudDocumentState }
    });
    if (this.documentNavigationStack.length > 20) this.documentNavigationStack.shift();
    this._updateDocumentBackButton();
  }

  _updateDocumentBackButton() {
    document.getElementById('btn-document-back')?.classList.toggle('hidden', !this.documentNavigationStack.length);
  }

  async returnToPreviousDocument() {
    const previous = this.documentNavigationStack.pop();
    if (!previous) return;
    this.config = { ...(this.config || {}), outputFormat: previous.format || 'markdown' };
    this.showEditor();
    this._setEditorContent(previous.content || '');
    this.localDocumentState = { fileName: null, dirty: true, ...(previous.localDocumentState || {}) };
    this.cloudDocumentState = { id: null, revision: 0, dirty: true, ...(previous.cloudDocumentState || {}) };
    this._setLocalSaveStatus(
      this.localDocumentState.fileName && !this.localDocumentState.dirty
        ? (this.language === 'en-US' ? 'Saved locally' : '已保存本地')
        : (this.language === 'en-US' ? 'Not saved locally' : '未保存本地'),
      this.localDocumentState.fileName && !this.localDocumentState.dirty ? 'saved' : ''
    );
    this._setCloudSaveStatus(
      this.cloudDocumentState.id && !this.cloudDocumentState.dirty
        ? (this.language === 'en-US' ? 'Saved' : '已保存')
        : (this.language === 'en-US' ? 'Unsaved' : '未保存'),
      this.cloudDocumentState.id && !this.cloudDocumentState.dirty ? 'saved' : ''
    );
    await this._saveLocalDraft();
    this.closeLocalDocumentsDialog();
    this.closeCloudDocumentsDialog();
    this._updateDocumentBackButton();
  }

  async openLocalDocument(fileName) {
    this._setLocalDialogStatus(this.language === 'en-US' ? 'Opening document...' : '正在打开文档...');
    try {
      const localDocument = await this.localDocuments.getDocument(fileName);
      this._pushCurrentDocumentForNavigation();
      this.config = { ...(this.config || {}), outputFormat: localDocument.format };
      this.cloudDocumentState = { id: null, revision: 0, dirty: true };
      this.showEditor();
      this._setEditorContent(localDocument.content || '');
      this.localDocumentState = { fileName: localDocument.fileName, dirty: false };
      await this._saveLocalDraft();
      this._setLocalSaveStatus(this.language === 'en-US' ? 'Saved locally' : '已保存本地', 'saved');
      this.closeLocalDocumentsDialog();
    } catch (error) {
      this._setLocalDialogStatus(error.message, 'error');
    }
  }

  async deleteLocalDocument(fileName) {
    if (!confirm(this.language === 'en-US' ? 'Delete this local document?' : '确定删除这个本地文档吗？')) return;
    try {
      await this.localDocuments.deleteDocument(fileName);
      if (this.localDocumentState.fileName === fileName) this.localDocumentState = { fileName: null, dirty: true };
      await this.loadLocalDocuments();
    } catch (error) {
      this._setLocalDialogStatus(error.message, 'error');
    }
  }

  _markCloudDocumentDirty() {
    this.cloudDocumentState.dirty = true;
    this._setCloudSaveStatus(this.language === 'en-US' ? 'Unsaved' : '未保存', '');
  }

  _setCloudSaveStatus(message, type = '') {
    const status = document.getElementById('cloud-save-status');
    if (!status) return;
    status.textContent = message;
    status.className = `cloud-save-status${type ? ` ${type}` : ''}`;
  }

  _setCloudDialogStatus(message = '', type = '') {
    const status = document.getElementById('cloud-dialog-status');
    if (!status) return;
    status.textContent = message;
    status.className = `cloud-dialog-status${type ? ` ${type}` : ''}${message ? '' : ' hidden'}`;
  }

  async openCloudDocumentsDialog() {
    const modal = document.getElementById('cloud-documents-modal');
    modal?.classList.remove('hidden');
    this._setCloudDialogStatus();
    const configured = await this.cloudDocuments.isConfigured().catch(() => false);
    document.getElementById('cloud-config-required')?.classList.toggle('hidden', configured);
    if (!configured) {
      document.getElementById('cloud-auth-form')?.classList.add('hidden');
      document.getElementById('cloud-library')?.classList.add('hidden');
      return;
    }
    try {
      const session = await this.cloudDocuments.getSession();
      this._showCloudSession(session);
      if (session) await this.loadCloudDocuments();
    } catch (error) {
      this._showCloudSession(null);
      this._setCloudDialogStatus(error.message, 'error');
    }
  }

  closeCloudDocumentsDialog() {
    document.getElementById('cloud-documents-modal')?.classList.add('hidden');
  }

  _showCloudSession(session) {
    const signedIn = Boolean(session?.accessToken);
    document.getElementById('cloud-auth-form')?.classList.toggle('hidden', signedIn);
    document.getElementById('cloud-library')?.classList.toggle('hidden', !signedIn);
    const email = document.getElementById('cloud-user-email');
    if (email) email.textContent = session?.user?.email || '';
  }

  _getCloudCredentials() {
    return {
      email: document.getElementById('cloud-email')?.value?.trim() || '',
      password: document.getElementById('cloud-password')?.value || ''
    };
  }

  _setCloudAuthBusy(busy) {
    this.isCloudAuthenticating = busy;
    const signIn = document.getElementById('btn-cloud-sign-in');
    const signUp = document.getElementById('btn-cloud-sign-up');
    const email = document.getElementById('cloud-email');
    const password = document.getElementById('cloud-password');
    if (signIn) signIn.disabled = busy;
    if (signUp) signUp.disabled = busy;
    if (email) email.disabled = busy;
    if (password) password.disabled = busy;
  }

  _formatCloudAuthError(error) {
    const code = error?.code && error.code !== 'REQUEST_FAILED' ? ` (${error.code})` : '';
    return `${error?.message || 'Cloud authentication failed'}${code}`;
  }

  async signInToCloud() {
    if (this.isCloudAuthenticating) return;
    const credentials = this._getCloudCredentials();
    if (!credentials.email || !credentials.password) return;
    this._setCloudAuthBusy(true);
    this._setCloudDialogStatus(this.language === 'en-US' ? 'Signing in...' : '正在登录...');
    try {
      const session = await this.cloudDocuments.signIn(credentials.email, credentials.password);
      this._showCloudSession(session);
      this._setCloudDialogStatus();
      await this.loadCloudDocuments();
    } catch (error) {
      this._setCloudDialogStatus(this._formatCloudAuthError(error), 'error');
    } finally {
      this._setCloudAuthBusy(false);
    }
  }

  async signUpForCloud() {
    if (this.isCloudAuthenticating) return;
    const credentials = this._getCloudCredentials();
    if (!credentials.email || credentials.password.length < 8) {
      this._setCloudDialogStatus(this.language === 'en-US' ? 'Enter an email and a password of at least 8 characters.' : '请输入邮箱和至少 8 位密码。', 'error');
      return;
    }
    this._setCloudAuthBusy(true);
    this._setCloudDialogStatus(this.language === 'en-US' ? 'Creating account...' : '正在创建账号...');
    try {
      const result = await this.cloudDocuments.signUp(credentials.email, credentials.password);
      if (result.pendingConfirmation) {
        this._setCloudDialogStatus(this.language === 'en-US' ? 'Check your inbox to confirm your email, then sign in.' : '请查收确认邮件，完成验证后再登录。', 'success');
        return;
      }
      this._showCloudSession(result);
      this._setCloudDialogStatus();
      await this.loadCloudDocuments();
    } catch (error) {
      this._setCloudDialogStatus(this._formatCloudAuthError(error), 'error');
    } finally {
      this._setCloudAuthBusy(false);
    }
  }

  async signOutFromCloud() {
    await this.cloudDocuments.signOut();
    this._showCloudSession(null);
    this._setCloudDialogStatus(this.language === 'en-US' ? 'Signed out.' : '已退出登录。', 'success');
  }

  async _saveGeneratedDocumentToHistory() {
    const configured = await this.cloudDocuments.isConfigured().catch(() => false);
    if (!configured) return false;
    const session = await this.cloudDocuments.getSession().catch(() => null);
    if (!session) return false;
    return this.saveCurrentDocumentToCloud({ event: 'generated', silent: true });
  }

  async saveCurrentDocumentToCloud(options = {}) {
    const event = options?.event === 'generated' ? 'generated' : 'cloud_save';
    const silent = Boolean(options?.silent);
    this._ensureEditorContentFresh();
    const content = document.getElementById('markdown-editor')?.value || '';
    if (!content.trim()) {
      this._showError(this._t('contentRequired'));
      return;
    }
    if (!await this.cloudDocuments.isConfigured().catch(() => false)) {
      if (!silent) await this.openCloudDocumentsDialog();
      return false;
    }
    const session = await this.cloudDocuments.getSession().catch(() => null);
    if (!session) {
      if (!silent) await this.openCloudDocumentsDialog();
      return false;
    }

    const button = document.getElementById('btn-cloud-save');
    if (button) button.disabled = true;
    this._setCloudSaveStatus(this.language === 'en-US' ? 'Saving...' : '保存中...', 'saving');
    try {
      const saved = await this.cloudDocuments.saveDocument({
        id: this.cloudDocumentState.id,
        revision: this.cloudDocumentState.revision,
        title: this._extractDocumentTitle(content),
        format: this._getOutputFormat(),
        content,
        event
      });
      this._setEditorContent(saved.content || content, { preserveImageHistory: true });
      this.cloudDocumentState = { id: saved.id, revision: saved.revision, dirty: false };
      await this._saveLocalDraft();
      this._setCloudSaveStatus(this.language === 'en-US' ? 'Saved' : '已保存', 'saved');
      if (!silent) this._showNotification(this.language === 'en-US' ? 'Saved as a new cloud version.' : '已保存为新的云端版本。', 'success');
      return true;
    } catch (error) {
      this._setCloudSaveStatus(this.language === 'en-US' ? 'Save failed' : '保存失败', 'error');
      if (!silent) this._showError(error.message);
      else console.warn('[SmartPages:History] Failed to save generated document:', error);
      return false;
    } finally {
      if (button) button.disabled = false;
    }
  }

  async loadCloudDocuments() {
    const list = document.getElementById('cloud-documents-list');
    if (!list) return;
    list.textContent = this.language === 'en-US' ? 'Loading...' : '正在加载...';
    try {
      const search = document.getElementById('cloud-history-search')?.value || '';
      const documents = await this.cloudDocuments.listDocuments(search);
      list.textContent = '';
      if (!documents.length) {
        list.textContent = this.language === 'en-US' ? 'No generated documents found.' : '没有找到生成文档。';
        return;
      }
      documents.forEach(cloudDocument => list.appendChild(this._createCloudDocumentItem(cloudDocument)));
    } catch (error) {
      list.textContent = '';
      this._setCloudDialogStatus(error.message, 'error');
    }
  }

  _createCloudDocumentItem(cloudDocument) {
    const item = document.createElement('div');
    item.className = 'cloud-document-item';
    const title = document.createElement('div');
    title.className = 'cloud-document-title';
    title.textContent = cloudDocument.title || 'SmartPages document';
    const meta = document.createElement('div');
    meta.className = 'cloud-document-meta';
    meta.textContent = `${cloudDocument.format || 'markdown'} · v${cloudDocument.revision || 1} · ${new Date(cloudDocument.updated_at).toLocaleString()}`;
    const actions = document.createElement('div');
    actions.className = 'cloud-document-actions';
    const openButton = document.createElement('button');
    openButton.type = 'button';
    openButton.className = 'btn btn-small btn-primary';
    openButton.textContent = this.language === 'en-US' ? 'Open' : '打开';
    openButton.addEventListener('click', () => this.openCloudDocument(cloudDocument.id));
    const versionsButton = document.createElement('button');
    versionsButton.type = 'button';
    versionsButton.className = 'btn btn-small btn-secondary';
    versionsButton.textContent = this.language === 'en-US' ? 'Versions' : '版本';
    const versions = document.createElement('div');
    versions.className = 'cloud-document-versions hidden';
    versionsButton.addEventListener('click', () => this.toggleCloudDocumentVersions(cloudDocument.id, versions, versionsButton));
    const saveVersionButton = document.createElement('button');
    saveVersionButton.type = 'button';
    saveVersionButton.className = 'btn btn-small btn-secondary';
    saveVersionButton.textContent = this.language === 'en-US' ? 'Save new version' : '另存为新版本';
    saveVersionButton.addEventListener('click', () => this.saveCloudVersionAsNew(cloudDocument.id));
    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'btn btn-small btn-secondary';
    deleteButton.textContent = this.language === 'en-US' ? 'Delete' : '删除';
    deleteButton.addEventListener('click', () => this.deleteCloudDocument(cloudDocument.id));
    actions.append(openButton, versionsButton, saveVersionButton, deleteButton);
    item.append(title, meta, actions, versions);
    return item;
  }

  async toggleCloudDocumentVersions(documentId, container, button) {
    if (!container.classList.contains('hidden')) {
      container.classList.add('hidden');
      return;
    }
    container.classList.remove('hidden');
    if (container.dataset.loaded === 'true') return;
    container.textContent = this.language === 'en-US' ? 'Loading versions...' : '正在加载版本...';
    if (button) button.disabled = true;
    try {
      const versions = await this.cloudDocuments.listDocumentVersions(documentId);
      container.textContent = '';
      versions.forEach(version => container.appendChild(this._createCloudVersionItem(version)));
      if (!versions.length) container.textContent = this.language === 'en-US' ? 'No version snapshots.' : '暂无版本快照。';
      container.dataset.loaded = 'true';
    } catch (error) {
      container.textContent = error.message;
    } finally {
      if (button) button.disabled = false;
    }
  }

  _createCloudVersionItem(version) {
    const item = document.createElement('div');
    item.className = 'cloud-version-item';
    const meta = document.createElement('div');
    const eventLabel = version.event === 'generated'
      ? (this.language === 'en-US' ? 'Generated' : '生成')
      : (this.language === 'en-US' ? 'Cloud save' : '云端保存');
    meta.className = 'cloud-document-meta';
    meta.textContent = `v${version.revision} · ${eventLabel} · ${new Date(version.created_at).toLocaleString()}`;
    const actions = document.createElement('div');
    actions.className = 'cloud-document-actions';
    const openButton = document.createElement('button');
    openButton.type = 'button';
    openButton.className = 'btn btn-small btn-secondary';
    openButton.textContent = this.language === 'en-US' ? 'Open' : '打开';
    openButton.addEventListener('click', () => this.openCloudDocumentVersion(version.id));
    const saveButton = document.createElement('button');
    saveButton.type = 'button';
    saveButton.className = 'btn btn-small btn-secondary';
    saveButton.textContent = this.language === 'en-US' ? 'Save as new' : '另存新版';
    saveButton.addEventListener('click', () => this.saveCloudVersionAsNew(version.document_id, version.id));
    actions.append(openButton, saveButton);
    item.append(meta, actions);
    return item;
  }

  async openCloudDocument(id) {
    this._setCloudDialogStatus(this.language === 'en-US' ? 'Opening document...' : '正在打开文档...');
    try {
      const cloudDocument = await this.cloudDocuments.getDocument(id);
      this._pushCurrentDocumentForNavigation();
      this.config = { ...(this.config || {}), outputFormat: cloudDocument.format || 'markdown' };
      this.localDocumentState = { fileName: null, dirty: true };
      this.showEditor();
      this._setEditorContent(cloudDocument.content || '');
      this.cloudDocumentState = { id: cloudDocument.id, revision: cloudDocument.revision, dirty: false };
      await this._saveLocalDraft();
      this._setCloudSaveStatus(this.language === 'en-US' ? 'Saved' : '已保存', 'saved');
      this.closeCloudDocumentsDialog();
    } catch (error) {
      this._setCloudDialogStatus(error.message, 'error');
    }
  }

  async openCloudDocumentVersion(versionId) {
    this._setCloudDialogStatus(this.language === 'en-US' ? 'Opening version...' : '正在打开版本...');
    try {
      const version = await this.cloudDocuments.getDocumentVersion(versionId);
      const current = await this.cloudDocuments.getDocument(version.document_id);
      this._pushCurrentDocumentForNavigation();
      this.config = { ...(this.config || {}), outputFormat: version.format || 'markdown' };
      this.localDocumentState = { fileName: null, dirty: true };
      this.showEditor();
      this._setEditorContent(version.content || '');
      this.cloudDocumentState = { id: current.id, revision: current.revision, dirty: true };
      await this._saveLocalDraft();
      this._setCloudSaveStatus(this.language === 'en-US' ? `Opened v${version.revision}; save to create a new version` : `已打开 v${version.revision}，保存后将创建新版本`);
      this.closeCloudDocumentsDialog();
    } catch (error) {
      this._setCloudDialogStatus(error.message, 'error');
    }
  }

  async saveCloudVersionAsNew(documentId, versionId = null) {
    this._setCloudDialogStatus(this.language === 'en-US' ? 'Creating a new version...' : '正在创建新版本...');
    try {
      const saved = await this.cloudDocuments.saveVersionAsNew(documentId, versionId);
      if (this.cloudDocumentState.id === saved.id) {
        this.cloudDocumentState.revision = saved.revision;
        this.cloudDocumentState.dirty = false;
        this._setCloudSaveStatus(this.language === 'en-US' ? 'Saved' : '已保存', 'saved');
      }
      this._setCloudDialogStatus(this.language === 'en-US' ? `Created v${saved.revision}.` : `已创建 v${saved.revision}。`, 'success');
      await this.loadCloudDocuments();
    } catch (error) {
      this._setCloudDialogStatus(error.message, 'error');
    }
  }

  async deleteCloudDocument(id) {
    if (!confirm(this.language === 'en-US'
      ? 'Delete this generated document and all of its versions?'
      : '确定删除这份生成文档及其全部版本吗？')) return;
    this._setCloudDialogStatus(this.language === 'en-US' ? 'Deleting...' : '正在删除...');
    try {
      await this.cloudDocuments.deleteDocument(id);
      if (this.cloudDocumentState.id === id) {
        this.cloudDocumentState = { id: null, revision: 0, dirty: true };
        this._setCloudSaveStatus(this.language === 'en-US' ? 'Unsaved' : '未保存');
        await this._saveLocalDraft();
      }
      this._setCloudDialogStatus(this.language === 'en-US' ? 'Deleted.' : '已删除。', 'success');
      await this.loadCloudDocuments();
    } catch (error) {
      this._setCloudDialogStatus(error.message, 'error');
    }
  }
});
