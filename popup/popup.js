// Popup状态管理
class PopupManager {
  constructor() {
    this.listeners = [];
    this.init();
  }

  async init() {
    // 绑定按钮事件（带DOM验证）
    const buttons = {
      'btn-start': () => this.startRecording(),
      'btn-stop': () => this.stopRecording(),
      'btn-open-editor': () => this.openEditor(),
      'btn-new-recording': () => this.newRecording(),
      'btn-settings': () => this.openSettings()
    };

    for (const [id, handler] of Object.entries(buttons)) {
      const element = document.getElementById(id);
      if (element) {
        const wrappedHandler = handler.bind(this);
        element.addEventListener('click', wrappedHandler);
        this.listeners.push({ element, event: 'click', handler: wrappedHandler });
      } else {
        console.error(`[Popup] Button with id '${id}' not found in DOM`);
      }
    }

    // 监听录制状态变化
    const messageListener = (message, sender, sendResponse) => {
      console.log('[Popup] Received message:', message);
      if (message.type === 'RECORDING_STATE_CHANGED') {
        this.updateState(message.state);
      }
    };
    chrome.runtime.onMessage.addListener(messageListener);
    this.listeners.push({ target: chrome.runtime.onMessage, event: 'message', handler: messageListener });

    // 获取当前状态
    await this.refreshState();
  }

  async refreshState() {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_RECORDING_STATE' });
      console.log('[Popup] Current state:', response);
      if (response && response.state) {
        this.updateState(response.state, response);
        if (response.state === 'recording' && response.stepCount !== undefined) {
          this.updateStepCount(response.stepCount);
        }
      } else {
        console.warn('[Popup] Invalid response received:', response);
      }
    } catch (error) {
      console.error('[Popup] Failed to get state:', error);
      // 设置默认状态
      this.updateState('idle');
    }
  }

  updateState(state, response = null) {
    console.log('[Popup] Updating state to:', state);

    // 隐藏所有状态
    document.querySelectorAll('.state').forEach(el => el.classList.remove('active'));

    const statusIndicator = document.getElementById('status-indicator');
    const statusText = document.getElementById('status-text');

    switch (state) {
      case 'idle':
        document.getElementById('idle-state').classList.add('active');
        statusIndicator.classList.remove('recording');
        statusText.textContent = '未录制';
        break;

      case 'recording':
        document.getElementById('recording-state').classList.add('active');
        statusIndicator.classList.add('recording');
        statusText.textContent = '录制中';
        break;

      case 'stopped':
        document.getElementById('stopped-state').classList.add('active');
        statusIndicator.classList.remove('recording');
        statusText.textContent = '已停止';

        // 更新总步骤数
        if (response && response.stepCount !== undefined) {
          this.currentStepCount = response.stepCount;
          const totalStepsEl = document.getElementById('total-steps');
          if (totalStepsEl) {
            totalStepsEl.textContent = response.stepCount;
          }
        } else if (this.currentStepCount) {
          const totalStepsEl = document.getElementById('total-steps');
          if (totalStepsEl) {
            totalStepsEl.textContent = this.currentStepCount;
          }
        }
        break;
    }
  }

  updateStepCount(count) {
    console.log('[Popup] Step count:', count);
    this.currentStepCount = count;
    document.getElementById('step-count').textContent = count;
  }

  async startRecording() {
    try {
      console.log('[Popup] Starting recording...');
      
      // 添加防抖机制
      if (this.isStartingRecording) {
        console.log('[Popup] Start recording already in progress');
        return;
      }
      
      this.isStartingRecording = true;
      
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      const response = await chrome.runtime.sendMessage({
        type: 'START_RECORDING',
        tabId: tab.id
      });

      console.log('[Popup] Start recording response:', response);

      if (response && response.success) {
        // 等待状态更新
        await this.refreshState();
        window.close();
      } else {
        alert('启动录制失败');
      }
    } catch (error) {
      console.error('[Popup] Failed to start recording:', error);
      alert('启动录制失败，请重试');
    } finally {
      this.isStartingRecording = false;
    }
  }

  async stopRecording() {
    try {
      console.log('[Popup] Stopping recording...');

      // 添加防抖机制
      if (this.isStoppingRecording) {
        console.log('[Popup] Stop recording already in progress');
        return;
      }
      
      this.isStoppingRecording = true;

      // 禁用按钮，防止重复点击
      const btn = document.getElementById('btn-stop');
      if (btn) {
        btn.disabled = true;
        btn.textContent = '停止中...';
      }

      const response = await chrome.runtime.sendMessage({ type: 'STOP_RECORDING' });

      console.log('[Popup] Stop recording response:', response);

      if (response && response.success) {
        // 等待状态更新
        await new Promise(resolve => setTimeout(resolve, 100));
        await this.refreshState();
      } else {
        alert('停止录制失败');
        await this.refreshState();
      }
    } catch (error) {
      console.error('[Popup] Failed to stop recording:', error);
      alert('停止录制失败，请重试');
      await this.refreshState();
    } finally {
      this.isStoppingRecording = false;
      // 恢复按钮状态
      const btn = document.getElementById('btn-stop');
      if (btn) {
        btn.disabled = false;
        btn.textContent = '停止录制';
      }
    }
  }

  async openEditor() {
    try {
      // 获取当前窗口ID
      const currentWindow = await chrome.windows.getCurrent();
      await chrome.sidePanel.open({ windowId: currentWindow.id });
      window.close();
    } catch (error) {
      console.error('Failed to open editor:', error);
    }
  }

  async newRecording() {
    try {
      await chrome.runtime.sendMessage({ type: 'RESET_RECORDING' });
      await this.refreshState();
    } catch (error) {
      console.error('Failed to reset recording:', error);
    }
  }

  openSettings() {
    chrome.runtime.openOptionsPage();
  }

  // 清理资源
  cleanup() {
    // 移除DOM事件监听器
    this.listeners.forEach(({ element, event, handler }) => {
      if (element) {
        element.removeEventListener(event, handler);
      }
    });

    // 移除chrome.runtime消息监听器
    this.listeners.forEach(({ target, handler }) => {
      if (target && target.removeListener) {
        target.removeListener(handler);
      }
    });

    this.listeners = [];
    console.log('[Popup] Cleaned up listeners');
  }
}

// 初始化
let popupManager = null;
document.addEventListener('DOMContentLoaded', () => {
  console.log('[Popup] Popup loaded');
  popupManager = new PopupManager();
});

// 清理（当popup关闭时）
window.addEventListener('unload', () => {
  if (popupManager) {
    popupManager.cleanup();
  }
});
