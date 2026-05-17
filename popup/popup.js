/**
 * Smart Page Scribe - Popup Manager
 *
 * Manages the extension popup UI and interactions.
 * Handles recording controls and state display.
 *
 * @module popup
 */

// ============================================================================
// CONSTANTS
// ============================================================================

/** @constant {Object} ButtonIds - Mapping of button IDs to their actions */
const ButtonIds = {
  START: 'btn-start',
  STOP: 'btn-stop',
  OPEN_EDITOR: 'btn-open-editor',
  NEW_RECORDING: 'btn-new-recording',
  SETTINGS: 'btn-settings'
};

/** @constant {Object} StateIds - Mapping of state view IDs */
const StateIds = {
  IDLE: 'idle-state',
  RECORDING: 'recording-state',
  STOPPED: 'stopped-state'
};

// ============================================================================
// POPUP MANAGER CLASS
// ============================================================================

/**
 * Manages the popup UI and interactions
 * @class
 */
class PopupManager {
  constructor() {
    /** @type {Array<{element?: Element|EventTarget, event?: string, handler?: Function, target?: Object}>} */
    this.listeners = [];

    /** @type {number|null} */
    this.currentStepCount = null;

    /** @type {boolean} */
    this.isStartingRecording = false;

    /** @type {boolean} */
    this.isStoppingRecording = false;

    this.init();
  }

  /**
   * Initializes the popup manager
   * @async
   */
  async init() {
    await this._applyLanguage();
    this._bindButtonEvents();
    this._bindMessageListener();
    await this._refreshState();
  }

  // ========================================================================
  // EVENT BINDING
  // ========================================================================

  /**
   * Binds button click events
   * @private
   */
  _bindButtonEvents() {
    const buttonActions = {
      [ButtonIds.START]: () => this.startRecording(),
      [ButtonIds.STOP]: () => this.stopRecording(),
      [ButtonIds.OPEN_EDITOR]: () => this.openEditor(),
      [ButtonIds.NEW_RECORDING]: () => this.newRecording(),
      [ButtonIds.SETTINGS]: () => this.openSettings()
    };

    for (const [id, handler] of Object.entries(buttonActions)) {
      const element = document.getElementById(id);
      if (element) {
        const wrappedHandler = handler.bind(this);
        element.addEventListener('click', wrappedHandler);
        this.listeners.push({ element, event: 'click', handler: wrappedHandler });
      } else {
        console.error(`[Scribe:Popup] Button with id '${id}' not found in DOM`);
      }
    }
  }

  /**
   * Binds chrome.runtime message listener
   * @private
   */
  _bindMessageListener() {
    const messageListener = (message) => {
      console.log('[Scribe:Popup] Received message:', message);
      if (message.type === 'RECORDING_STATE_CHANGED') {
        this._updateState(message.state?.state, message.state);
      }
    };

    chrome.runtime.onMessage.addListener(messageListener);
    this.listeners.push({ target: chrome.runtime.onMessage, event: 'message', handler: messageListener });
  }

  // ========================================================================
  // STATE MANAGEMENT
  // ========================================================================

  /**
   * Refreshes the current recording state from background
   * @private
   * @async
   */
  async _refreshState() {
    try {
      const response = await sendMessage({ type: 'GET_RECORDING_STATE' });
      console.log('[Scribe:Popup] Current state:', response);

      if (response?.state) {
        this._updateState(response.state, response);
        if (response.state === 'recording' && response.stepCount !== undefined) {
          this._updateStepCount(response.stepCount);
        }
      } else {
        console.warn('[Scribe:Popup] Invalid response received:', response);
        this._updateState('idle');
      }
    } catch (error) {
      console.error('[Scribe:Popup] Failed to get state:', error);
      this._updateState('idle');
    }
  }

