/**
 * SmartPages cloud document support.
 *
 * The UI talks to this provider-neutral facade instead of depending on a
 * vendor SDK. Supabase is the first provider and uses its public REST APIs.
 */
(function initCloudDocumentApi(globalScope) {
  'use strict';

  const CLOUD_CONFIG_KEY = 'cloudStorageConfig';
  const CLOUD_PROVIDER_CONFIGS_KEY = 'cloudStorageProviderConfigs';
  const CLOUD_SESSION_KEY = 'cloudStorageSession';
  const LOCAL_DRAFT_KEY = 'generatedDocumentDraft';
  const LOCAL_DIRECTORY_DB = 'smartpages-local-documents';
  const LOCAL_DIRECTORY_STORE = 'settings';
  const LOCAL_DIRECTORY_HANDLE_KEY = 'directoryHandle';
  const DEFAULT_BUCKET = 'smartpages-assets';

  class CloudDocumentError extends Error {
    constructor(message, code = 'CLOUD_ERROR', status = 0) {
      super(message);
      this.name = 'CloudDocumentError';
      this.code = code;
      this.status = status;
    }
  }

  class ChromeLocalStore {
    async get(key) {
      const result = await new Promise((resolve, reject) => {
        chrome.storage.local.get([key], value => {
          if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
          else resolve(value || {});
        });
      });
      return result[key];
    }

    async set(key, value) {
      await new Promise((resolve, reject) => {
        chrome.storage.local.set({ [key]: value }, () => {
          if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
          else resolve();
        });
      });
    }

    async remove(key) {
      await new Promise((resolve, reject) => {
        chrome.storage.local.remove(key, () => {
          if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
          else resolve();
        });
      });
    }
  }

  class LocalDocumentDraftStore {
    constructor(options = {}) {
      this.storage = options.storage || new ChromeLocalStore();
      this.key = options.key || LOCAL_DRAFT_KEY;
      this.now = options.now || (() => Date.now());
    }

    async save(draft) {
      const value = {
        id: draft?.id || null,
        revision: Number(draft?.revision) || 0,
        title: String(draft?.title || ''),
        format: ['markdown', 'html', 'text'].includes(draft?.format) ? draft.format : 'markdown',
        content: String(draft?.content || ''),
        updatedAt: this.now()
      };
      await this.storage.set(this.key, value);
      return value;
    }

    async load() {
      const value = await this.storage.get(this.key);
      return value && typeof value.content === 'string' ? value : null;
    }

    async clear() {
      await this.storage.remove(this.key);
    }
  }

  class LocalDirectoryDocumentStore {
    constructor(options = {}) {
      this.globalScope = options.globalScope || globalScope;
      this.indexedDB = options.indexedDB || this.globalScope.indexedDB;
      this.randomUUID = options.randomUUID || (() => this.globalScope.crypto.randomUUID());
      this.directoryHandle = null;
    }

    isSupported() {
      return typeof this.globalScope.showDirectoryPicker === 'function' && Boolean(this.indexedDB);
    }

    async chooseDirectory() {
      if (!this.isSupported()) throw new CloudDocumentError('This browser does not support local folder access', 'LOCAL_FOLDER_UNSUPPORTED');
      const handle = await this.globalScope.showDirectoryPicker({ id: 'smartpages-documents', mode: 'readwrite' });
      this.directoryHandle = handle;
      await this._saveHandle(handle);
      return handle;
    }

    async getDirectoryName() {
      const handle = await this._getDirectory(false);
      return handle?.name || '';
    }

    async hasPermission() {
      const handle = await this._loadHandle();
      if (!handle) return false;
      return (await handle.queryPermission({ mode: 'readwrite' })) === 'granted';
    }

    async requestPermission() {
      const handle = await this._loadHandle();
      if (!handle) return false;
      if ((await handle.queryPermission({ mode: 'readwrite' })) === 'granted') return true;
      return (await handle.requestPermission({ mode: 'readwrite' })) === 'granted';
    }

    async saveDocument(input = {}) {
      const directory = await this._getDirectory(true);
      const format = ['markdown', 'html', 'text'].includes(input.format) ? input.format : 'markdown';
      const extension = { markdown: 'md', html: 'html', text: 'txt' }[format];
      const fileName = input.fileName || `${this._safeFileName(input.title || 'SmartPages document')}--${this.randomUUID()}.${extension}`;
      const fileHandle = await directory.getFileHandle(fileName, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(String(input.content || ''));
      await writable.close();
      const file = await fileHandle.getFile();
      return this._fileInfo(fileName, file);
    }

    async listDocuments() {
      const directory = await this._getDirectory(true);
      const documents = [];
      for await (const [fileName, handle] of directory.entries()) {
        if (handle.kind !== 'file' || !/--[0-9a-f-]+\.(md|html|txt)$/i.test(fileName)) continue;
        const file = await handle.getFile();
        documents.push(this._fileInfo(fileName, file));
      }
      return documents.sort((a, b) => b.updatedAt - a.updatedAt);
    }

    async getDocument(fileName) {
      const directory = await this._getDirectory(true);
      const handle = await directory.getFileHandle(String(fileName || ''));
      const file = await handle.getFile();
      return { ...this._fileInfo(fileName, file), content: await file.text() };
    }

    async deleteDocument(fileName) {
      const directory = await this._getDirectory(true);
      await directory.removeEntry(String(fileName || ''));
      return true;
    }

    _fileInfo(fileName, file) {
      const extension = String(fileName).split('.').pop().toLowerCase();
      const format = extension === 'html' ? 'html' : extension === 'txt' ? 'text' : 'markdown';
      const title = String(fileName).replace(/--[0-9a-f-]+\.(md|html|txt)$/i, '');
      return { fileName, title, format, size: file.size, updatedAt: file.lastModified };
    }

    _safeFileName(value) {
      const invalidCharacters = '<>:"/\\|?*';
      const safe = Array.from(String(value || ''), character => (
        character.charCodeAt(0) <= 31 || invalidCharacters.includes(character) ? '-' : character
      )).join('').replace(/[. ]+$/g, '').trim();
      return (safe || 'SmartPages document').slice(0, 80);
    }

    async _getDirectory(requirePermission) {
      const handle = await this._loadHandle();
      if (!handle) throw new CloudDocumentError('Choose a local document folder first', 'LOCAL_FOLDER_REQUIRED');
      const permission = await handle.queryPermission({ mode: 'readwrite' });
      if (permission !== 'granted') {
        if (!requirePermission) return null;
        throw new CloudDocumentError('Open Local History and grant folder access again', 'LOCAL_FOLDER_PERMISSION_REQUIRED');
      }
      return handle;
    }

    async _loadHandle() {
      if (this.directoryHandle) return this.directoryHandle;
      if (!this.indexedDB) return null;
      this.directoryHandle = await new Promise((resolve, reject) => {
        const request = this.indexedDB.open(LOCAL_DIRECTORY_DB, 1);
        request.onupgradeneeded = () => request.result.createObjectStore(LOCAL_DIRECTORY_STORE);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const get = db.transaction(LOCAL_DIRECTORY_STORE).objectStore(LOCAL_DIRECTORY_STORE).get(LOCAL_DIRECTORY_HANDLE_KEY);
          get.onerror = () => { db.close(); reject(get.error); };
          get.onsuccess = () => { db.close(); resolve(get.result || null); };
        };
      });
      return this.directoryHandle;
    }

    async _saveHandle(handle) {
      await new Promise((resolve, reject) => {
        const request = this.indexedDB.open(LOCAL_DIRECTORY_DB, 1);
        request.onupgradeneeded = () => request.result.createObjectStore(LOCAL_DIRECTORY_STORE);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction(LOCAL_DIRECTORY_STORE, 'readwrite');
          transaction.objectStore(LOCAL_DIRECTORY_STORE).put(handle, LOCAL_DIRECTORY_HANDLE_KEY);
          transaction.onerror = () => reject(transaction.error);
          transaction.oncomplete = () => { db.close(); resolve(); };
        };
      });
    }
  }

  class SupabaseCloudDocumentProvider {
    constructor(options = {}) {
      this.storage = options.storage || new ChromeLocalStore();
      this.fetch = options.fetch || globalScope.fetch?.bind(globalScope);
      this.now = options.now || (() => Date.now());
      this.randomUUID = options.randomUUID || (() => globalScope.crypto.randomUUID());
      this.imageCompressor = options.imageCompressor || (dataUrl => this._compressImageDataUrl(dataUrl));
      this.assetUrlMap = new Map();
      if (!this.fetch) throw new CloudDocumentError('Fetch API is unavailable', 'FETCH_UNAVAILABLE');
    }

    async getConfig() {
      const value = await this.storage.get(CLOUD_CONFIG_KEY);
      return SupabaseCloudDocumentProvider.normalizeConfig(value || {});
    }

    async saveConfig(config) {
      const value = SupabaseCloudDocumentProvider.normalizeConfig(config);
      if (!value.url || !value.anonKey) {
        throw new CloudDocumentError('Supabase URL and anon key are required', 'CONFIG_REQUIRED');
      }
      await this.storage.set(CLOUD_CONFIG_KEY, value);
      return value;
    }

    async isConfigured() {
      const config = await this.getConfig();
      return Boolean(config.url && config.anonKey);
    }

    static normalizeConfig(config) {
      let url = String(config?.url || '').trim();
      try {
        if (url) {
          const parsed = new URL(url);
          if (parsed.protocol !== 'https:') throw new Error('HTTPS is required');
          // The dashboard may expose a Data API URL ending in /rest/v1.
          // SmartPages needs the project origin because it also calls Auth and Storage.
          url = parsed.origin;
        }
      } catch (_error) {
        url = '';
      }
      return {
        provider: 'supabase',
        url,
        anonKey: String(config?.anonKey || '').trim(),
        bucket: String(config?.bucket || DEFAULT_BUCKET).trim() || DEFAULT_BUCKET
      };
    }

    async signUp(email, password) {
      return this._authenticate('/auth/v1/signup', { email, password });
    }

    async signIn(email, password) {
      return this._authenticate('/auth/v1/token?grant_type=password', { email, password });
    }

    async _authenticate(path, body) {
      const config = await this._requireConfig();
      const response = await this.fetch(`${config.url}${path}`, {
        method: 'POST',
        headers: this._headers(config),
        body: JSON.stringify(body)
      });
      const data = await this._readResponse(response);
      const session = this._normalizeSession(data);
      if (!session.accessToken) {
        if (data?.user && !data?.session) {
          return { pendingConfirmation: true, user: data.user };
        }
        throw new CloudDocumentError('Authentication did not return a session', 'AUTH_SESSION_MISSING');
      }
      await this.storage.set(CLOUD_SESSION_KEY, session);
      return session;
    }

    async signOut() {
      const config = await this.getConfig();
      const session = await this.storage.get(CLOUD_SESSION_KEY);
      if (config.url && config.anonKey && session?.accessToken) {
        await this.fetch(`${config.url}/auth/v1/logout`, {
          method: 'POST',
          headers: this._headers(config, session.accessToken)
        }).catch(() => null);
      }
      await this.storage.remove(CLOUD_SESSION_KEY);
    }

    async getSession() {
      const session = await this.storage.get(CLOUD_SESSION_KEY);
      if (!session?.accessToken) return null;
      if (Number(session.expiresAt) > Math.floor(this.now() / 1000) + 60) return session;
      if (!session.refreshToken) {
        await this.storage.remove(CLOUD_SESSION_KEY);
        return null;
      }
      return this._refreshSession(session.refreshToken);
    }

    async _refreshSession(refreshToken) {
      const config = await this._requireConfig();
      const response = await this.fetch(`${config.url}/auth/v1/token?grant_type=refresh_token`, {
        method: 'POST',
        headers: this._headers(config),
        body: JSON.stringify({ refresh_token: refreshToken })
      });
      if (!response.ok) {
        await this.storage.remove(CLOUD_SESSION_KEY);
        throw new CloudDocumentError('Cloud session expired. Please sign in again.', 'AUTH_EXPIRED', response.status);
      }
      const session = this._normalizeSession(await response.json());
      await this.storage.set(CLOUD_SESSION_KEY, session);
      return session;
    }

    async listDocuments(search = '') {
      const context = await this._authorizedContext();
      const query = String(search || '').trim();
      const searchFilter = query ? `&title=ilike.*${encodeURIComponent(query.replace(/[,*()]/g, ''))}*` : '';
      const response = await this.fetch(
        `${context.config.url}/rest/v1/cloud_documents?document_type=eq.generated&select=id,title,format,revision,created_at,updated_at&order=updated_at.desc${searchFilter}`,
        { headers: this._headers(context.config, context.session.accessToken) }
      );
      return this._readResponse(response);
    }

    async getDocument(id) {
      const context = await this._authorizedContext();
      const safeId = encodeURIComponent(String(id || ''));
      const response = await this.fetch(
        `${context.config.url}/rest/v1/cloud_documents?id=eq.${safeId}&document_type=eq.generated&select=*`,
        { headers: this._headers(context.config, context.session.accessToken) }
      );
      const rows = await this._readResponse(response);
      if (!rows?.length) throw new CloudDocumentError('Cloud document was not found', 'NOT_FOUND', 404);
      const document = rows[0];
      document.content = await this._hydrateAssets(document.content, context);
      return document;
    }

    async refreshAssetUrls(content) {
      const context = await this._authorizedContext();
      return this._hydrateAssets(this._dehydrateKnownAssets(content), context);
    }

    dehydrateAssets(content) {
      return this._dehydrateKnownAssets(content);
    }

    async listDocumentVersions(documentId) {
      const context = await this._authorizedContext();
      const safeId = encodeURIComponent(String(documentId || ''));
      const response = await this.fetch(
        `${context.config.url}/rest/v1/cloud_document_versions?document_id=eq.${safeId}&select=id,document_id,title,format,revision,event,created_at&order=revision.desc`,
        { headers: this._headers(context.config, context.session.accessToken) }
      );
      return this._readResponse(response);
    }

    async getDocumentVersion(versionId) {
      const context = await this._authorizedContext();
      const safeId = encodeURIComponent(String(versionId || ''));
      const response = await this.fetch(
        `${context.config.url}/rest/v1/cloud_document_versions?id=eq.${safeId}&select=*`,
        { headers: this._headers(context.config, context.session.accessToken) }
      );
      const rows = await this._readResponse(response);
      if (!rows?.length) throw new CloudDocumentError('Cloud document version was not found', 'NOT_FOUND', 404);
      const version = rows[0];
      version.content = await this._hydrateAssets(version.content, context);
      return version;
    }

    async saveDocument(input) {
      const context = await this._authorizedContext();
      const documentId = input?.id || this.randomUUID();
      const uploadedPaths = [];
      let result;
      try {
        const cloudContent = await this._uploadEmbeddedAssets(
          String(input?.content || ''), documentId, context, uploadedPaths
        );
        const response = await this.fetch(`${context.config.url}/rest/v1/rpc/save_generated_document`, {
          method: 'POST',
          headers: this._headers(context.config, context.session.accessToken),
          body: JSON.stringify({
            p_id: documentId,
            p_title: String(input?.title || 'SmartPages document').slice(0, 200),
            p_format: ['markdown', 'html', 'text'].includes(input?.format) ? input.format : 'markdown',
            p_content: cloudContent,
            p_expected_revision: input?.id ? Math.max(1, Number(input.revision) || 1) : null,
            p_event: input?.event === 'generated' ? 'generated' : 'cloud_save'
          })
        });
        result = await this._readResponse(response);
      } catch (error) {
        await this._removeAssets(uploadedPaths, context).catch(cleanupError => {
          console.warn('[SmartPages:Cloud] Failed to roll back uploaded assets:', cleanupError);
        });
        if (error.code === '40001' || error.message === 'VERSION_CONFLICT') {
          throw new CloudDocumentError('This document changed in another session. Reload it before saving.', 'VERSION_CONFLICT', 409);
        }
        throw error;
      }
      const saved = Array.isArray(result) ? result[0] : result;
      if (!saved?.id) throw new CloudDocumentError('Cloud history schema is missing. Run the latest supabase/schema.sql.', 'HISTORY_SCHEMA_REQUIRED');
      try {
        saved.content = await this._hydrateAssets(saved.content, context);
      } catch (error) {
        // The database write already succeeded. A temporary signed-URL failure
        // must not make the UI retry the insert and create a duplicate document.
        saved.content = String(input?.content || '');
        saved.assetWarning = error.message;
      }
      return saved;
    }

    async saveVersionAsNew(documentId, versionId = null) {
      const source = versionId ? await this.getDocumentVersion(versionId) : await this.getDocument(documentId);
      const current = await this.getDocument(documentId || source.document_id);
      return this.saveDocument({
        id: current.id,
        revision: current.revision,
        title: source.title,
        format: source.format,
        content: source.content,
        event: 'cloud_save'
      });
    }

    async deleteDocument(id) {
      const context = await this._authorizedContext();
      const assetPaths = await this._listDocumentAssets(id, context).catch(error => {
        console.warn('[SmartPages:Cloud] Failed to list document assets before deletion:', error);
        return [];
      });
      const response = await this.fetch(
        `${context.config.url}/rest/v1/cloud_documents?id=eq.${encodeURIComponent(String(id || ''))}&document_type=eq.generated`,
        {
          method: 'DELETE',
          headers: this._headers(context.config, context.session.accessToken)
        }
      );
      await this._readResponse(response, true);
      await this._removeAssets(assetPaths, context).catch(error => {
        console.warn('[SmartPages:Cloud] Document deleted but asset cleanup failed:', error);
      });
      return true;
    }

    async _uploadEmbeddedAssets(content, documentId, context, uploadedPaths = []) {
      let result = this._dehydrateKnownAssets(content);
      const matches = [...new Set(result.match(/data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/=]+/gi) || [])];
      for (const dataUrl of matches) {
        const preparedDataUrl = await this.imageCompressor(dataUrl).catch(() => dataUrl);
        const match = preparedDataUrl.match(/^data:image\/([a-z0-9.+-]+);base64,(.+)$/i);
        if (!match) continue;
        const extension = this._safeImageExtension(match[1]);
        const assetId = this.randomUUID();
        const path = `${context.session.user.id}/${documentId}/${assetId}.${extension}`;
        const bytes = this._decodeBase64(match[2]);
        const response = await this.fetch(
          `${context.config.url}/storage/v1/object/${encodeURIComponent(context.config.bucket)}/${path.split('/').map(encodeURIComponent).join('/')}`,
          {
            method: 'POST',
            headers: {
              ...this._headers(context.config, context.session.accessToken, false),
              'Content-Type': `image/${match[1]}`,
              'x-upsert': 'false'
            },
            body: bytes
          }
        );
        await this._readResponse(response, true);
        uploadedPaths.push(path);
        result = result.split(dataUrl).join(`smartpages-asset://${path}`);
      }
      return result;
    }

    async _compressImageDataUrl(dataUrl) {
      const source = String(dataUrl || '');
      const match = source.match(/^data:image\/([a-z0-9.+-]+);base64,(.+)$/i);
      if (!match || match[1].toLowerCase() === 'gif') return source;
      const originalBytes = this._decodeBase64(match[2]);
      if (originalBytes.byteLength < 512 * 1024 || !globalScope.createImageBitmap) return source;

      const originalBlob = new Blob([originalBytes], { type: `image/${match[1]}` });
      const bitmap = await globalScope.createImageBitmap(originalBlob);
      try {
        const scale = Math.min(1, 1920 / Math.max(bitmap.width, bitmap.height));
        const width = Math.max(1, Math.round(bitmap.width * scale));
        const height = Math.max(1, Math.round(bitmap.height * scale));
        let compressedBlob;
        if (globalScope.OffscreenCanvas) {
          const canvas = new globalScope.OffscreenCanvas(width, height);
          canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height);
          compressedBlob = await canvas.convertToBlob({ type: 'image/webp', quality: 0.82 });
        } else if (globalScope.document?.createElement) {
          const canvas = globalScope.document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height);
          compressedBlob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', 0.82));
        }
        if (!compressedBlob || compressedBlob.size >= originalBlob.size * 0.9) return source;
        const compressedBytes = new Uint8Array(await compressedBlob.arrayBuffer());
        let binary = '';
        for (let index = 0; index < compressedBytes.length; index += 0x8000) {
          binary += String.fromCharCode(...compressedBytes.subarray(index, index + 0x8000));
        }
        return `data:image/webp;base64,${globalScope.btoa(binary)}`;
      } finally {
        bitmap.close?.();
      }
    }

    async _listDocumentAssets(documentId, context) {
      const prefix = `${context.session.user.id}/${String(documentId || '')}`;
      const paths = [];
      for (let offset = 0; ; offset += 1000) {
        const response = await this.fetch(
          `${context.config.url}/storage/v1/object/list/${encodeURIComponent(context.config.bucket)}`,
          {
            method: 'POST',
            headers: this._headers(context.config, context.session.accessToken),
            body: JSON.stringify({ prefix, limit: 1000, offset, sortBy: { column: 'name', order: 'asc' } })
          }
        );
        const rows = await this._readResponse(response);
        for (const row of rows || []) {
          if (!row?.name || row.id === null) continue;
          paths.push(row.name.startsWith(`${prefix}/`) ? row.name : `${prefix}/${row.name}`);
        }
        if (!rows || rows.length < 1000) break;
      }
      return paths;
    }

    async _removeAssets(paths, context) {
      const uniquePaths = [...new Set((paths || []).filter(Boolean))];
      for (let index = 0; index < uniquePaths.length; index += 1000) {
        const response = await this.fetch(
          `${context.config.url}/storage/v1/object/${encodeURIComponent(context.config.bucket)}`,
          {
            method: 'DELETE',
            headers: this._headers(context.config, context.session.accessToken),
            body: JSON.stringify({ prefixes: uniquePaths.slice(index, index + 1000) })
          }
        );
        await this._readResponse(response, true);
      }
    }

    async _hydrateAssets(content, context) {
      let result = String(content || '');
      // Asset paths are generated from UUIDs and image extensions. Keep the
      // matcher deliberately narrow so Markdown's closing `)` is not treated
      // as part of the object name.
      const markers = [...new Set(result.match(/smartpages-asset:\/\/[A-Za-z0-9._%/-]+/g) || [])];
      for (const marker of markers) {
        const path = marker.slice('smartpages-asset://'.length);
        const response = await this.fetch(
          `${context.config.url}/storage/v1/object/sign/${encodeURIComponent(context.config.bucket)}/${path.split('/').map(encodeURIComponent).join('/')}`,
          {
            method: 'POST',
            headers: this._headers(context.config, context.session.accessToken),
            body: JSON.stringify({ expiresIn: 3600 })
          }
        );
        const data = await this._readResponse(response);
        const signedPath = data?.signedURL || data?.signedUrl;
        if (!signedPath) continue;
        const signedUrl = /^https?:\/\//i.test(signedPath)
          ? signedPath
          : `${context.config.url}/storage/v1${signedPath.startsWith('/') ? '' : '/'}${signedPath}`;
        this.assetUrlMap.set(signedUrl, marker);
        result = result.split(marker).join(signedUrl);
      }
      return result;
    }

    _dehydrateKnownAssets(content) {
      let result = String(content || '');
      for (const [signedUrl, marker] of this.assetUrlMap.entries()) {
        result = result.split(signedUrl).join(marker);
      }
      result = result.replace(
        /https:\/\/[^\s"'()]+\/storage\/v1\/object\/sign\/[^/\s"'()]+\/([^\s"'()?]+)(?:\?[^\s"'()]*)?/gi,
        (_match, encodedPath) => {
          try {
            return `smartpages-asset://${decodeURIComponent(encodedPath)}`;
          } catch (_error) {
            return `smartpages-asset://${encodedPath}`;
          }
        }
      );
      return result;
    }

    _decodeBase64(value) {
      const binary = globalScope.atob(value);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
      return bytes;
    }

    _safeImageExtension(value) {
      const extension = String(value || '').toLowerCase().replace('jpeg', 'jpg');
      return ['png', 'jpg', 'gif', 'webp'].includes(extension) ? extension : 'png';
    }

    async _authorizedContext() {
      const config = await this._requireConfig();
      const session = await this.getSession();
      if (!session?.accessToken || !session?.user?.id) {
        throw new CloudDocumentError('Please sign in to Supabase first', 'AUTH_REQUIRED', 401);
      }
      return { config, session };
    }

    async _requireConfig() {
      const config = await this.getConfig();
      if (!config.url || !config.anonKey) {
        throw new CloudDocumentError('Configure Supabase in Settings first', 'CONFIG_REQUIRED');
      }
      return config;
    }

    _headers(config, accessToken = '', includeJson = true) {
      const headers = {
        apikey: config.anonKey
      };
      // New sb_publishable_* keys are valid in `apikey` but must not be sent as
      // Bearer tokens. Authorization is only for a signed-in user's JWT.
      if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
      if (includeJson) headers['Content-Type'] = 'application/json';
      return headers;
    }

    _normalizeSession(data) {
      const expiresIn = Number(data?.expires_in) || 3600;
      return {
        accessToken: data?.access_token || data?.session?.access_token || '',
        refreshToken: data?.refresh_token || data?.session?.refresh_token || '',
        expiresAt: Number(data?.expires_at || data?.session?.expires_at) || Math.floor(this.now() / 1000) + expiresIn,
        user: data?.user || data?.session?.user || null
      };
    }

    async _readResponse(response, allowEmpty = false) {
      if (response.ok) {
        if (allowEmpty || response.status === 204) return null;
        return response.json();
      }
      const data = await response.json().catch(() => ({}));
      const message = data?.msg || data?.message || data?.error_description || data?.error || response.statusText;
      const code = data?.code || data?.error_code || 'REQUEST_FAILED';
      throw new CloudDocumentError(String(message || 'Cloud request failed'), String(code), response.status);
    }
  }

  class CloudBaseDocumentProvider extends SupabaseCloudDocumentProvider {
    constructor(options = {}) {
      super(options);
      this.cloudbase = options.cloudbase || globalScope.cloudbase;
      this.app = null;
      this.appSignature = '';
    }

    async getConfig() {
      const value = await this.storage.get(CLOUD_CONFIG_KEY);
      return CloudBaseDocumentProvider.normalizeConfig(value || {});
    }

    async saveConfig(config) {
      const value = CloudBaseDocumentProvider.normalizeConfig(config);
      if (!value.envId || !value.accessKey) {
        throw new CloudDocumentError('CloudBase environment ID and Publishable Key are required', 'CONFIG_REQUIRED');
      }
      await this.storage.set(CLOUD_CONFIG_KEY, value);
      this.app = null;
      this.appSignature = '';
      return value;
    }

    async isConfigured() {
      const config = await this.getConfig();
      return Boolean(config.envId && config.accessKey);
    }

    static normalizeConfig(config) {
      const envId = String(config?.envId || '').trim();
      return {
        provider: 'cloudbase',
        envId: /^[a-zA-Z0-9-]+$/.test(envId) ? envId : '',
        accessKey: String(config?.accessKey || '').trim(),
        region: ['ap-shanghai', 'ap-guangzhou'].includes(config?.region) ? config.region : 'ap-shanghai',
        bucket: String(config?.bucket || DEFAULT_BUCKET).trim() || DEFAULT_BUCKET
      };
    }

    async signUp(email, password) {
      const auth = (await this._getApp()).auth();
      try {
        const request = auth.signUpWithEmailAndPassword
          ? auth.signUpWithEmailAndPassword(email, password)
          : auth.signUp({ email, password });
        await this._unwrap(request);
        return await this.getSession() || { pendingConfirmation: true, user: { email } };
      } catch (error) {
        throw this._cloudBaseError(error, 'SIGN_UP_FAILED');
      }
    }

    async signIn(email, password) {
      const auth = (await this._getApp()).auth();
      try {
        await this._unwrap(auth.signIn({ username: email, password }));
        const session = await this.getSession();
        if (!session) throw new CloudDocumentError('Authentication did not return a session', 'AUTH_SESSION_MISSING');
        return session;
      } catch (error) {
        throw this._cloudBaseError(error, 'SIGN_IN_FAILED');
      }
    }

    async signOut() {
      const auth = (await this._getApp()).auth();
      await auth.signOut().catch(() => null);
      return true;
    }

    async getSession() {
      const auth = (await this._getApp()).auth();
      try {
        const rawSession = await this._unwrap(auth.getSession());
        let user = rawSession?.user || rawSession?.session?.user || auth.currentUser || null;
        if (!user && auth.getCurrentUser) user = await auth.getCurrentUser().catch(() => null);
        const id = user?.id || user?.uid || user?.sub || '';
        if (!id) return null;
        return {
          accessToken: rawSession?.access_token || rawSession?.accessToken || rawSession?.session?.access_token || '',
          refreshToken: rawSession?.refresh_token || rawSession?.refreshToken || rawSession?.session?.refresh_token || '',
          expiresAt: rawSession?.expires_at || rawSession?.expiresAt || rawSession?.session?.expires_at || 0,
          user: { ...user, id, email: user.email || user.username || '' }
        };
      } catch (_error) {
        return null;
      }
    }

    async listDocuments(search = '') {
      const context = await this._authorizedContext();
      let query = context.app.rdb().from('cloud_documents')
        .select('id,title,format,revision,created_at,updated_at')
        .eq('document_type', 'generated')
        .order('updated_at', { ascending: false });
      const searchText = String(search || '').trim().replace(/[%_,*()]/g, '');
      if (searchText) query = query.ilike('title', `%${searchText}%`);
      return this._data(await query);
    }

    async getDocument(id) {
      const context = await this._authorizedContext();
      const rows = this._data(await context.app.rdb().from('cloud_documents')
        .select('*').eq('id', String(id || '')).eq('document_type', 'generated').limit(1));
      if (!rows?.length) throw new CloudDocumentError('Cloud document was not found', 'NOT_FOUND', 404);
      const document = rows[0];
      document.content = await this._hydrateAssets(document.content, context);
      return document;
    }

    async listDocumentVersions(documentId) {
      const context = await this._authorizedContext();
      return this._data(await context.app.rdb().from('cloud_document_versions')
        .select('id,document_id,title,format,revision,event,created_at')
        .eq('document_id', String(documentId || ''))
        .order('revision', { ascending: false }));
    }

    async getDocumentVersion(versionId) {
      const context = await this._authorizedContext();
      const rows = this._data(await context.app.rdb().from('cloud_document_versions')
        .select('*').eq('id', versionId).limit(1));
      if (!rows?.length) throw new CloudDocumentError('Cloud document version was not found', 'NOT_FOUND', 404);
      const version = rows[0];
      version.content = await this._hydrateAssets(version.content, context);
      return version;
    }

    async saveDocument(input) {
      const context = await this._authorizedContext();
      const documentId = input?.id || this.randomUUID();
      const uploadedPaths = [];
      let result;
      try {
        const cloudContent = await this._uploadEmbeddedAssets(
          String(input?.content || ''), documentId, context, uploadedPaths
        );
        result = this._data(await context.app.rdb().rpc('save_generated_document', {
          p_id: documentId,
          p_title: String(input?.title || 'SmartPages document').slice(0, 200),
          p_format: ['markdown', 'html', 'text'].includes(input?.format) ? input.format : 'markdown',
          p_content: cloudContent,
          p_expected_revision: input?.id ? Math.max(1, Number(input.revision) || 1) : null,
          p_event: input?.event === 'generated' ? 'generated' : 'cloud_save'
        }));
      } catch (error) {
        await this._removeAssets(uploadedPaths, context).catch(cleanupError => {
          console.warn('[SmartPages:CloudBase] Failed to roll back uploaded assets:', cleanupError);
        });
        if (/VERSION_CONFLICT|40001/.test(`${error.code || ''} ${error.message || ''}`)) {
          throw new CloudDocumentError('This document changed in another session. Reload it before saving.', 'VERSION_CONFLICT', 409);
        }
        throw error;
      }
      const saved = Array.isArray(result) ? result[0] : result;
      if (!saved?.id) throw new CloudDocumentError('CloudBase schema is missing. Run cloudbase/schema.sql.', 'HISTORY_SCHEMA_REQUIRED');
      try {
        saved.content = await this._hydrateAssets(saved.content, context);
      } catch (error) {
        saved.content = String(input?.content || '');
        saved.assetWarning = error.message;
      }
      return saved;
    }

    async deleteDocument(id) {
      const context = await this._authorizedContext();
      const assetPaths = await this._listDocumentAssets(id, context).catch(error => {
        console.warn('[SmartPages:CloudBase] Failed to list document assets before deletion:', error);
        return [];
      });
      this._data(await context.app.rdb().from('cloud_documents').delete()
        .eq('id', String(id || '')).eq('document_type', 'generated'));
      await this._removeAssets(assetPaths, context).catch(error => {
        console.warn('[SmartPages:CloudBase] Document deleted but asset cleanup failed:', error);
      });
      return true;
    }

    async _uploadEmbeddedAssets(content, documentId, context, uploadedPaths = []) {
      let result = this._dehydrateKnownAssets(content);
      const matches = [...new Set(result.match(/data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/=]+/gi) || [])];
      const bucket = context.app.storage.from(context.config.bucket);
      for (const dataUrl of matches) {
        const preparedDataUrl = await this.imageCompressor(dataUrl).catch(() => dataUrl);
        const match = preparedDataUrl.match(/^data:image\/([a-z0-9.+-]+);base64,(.+)$/i);
        if (!match) continue;
        const extension = this._safeImageExtension(match[1]);
        const path = `${context.session.user.id}/${documentId}/${this.randomUUID()}.${extension}`;
        const upload = await bucket.upload(path, this._decodeBase64(match[2]), {
          contentType: `image/${match[1]}`,
          upsert: false
        });
        this._data(upload);
        uploadedPaths.push(path);
        result = result.split(dataUrl).join(`smartpages-asset://${path}`);
      }
      return result;
    }

    async _listDocumentAssets(documentId, context) {
      const prefix = `${context.session.user.id}/${String(documentId || '')}`;
      const bucket = context.app.storage.from(context.config.bucket);
      const paths = [];
      let cursor;
      do {
        const page = this._data(await bucket.list(prefix, {
          limit: 500,
          cursor,
          withDelimiter: false,
          sortBy: { column: 'name', order: 'asc' }
        }));
        for (const item of page?.objects || []) {
          const name = item?.name || item?.path;
          if (!name) continue;
          paths.push(name.startsWith(`${prefix}/`) ? name : `${prefix}/${name}`);
        }
        cursor = page?.hasNext ? page.nextCursor : null;
      } while (cursor);
      return paths;
    }

    async _removeAssets(paths, context) {
      const uniquePaths = [...new Set((paths || []).filter(Boolean))];
      if (!uniquePaths.length) return;
      const bucket = context.app.storage.from(context.config.bucket);
      for (let index = 0; index < uniquePaths.length; index += 100) {
        this._data(await bucket.remove(uniquePaths.slice(index, index + 100)));
      }
    }

    async _hydrateAssets(content, context) {
      let result = String(content || '');
      const markers = [...new Set(result.match(/smartpages-asset:\/\/[A-Za-z0-9._%/-]+/g) || [])];
      const bucket = context.app.storage.from(context.config.bucket);
      for (const marker of markers) {
        const path = marker.slice('smartpages-asset://'.length);
        const signed = this._data(await bucket.createSignedUrl(path, 3600));
        const signedUrl = signed?.fullSignedURL || signed?.signedURL || signed?.signedUrl;
        if (!signedUrl) continue;
        this.assetUrlMap.set(signedUrl, marker);
        result = result.split(marker).join(signedUrl);
      }
      return result;
    }

    async _authorizedContext() {
      const config = await this._requireConfig();
      const app = await this._getApp(config);
      const session = await this.getSession();
      if (!session?.user?.id) throw new CloudDocumentError('Please sign in to CloudBase first', 'AUTH_REQUIRED', 401);
      return { config, app, session };
    }

    async _requireConfig() {
      const config = await this.getConfig();
      if (!config.envId || !config.accessKey) {
        throw new CloudDocumentError('Configure Tencent CloudBase in Settings first', 'CONFIG_REQUIRED');
      }
      return config;
    }

    async _getApp(existingConfig = null) {
      const config = existingConfig || await this._requireConfig();
      this.cloudbase = this.cloudbase || globalScope.cloudbase;
      if (!this.cloudbase?.init) throw new CloudDocumentError('CloudBase SDK is unavailable. Rebuild the extension.', 'SDK_UNAVAILABLE');
      const signature = `${config.envId}|${config.region}|${config.accessKey}`;
      if (!this.app || this.appSignature !== signature) {
        this.app = this.cloudbase.init({
          env: config.envId,
          region: config.region,
          accessKey: config.accessKey,
          persistence: 'local'
        });
        this.appSignature = signature;
      }
      return this.app;
    }

    _data(result) {
      if (result?.error) throw this._cloudBaseError(result.error);
      return result && Object.prototype.hasOwnProperty.call(result, 'data') ? result.data : result;
    }

    async _unwrap(promise) {
      return this._data(await promise);
    }

    _cloudBaseError(error, fallbackCode = 'REQUEST_FAILED') {
      if (error instanceof CloudDocumentError) return error;
      const message = error?.message || error?.error_description || String(error || 'CloudBase request failed');
      return new CloudDocumentError(message, error?.code || fallbackCode, error?.status || 0);
    }
  }

  class CloudDocumentProvider {
    constructor(options = {}) {
      this.storage = options.storage || new ChromeLocalStore();
      const shared = { ...options, storage: this.storage };
      this.providers = {
        supabase: new SupabaseCloudDocumentProvider(shared),
        cloudbase: new CloudBaseDocumentProvider(shared)
      };
    }

    async _current() {
      const config = await this.storage.get(CLOUD_CONFIG_KEY) || {};
      return config.provider === 'cloudbase' ? this.providers.cloudbase : this.providers.supabase;
    }

    async getConfig() { return (await this._current()).getConfig(); }
    async getConfigForProvider(providerName) {
      const name = providerName === 'cloudbase' ? 'cloudbase' : 'supabase';
      const profiles = await this.storage.get(CLOUD_PROVIDER_CONFIGS_KEY) || {};
      if (profiles[name]) {
        return name === 'cloudbase'
          ? CloudBaseDocumentProvider.normalizeConfig(profiles[name])
          : SupabaseCloudDocumentProvider.normalizeConfig(profiles[name]);
      }
      const active = await this.storage.get(CLOUD_CONFIG_KEY) || {};
      if ((active.provider || 'supabase') === name) {
        return name === 'cloudbase'
          ? CloudBaseDocumentProvider.normalizeConfig(active)
          : SupabaseCloudDocumentProvider.normalizeConfig(active);
      }
      return name === 'cloudbase'
        ? CloudBaseDocumentProvider.normalizeConfig({})
        : SupabaseCloudDocumentProvider.normalizeConfig({});
    }
    async saveConfig(config) {
      const name = config?.provider === 'cloudbase' ? 'cloudbase' : 'supabase';
      const profiles = await this.storage.get(CLOUD_PROVIDER_CONFIGS_KEY) || {};
      const active = await this.storage.get(CLOUD_CONFIG_KEY) || {};
      const activeName = active.provider === 'cloudbase' ? 'cloudbase' : 'supabase';
      if (!profiles[activeName]) profiles[activeName] = active;
      const saved = await this.providers[name].saveConfig(config);
      profiles[name] = saved;
      await this.storage.set(CLOUD_PROVIDER_CONFIGS_KEY, profiles);
      return saved;
    }
  }

  for (const method of [
    'isConfigured', 'signUp', 'signIn', 'signOut', 'getSession', 'listDocuments',
    'getDocument', 'refreshAssetUrls', 'dehydrateAssets', 'listDocumentVersions', 'getDocumentVersion',
    'saveDocument', 'saveVersionAsNew', 'deleteDocument'
  ]) {
    CloudDocumentProvider.prototype[method] = async function delegateCloudDocumentMethod(...args) {
      return (await this._current())[method](...args);
    };
  }

  const exports = {
    CLOUD_CONFIG_KEY,
    CLOUD_PROVIDER_CONFIGS_KEY,
    CLOUD_SESSION_KEY,
    LOCAL_DRAFT_KEY,
    CloudDocumentError,
    ChromeLocalStore,
    LocalDocumentDraftStore,
    LocalDirectoryDocumentStore,
    SupabaseCloudDocumentProvider,
    CloudBaseDocumentProvider,
    CloudDocumentProvider
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = exports;
  Object.assign(globalScope, exports);
})(typeof globalThis !== 'undefined' ? globalThis : window);
