/** Background recording-manager. Loaded by the service worker. */
const RecordingState = {
  IDLE: 'idle',
  RECORDING: 'recording',
  PAUSED: 'paused',
  STOPPED: 'stopped'
};

const RECORDING_STORAGE_KEY = 'scribeRecordingState';
const MAX_SCREENSHOT_WIDTH = 1920;
const MAX_SCREENSHOT_HEIGHT = 1440;
const COMPRESSED_SCREENSHOT_QUALITY = 0.9;
const SCREENSHOT_CAPTURE_MIN_INTERVAL_MS = 600;
const SCREENSHOT_CAPTURE_QUOTA_RETRY_LIMIT = 2;

/**
 * Manages the recording session lifecycle
 * @class
 */
class RecordingManager {
  static getScreenshotThrottleDelay(now, lastCaptureAt, minIntervalMs = SCREENSHOT_CAPTURE_MIN_INTERVAL_MS) {
    if (!lastCaptureAt) return 0;
    return Math.max(0, minIntervalMs - (now - lastCaptureAt));
  }

  constructor() {
    /** @type {RecordingState} */
    this.state = RecordingState.IDLE;

    /** @type {Session|null} */
    this.currentSession = null;

    /** @type {number|null} */
    this.tabId = null;

    /** @type {boolean} */
    this._hydrated = false;

    /** @type {Promise<void>} */
    this._screenshotCaptureQueue = Promise.resolve();

    /** @type {number} */
    this._lastScreenshotCaptureAt = 0;
  }

  async ensureHydrated() {
    if (this._hydrated) return;
    try {
      const result = await storagePromise('local', 'get', [RECORDING_STORAGE_KEY]);
      const saved = result?.[RECORDING_STORAGE_KEY];
      if (saved) {
        this.state = saved.state || RecordingState.IDLE;
        this.currentSession = saved.currentSession || null;
        this.tabId = saved.tabId || null;
      }
    } catch (error) {
      console.warn('[Scribe:Background] Failed to restore recording state:', error);
    } finally {
      this._hydrated = true;
    }
  }

  /**
   * Starts a new recording session
   * @async
   * @param {number} tabId - The tab ID to record
   * @returns {Promise<{success: boolean, error?: string}>}
   * @throws {ExtensionError} If recording is already in progress or tab is invalid
   */
  async startRecording(tabId) {
    await this.ensureHydrated();
    if (this.state === RecordingState.RECORDING || this.state === RecordingState.PAUSED) {
      throw new ExtensionError('录制已在进行中', 'RECORDING_IN_PROGRESS');
    }

    // Validate tab accessibility
    await this._validateTab(tabId);

    // Initialize session
    this.state = RecordingState.RECORDING;
    this.tabId = tabId;
    this.currentSession = this._createSession();

    // Start content script listening
    await this._startContentScriptListening(tabId);
    await this._persistState();

    this._notifyStateChanged();
    return { success: true };
  }

  /**
   * Stops the current recording session
   * @async
   * @returns {Promise<{success: boolean, session?: Session, error?: string}>}
   * @throws {ExtensionError} If no recording is in progress
   */
  async stopRecording() {
    await this.ensureHydrated();
    if (this.state !== RecordingState.RECORDING && this.state !== RecordingState.PAUSED) {
      throw new ExtensionError('没有正在进行的录制', 'NO_RECORDING');
    }

    this.state = RecordingState.STOPPED;
    this.currentSession.endTime = Date.now();

    // Stop content script listening
    await this._stopContentScriptListening();
    await this._persistState();

    this._notifyStateChanged();

    // Trigger AI analysis asynchronously (non-blocking)
    this._triggerAIAnalysis().catch(error => {
      console.error('[Scribe:Background] AI analysis failed:', error);
    });

    return { success: true, session: this.currentSession };
  }