  /**
   * Updates the UI to reflect the current state
   * @private
   * @param {string} state - Recording state
   * @param {Object} [response=null] - Full response object
   */
  _updateState(state, response = null) {
    console.log('[Scribe:Popup] Updating state to:', state);

    // Hide all state views
    document.querySelectorAll('.state').forEach(el => el.classList.remove('active'));

    const statusIndicator = document.getElementById('status-indicator');
    const statusText = document.getElementById('status-text');

    switch (state) {
      case 'idle':
        this._showState(StateIds.IDLE);
        statusIndicator?.classList.remove('recording');
        if (statusText) statusText.textContent = '未录制';
        break;

      case 'recording':
        this._showState(StateIds.RECORDING);
        statusIndicator?.classList.add('recording');
        if (statusText) statusText.textContent = '录制中';
        break;

      case 'stopped':
        this._showState(StateIds.STOPPED);
        statusIndicator?.classList.remove('recording');
        if (statusText) statusText.textContent = '已停止';

        // Update total steps
        {
          const stepCount = response?.stepCount ?? this.currentStepCount;
          if (stepCount !== undefined) {
            this.currentStepCount = stepCount;
            const totalStepsEl = document.getElementById('total-steps');
            if (totalStepsEl) {
              totalStepsEl.textContent = stepCount;
            }
          }
        }
        break;
    }
  }

  /**
   * Shows a specific state view
   * @private
   * @param {string} stateId - State element ID
   */
  _showState(stateId) {
    const stateElement = document.getElementById(stateId);
    if (stateElement) {
      stateElement.classList.add('active');
    }
  }

  /**
   * Updates the step count display
   * @private
   * @param {number} count - Step count
   */
  _updateStepCount(count) {
    console.log('[Scribe:Popup] Step count:', count);
    this.currentStepCount = count;
    const stepCountEl = document.getElementById('step-count');
    if (stepCountEl) {
      stepCountEl.textContent = count;
    }
  }

  async _applyLanguage() {
    const config = await loadConfig().catch(() => ({ appLanguage: DEFAULT_APP_LANGUAGE }));
    this.language = config.appLanguage === 'en-US' ? 'en-US' : 'zh-CN';
    document.documentElement.lang = this.language;
    const isEn = this.language === 'en-US';
    const text = isEn ? {
      title: 'Smart Page Scribe',
      subtitle: 'Record browser actions and generate docs',
      statusIdle: 'Not recording',
      start: 'Start Recording',
      hint: 'Click to start recording your workflow',
      recording: 'Recording',
      steps: 'steps',
      stop: 'Stop Recording',
      success: 'Recording Complete',
      totalPrefix: 'Recorded ',
      totalSuffix: ' steps',
      editor: 'Open Editor',
      newRecording: 'New Recording',
      settings: 'Settings'
    } : {
      title: 'Smart Page Scribe',
      subtitle: '记录浏览器操作并生成文档',
      statusIdle: '未录制',
      start: '开始录制',
      hint: '点击开始录制您的操作流程',
      recording: '正在录制',
      steps: '个步骤',
      stop: '停止录制',
      success: '录制完成',
      totalPrefix: '共记录 ',
      totalSuffix: ' 个步骤',
      editor: '打开编辑器',
      newRecording: '重新录制',
      settings: '设置'
    };

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

    set('.header h1', text.title);
    set('.header p', text.subtitle);
    set('#status-text', text.statusIdle);
    setButton('#btn-start', text.start);
    set('.hint', text.hint);
    set('.recording-badge', text.recording);
    const stepCount = document.getElementById('step-count');
    const stepCountContainer = document.querySelector('.step-count');
    if (stepCountContainer && stepCount) {
      stepCountContainer.textContent = '';
      stepCountContainer.appendChild(stepCount);
      stepCountContainer.append(document.createTextNode(` ${text.steps}`));
    }
    setButton('#btn-stop', text.stop);
    set('.success-message h2', text.success);
    const totalSteps = document.getElementById('total-steps');
    const stepInfo = document.querySelector('.step-info');
    if (stepInfo && totalSteps) {
      stepInfo.textContent = text.totalPrefix;
      stepInfo.appendChild(totalSteps);
      stepInfo.append(document.createTextNode(text.totalSuffix));
    }
    setButton('#btn-open-editor', text.editor);
    setButton('#btn-new-recording', text.newRecording);
    setButton('#btn-settings', text.settings);
  }

  // ========================================================================
  // RECORDING ACTIONS
  // ========================================================================

