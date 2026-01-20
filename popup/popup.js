// Popup状态管理
class PopupManager {
  constructor() {
    this.init();
  }

  async init() {
    // 绑定按钮事件
    document.getElementById('btn-start').addEventListener('click', () => this.startRecording());
    document.getElementById('btn-stop').addEventListener('click', () => this.stopRecording());
    document.getElementById('btn-open-editor').addEventListener('click', () => this.openEditor());
    document.getElementById('btn-new-recording').addEventListener('click', () => this.newRecording());
    document.getElementById('btn-settings').addEventListener('click', () => this.openSettings());

    // 监听录制状态变化
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      console.log('[Popup] Received message:', message);
      if (message.type === 'RECORDING_STATE_CHANGED') {
        this.updateState(message.state);
      }
    });

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
    }
  }

  async stopRecording() {
    try {
      console.log('[Popup] Stopping recording...');

      // 禁用按钮，防止重复点击
      const btn = document.getElementById('btn-stop');
      btn.disabled = true;
      btn.textContent = '停止中...';

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
}

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  console.log('[Popup] Popup loaded');
  new PopupManager();
});