  /**
   * Pauses the current recording session without finalizing it.
   * @async
   * @returns {Promise<{success: boolean}>}
   * @throws {ExtensionError} If no recording is in progress
   */
  async pauseRecording() {
    await this.ensureHydrated();
    if (this.state !== RecordingState.RECORDING || !this.currentSession) {
      throw new ExtensionError('没有正在进行的录制', 'NO_RECORDING');
    }

    await this._stopContentScriptListening();
    this.state = RecordingState.PAUSED;
    await this._persistState();
    this._notifyStateChanged();

    return { success: true };
  }

  /**
   * Resumes a paused recording session.
   * @async
   * @returns {Promise<{success: boolean}>}
   * @throws {ExtensionError} If no recording is paused
   */
  async resumeRecording() {
    await this.ensureHydrated();
    if (this.state !== RecordingState.PAUSED || !this.currentSession || !this.tabId) {
      throw new ExtensionError('没有已暂停的录制', 'NO_PAUSED_RECORDING');
    }

    await this._validateTab(this.tabId);
    await this._startContentScriptListening(this.tabId, { resetOnFailure: false });
    this.state = RecordingState.RECORDING;
    await this._persistState();
    this._notifyStateChanged();

    return { success: true };
  }

  /**
   * Resets the recording state
   * @async
   * @returns {{success: boolean}}
   */
  async resetRecording() {
    await this.ensureHydrated();
    this.state = RecordingState.IDLE;
    this.currentSession = null;
    this.tabId = null;
    await this._persistState();
    this._notifyStateChanged();
    return { success: true };
  }

  /**
   * Gets the current recording state
   * @returns {{state: RecordingState, stepCount: number, session: Session|null}}
   */
  getState() {
    return {
      state: this.state,
      stepCount: this.currentSession?.steps?.length || 0,
      session: this.currentSession
    };
  }

  /**
   * Adds a step to the current session
   * @async
   * @param {Step} step - The step to add
   * @returns {Promise<void>}
   */
  async addStep(step) {
    await this.ensureHydrated();
    if (this.state !== RecordingState.RECORDING || !this.currentSession) {
      console.warn('[Scribe:Background] Cannot add step: invalid state or no session');
      return;
    }

    if (!step || !step.type) {
      console.warn('[Scribe:Background] Invalid step data:', step);
      return;
    }

    try {
      // Add step with index for screenshot binding
      this.currentSession.steps.push(step);
      const stepIndex = this.currentSession.steps.length - 1;

      // Capture screenshot asynchronously (non-blocking)
      this._enqueueScreenshotCapture(stepIndex).catch(error => {
        console.error('[Scribe:Background] Screenshot capture failed:', error);
      });

      await this._persistState();
      this._notifyStateChanged();
    } catch (error) {
      console.error('[Scribe:Background] Failed to add step:', error);
    }
  }

  // ========================================================================
  // PRIVATE METHODS
  // ========================================================================

  /**
   * Validates that a tab is accessible and can be recorded
   * @private
   * @async
   * @param {number} tabId - Tab ID to validate
   * @throws {ExtensionError} If tab is invalid or restricted
   */
  async _validateTab(tabId) {
    try {
      const tab = await chrome.tabs.get(tabId);
      if (!tab || !tab.url) {
        throw new ExtensionError('无法访问该页面', 'TAB inaccessible');
      }

      // Check for restricted URLs
      if (isRestrictedUrl(tab.url)) {
        throw new ExtensionError(
          '无法在系统页面录制。请在普通网页（如百度、谷歌等）上使用。',
          'RESTRICTED_URL'
        );
      }
    } catch (error) {
      throw new ExtensionError('页面不可访问：' + error.message, 'TAB_ERROR');
    }
  }

  /**
   * Creates a new session object
   * @private
   * @returns {Session}
   */
  _createSession() {
    return {
      sessionId: generateSessionId(),
      startTime: Date.now(),
      steps: [],
      pageUrl: '',
      pageTitle: ''
    };
  }