  /**
   * Starts recording the current tab
   * @async
   */
  async startRecording() {
    try {
      console.log('[Scribe:Popup] Starting recording...');

      // Debounce check
      if (this.isStartingRecording) {
        console.log('[Scribe:Popup] Start recording already in progress');
        return;
      }

      this.isStartingRecording = true;

      const [tab] = await queryTabs({ active: true, currentWindow: true });

      const response = await sendMessage({
        type: 'START_RECORDING',
        tabId: tab.id
      });

      console.log('[Scribe:Popup] Start recording response:', response);

      if (response?.success) {
        await this._refreshState();
        window.close();
      } else {
        this._showError(response?.error || '启动录制失败');
      }
    } catch (error) {
      console.error('[Scribe:Popup] Failed to start recording:', error);
      this._showError('启动录制失败，请重试');
    } finally {
      this.isStartingRecording = false;
    }
  }

  /**
   * Stops the current recording
   * @async
   */
  async stopRecording() {
    try {
      console.log('[Scribe:Popup] Stopping recording...');

      // Debounce check
      if (this.isStoppingRecording) {
        console.log('[Scribe:Popup] Stop recording already in progress');
        return;
      }

      this.isStoppingRecording = true;

      // Disable button to prevent double-click
      const btn = document.getElementById(ButtonIds.STOP);
      if (btn) {
        btn.disabled = true;
        btn.textContent = this.language === 'en-US' ? 'Stopping...' : '停止中...';
      }

      const response = await sendMessage({ type: 'STOP_RECORDING' });

      console.log('[Scribe:Popup] Stop recording response:', response);

      if (response?.success) {
        // Wait for state update
        await this._delay(100);
        await this._refreshState();
      } else {
        this._showError(response?.error || '停止录制失败');
        await this._refreshState();
      }
    } catch (error) {
      console.error('[Scribe:Popup] Failed to stop recording:', error);
      this._showError('停止录制失败，请重试');
      await this._refreshState();
    } finally {
      this.isStoppingRecording = false;

      // Restore button state
      const btn = document.getElementById(ButtonIds.STOP);
      if (btn) {
        btn.disabled = false;
        btn.textContent = this.language === 'en-US' ? 'Stop Recording' : '停止录制';
      }
    }
  }

  // ========================================================================
  // OTHER ACTIONS
  // ========================================================================

  /**
   * Opens the side panel editor
   * @async
   */
  async openEditor() {
    try {
      const currentWindow = await chrome.windows.getCurrent();
      await chrome.sidePanel.open({ windowId: currentWindow.id });
      window.close();
    } catch (error) {
      console.error('[Scribe:Popup] Failed to open editor:', error);
      this._showError('无法打开编辑器');
    }
  }

  /**
   * Starts a new recording (resets current state)
   * @async
   */
  async newRecording() {
    try {
      await sendMessage({ type: 'RESET_RECORDING' });
      await this._refreshState();
    } catch (error) {
      console.error('[Scribe:Popup] Failed to reset recording:', error);
      this._showError('重置失败，请重试');
    }
  }

  /**
   * Opens the settings/options page
   */
  openSettings() {
    chrome.runtime.openOptionsPage();
  }

  // ========================================================================
  // UTILITY METHODS
  // ========================================================================

  /**
   * Shows an error message to the user
   * @private
   * @param {string} message - Error message
   */
  _showError(message) {
    alert(message);
  }

  /**
   * Delays execution for a specified time
   * @private
   * @param {number} ms - Milliseconds to delay
   * @returns {Promise<void>}
   */
  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Cleans up resources and event listeners
   */
  cleanup() {
    // Remove DOM event listeners
    this.listeners.forEach(({ element, event, handler }) => {
      if (element?.removeEventListener) {
        element.removeEventListener(event, handler);
      }
    });

    // Remove chrome.runtime message listeners
    this.listeners.forEach(({ target, handler }) => {
      if (target?.removeListener && handler) {
        target.removeListener(handler);
      }
    });

    this.listeners = [];
    console.log('[Scribe:Popup] Cleaned up listeners');
  }
}

// ============================================================================
// INITIALIZATION
// ============================================================================

/** @type {PopupManager|null} */
let popupManager = null;

/**
 * Initializes the popup when DOM is ready
 */
document.addEventListener('DOMContentLoaded', () => {
  console.log('[Scribe:Popup] Popup loaded');
  popupManager = new PopupManager();
});

/**
 * Cleans up when popup is closed
 */
window.addEventListener('unload', () => {
  if (popupManager) {
    popupManager.cleanup();
  }
});