  async _persistState() {
    const savedState = {
      state: this.state,
      currentSession: this.currentSession,
      tabId: this.tabId,
      updatedAt: Date.now()
    };

    try {
      await storagePromise('local', 'set', {
        [RECORDING_STORAGE_KEY]: savedState
      });
    } catch (error) {
      console.warn('[Scribe:Background] Failed to persist full recording state, retrying without screenshots:', error);
      await storagePromise('local', 'set', {
        [RECORDING_STORAGE_KEY]: {
          ...savedState,
          currentSession: this._createLightweightSession(this.currentSession),
          screenshotStorageLimited: true
        }
      });
    }
  }

  _createLightweightSession(session) {
    if (!session) return null;
    return {
      ...session,
      steps: (session.steps || []).map(step => {
        if (!step?.screenshot) return step;
        return {
          ...step,
          screenshot: undefined,
          screenshotOmitted: true
        };
      })
    };
  }

  /**
   * Sends message to content script to start listening
   * @private
   * @async
   * @param {number} tabId - Tab ID
   * @throws {ExtensionError} If content script communication fails
   */
  async _startContentScriptListening(tabId, options = {}) {
    const { resetOnFailure = true } = options;
    try {
      await chrome.tabs.sendMessage(tabId, { type: 'START_LISTENING' });
    } catch (error) {
      if (this._isContentScriptConnectionError(error)) {
        try {
          await this._injectContentScript(tabId);
          await chrome.tabs.sendMessage(tabId, { type: 'START_LISTENING' });
          return;
        } catch (injectError) {
          if (resetOnFailure) {
            this.state = RecordingState.IDLE;
            this.currentSession = null;
          }
          throw new ExtensionError(
            '无法注入录制脚本。请确认当前页面不是浏览器系统页；如果刚重新加载过扩展，请刷新目标页面后重试。' + (injectError?.message ? ` (${injectError.message})` : ''),
            'CONTENT_SCRIPT_ERROR'
          );
        }
      }

      if (resetOnFailure) {
        this.state = RecordingState.IDLE;
        this.currentSession = null;
      }
      throw error;
    }
  }

  _isContentScriptConnectionError(error) {
    const message = error?.message || '';
    return message.includes('Could not establish connection') ||
      message.includes('Receiving end does not exist') ||
      message.includes('The message port closed before a response was received');
  }

  async _injectContentScript(tabId) {
    if (!chrome.scripting?.executeScript) {
      throw new ExtensionError('chrome.scripting API 不可用', 'SCRIPTING_UNAVAILABLE');
    }

    try {
      await chrome.scripting.executeScript({
        target: { tabId, allFrames: true },
        files: ['content/recorder.js']
      });
    } catch (error) {
      const message = error?.message || '';
      if (this._isAllFramesInjectionBlocked(error)) {
        console.warn('[Scribe:Background] All-frame injection blocked; retrying main frame only:', error);
        try {
          await chrome.scripting.executeScript({
            target: { tabId },
            files: ['content/recorder-selector.js', 'content/recorder.js']
          });
        } catch (mainFrameError) {
          if (this._isAllFramesInjectionBlocked(mainFrameError)) {
            throw new ExtensionError(
              '当前页面禁止扩展脚本注入，无法开始录制。请换到普通网页，或刷新目标页面后重试。',
              'CONTENT_SCRIPT_ERROR'
            );
          }
          throw mainFrameError;
        }
        return;
      }
      if (message.includes('Cannot access') || message.includes('Extension manifest')) {
        throw new ExtensionError('当前页面无法注入录制脚本，请换到普通网页或刷新页面后重试。', 'CONTENT_SCRIPT_ERROR');
      }
      throw error;
    }
  }

  _isAllFramesInjectionBlocked(error) {
    return String(error?.message || error).trim() === 'Blocked';
  }

  /**
   * Sends message to content script to stop listening
   * @private
   * @async
   */
  async _stopContentScriptListening() {
    if (this.tabId) {
      try {
        await chrome.tabs.sendMessage(this.tabId, { type: 'STOP_LISTENING' });
      } catch (error) {
        console.error('[Scribe:Background] Failed to stop listening:', error);
        // Continue anyway - stopping is not critical
      }
    }
  }

  async resumeRecordingInTab(tabId, tab = null) {
    await this.ensureHydrated();
    if (this.state !== RecordingState.RECORDING || this.tabId !== tabId) return;

    try {
      const currentTab = tab?.url ? tab : await chrome.tabs.get(tabId);
      if (!currentTab?.url || isRestrictedUrl(currentTab.url)) return;

      const previousUrl = this.currentSession?.pageUrl || '';
      const nextUrl = currentTab.url || '';
      if (previousUrl && nextUrl && previousUrl !== nextUrl) {
        await this._addNavigationStep(previousUrl, nextUrl);
      }

      if (this.currentSession) {
        this.currentSession.pageUrl = currentTab.url || this.currentSession.pageUrl || '';
        this.currentSession.pageTitle = currentTab.title || this.currentSession.pageTitle || '';
      }

      await this._startContentScriptListening(tabId, { resetOnFailure: false });
      await this._persistState();
      this._notifyStateChanged();
      debugLog('[Scribe:Background] Recording resumed after navigation:', currentTab.url);
    } catch (error) {
      console.warn('[Scribe:Background] Failed to resume recording after navigation:', error);
    }
  }

  async _addNavigationStep(from, to) {
    if (!this.currentSession?.steps || from === to) return;
    const lastStep = this.currentSession.steps[this.currentSession.steps.length - 1];
    if (lastStep?.type === 'navigate' && lastStep.from === from && lastStep.to === to) return;

    await this.addStep({
      type: 'navigate',
      timestamp: Date.now(),
      from,
      to
    });
  }

  /**
   * Captures a screenshot for a specific step
   * @private
   * @async
   * @param {number} stepIndex - Index of the step
   */
  async _enqueueScreenshotCapture(stepIndex) {
    const captureTask = this._screenshotCaptureQueue.then(() => this._captureScreenshotForStep(stepIndex));
    this._screenshotCaptureQueue = captureTask.catch(() => {});
    return captureTask;
  }

  async _captureScreenshotForStep(stepIndex) {
    try {
      // Check storage space before capturing
      const usage = await chrome.storage.local.getBytesInUse();
      if (usage > STORAGE_WARNING_THRESHOLD) {
        console.warn('[Scribe:Background] Storage space running low:', (usage / 1024 / 1024).toFixed(2), 'MB');
        showNotification('存储空间不足', '录制数据接近存储上限，请及时保存并清理旧数据');
        return;
      }

      if (this.state === RecordingState.RECORDING && this.tabId) {
        const rawScreenshot = await this._captureVisibleTabWithQuotaRetry();
        const screenshot = await this._compressScreenshot(rawScreenshot);

        // Only assign if step still exists (prevents race conditions)
        if (this.currentSession?.steps?.[stepIndex]) {
          this.currentSession.steps[stepIndex].screenshot = screenshot;
          await this._persistState();
        }
      }
    } catch (error) {
      console.error('[Scribe:Background] Screenshot failed for step', stepIndex, error);
      // Screenshot failure doesn't affect step recording
    }
  }

  async _captureVisibleTabWithQuotaRetry() {
    let lastError = null;
    for (let attempt = 0; attempt <= SCREENSHOT_CAPTURE_QUOTA_RETRY_LIMIT; attempt += 1) {
      await this._waitForScreenshotQuota();
      this._lastScreenshotCaptureAt = Date.now();
      try {
        await this._hideRecordingIndicatorForScreenshot();
        try {
          const tab = await chrome.tabs.get(this.tabId);
          return await chrome.tabs.captureVisibleTab(tab?.windowId ?? null, {
            format: 'png'
          });
        } finally {
          await this._restoreRecordingIndicatorAfterScreenshot();
        }
      } catch (error) {
        lastError = error;
        if (!this._isScreenshotQuotaError(error) || attempt >= SCREENSHOT_CAPTURE_QUOTA_RETRY_LIMIT) {
          throw error;
        }
        await this._sleep(SCREENSHOT_CAPTURE_MIN_INTERVAL_MS);
      }
    }
    throw lastError;
  }

  async _hideRecordingIndicatorForScreenshot() {
    await this._sendRecordingIndicatorMessage('HIDE_RECORDING_INDICATOR');
  }

  async _restoreRecordingIndicatorAfterScreenshot() {
    await this._sendRecordingIndicatorMessage('RESTORE_RECORDING_INDICATOR');
  }

  async _sendRecordingIndicatorMessage(type) {
    if (!this.tabId) return;
    try {
      await chrome.tabs.sendMessage(this.tabId, { type });
    } catch (error) {
      console.warn('[Scribe:Background] Failed to update recording indicator:', error);
    }
  }

  async _waitForScreenshotQuota() {
    const delay = RecordingManager.getScreenshotThrottleDelay(Date.now(), this._lastScreenshotCaptureAt);
    if (delay > 0) {
      await this._sleep(delay);
    }
  }

  _isScreenshotQuotaError(error) {
    return String(error?.message || error).includes('MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND');
  }

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async _compressScreenshot(dataUrl) {
    if (!dataUrl || typeof createImageBitmap !== 'function' || typeof OffscreenCanvas === 'undefined') {
      return dataUrl;
    }

    try {
      const blob = await (await fetch(dataUrl)).blob();
      const bitmap = await createImageBitmap(blob);
      const scale = Math.min(
        1,
        MAX_SCREENSHOT_WIDTH / bitmap.width,
        MAX_SCREENSHOT_HEIGHT / bitmap.height
      );
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = new OffscreenCanvas(width, height);
      const context = canvas.getContext('2d');
      context.drawImage(bitmap, 0, 0, width, height);
      bitmap.close?.();
      const compressedBlob = await canvas.convertToBlob({
        type: 'image/jpeg',
        quality: COMPRESSED_SCREENSHOT_QUALITY
      });
      return await this._blobToDataUrl(compressedBlob);
    } catch (error) {
      console.warn('[Scribe:Background] Screenshot compression failed, keeping original:', error);
      return dataUrl;
    }
  }

  async _blobToDataUrl(blob) {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
    }
    return `data:${blob.type || 'image/jpeg'};base64,${btoa(binary)}`;
  }

  async getStorageUsage() {
    const bytes = await chrome.storage.local.getBytesInUse();
    return {
      bytes,
      mb: Number((bytes / 1024 / 1024).toFixed(2)),
      warningThreshold: STORAGE_WARNING_THRESHOLD
    };
  }

  async clearRecordingCache() {
    await this.ensureHydrated();
    if (this.state === RecordingState.RECORDING || this.state === RecordingState.PAUSED) {
      throw new ExtensionError('录制进行中，不能清理录制缓存', 'RECORDING_IN_PROGRESS');
    }
    this.state = RecordingState.IDLE;
    this.currentSession = null;
    this.tabId = null;
    await storagePromise('local', 'remove', RECORDING_STORAGE_KEY);
    this._notifyStateChanged();
    return { success: true };
  }

  /**
   * Notifies all listeners of state change
   * @private
   */
  _notifyStateChanged() {
    chrome.runtime.sendMessage({
      type: 'RECORDING_STATE_CHANGED',
      state: this.getState()
    }).catch(() => {
      // Popup may not be open - ignore
    });
  }

  /**
   * Triggers AI analysis for the completed session
   * @private
   * @async
   */
  async _triggerAIAnalysis() {
    try {
      const config = await loadConfig();

      if (!config.apiKey) {
        console.warn('[Scribe:Background] No API key configured, skipping AI analysis');
        return;
      }

      if (!config.smartDescription) {
        debugLog('[Scribe:Background] Smart description is disabled');
        return;
      }

      // Attach config to session for sidepanel use
      this.currentSession.config = config;

      // Notify sidepanel (may fail if not open - that's OK)
      chrome.runtime.sendMessage({
        type: 'START_AI_ANALYSIS',
        session: this.currentSession,
        config: config
      }).catch(() => {
        debugLog('[Scribe:Background] Sidepanel not open - analysis queued');
      });
    } catch (error) {
      console.error('[Scribe:Background] AI analysis trigger failed:', error);
    }
  }
}
