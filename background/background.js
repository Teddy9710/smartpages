// 录制状态管理
class RecordingManager {
  constructor() {
    this.state = 'idle'; // idle, recording, stopped
    this.currentSession = null;
    this.tabId = null;
  }

  async startRecording(tabId) {
    if (this.state === 'recording') {
      throw new Error('录制已在进行中');
    }

    // 验证tab是否可访问
    try {
      const tab = await chrome.tabs.get(tabId);
      if (!tab || !tab.url) {
        throw new Error('无法访问该页面');
      }

      // 检查是否是特殊页面（无法注入content script）
      if (tab.url.startsWith('chrome://') ||
          tab.url.startsWith('chrome-extension://') ||
          tab.url.startsWith('edge://') ||
          tab.url.startsWith('about:')) {
        throw new Error('无法在系统页面录制。请在普通网页（如百度、谷歌等）上使用。');
      }
    } catch (error) {
      throw new Error('页面不可访问：' + error.message);
    }

    this.state = 'recording';
    this.tabId = tabId;
    this.currentSession = {
      sessionId: this.generateSessionId(),
      startTime: Date.now(),
      steps: [],
      pageUrl: '',
      pageTitle: ''
    };

    // 发送消息到content script开始监听
    try {
      await chrome.tabs.sendMessage(tabId, {
        type: 'START_LISTENING'
      });

      this.notifyStateChanged();
      return { success: true };
    } catch (error) {
      console.error('Failed to start recording:', error);

      // 清理状态
      this.state = 'idle';

      // 提供友好的错误提示
      if (error.message.includes('Could not establish connection')) {
        throw new Error('Content Script未注入。请刷新页面（按F5）后重试。');
      }

      throw error;
    }
  }

  async stopRecording() {
    if (this.state !== 'recording') {
      throw new Error('没有正在进行的录制');
    }

    this.state = 'stopped';
    this.currentSession.endTime = Date.now();

    // 停止content script监听
    try {
      if (this.tabId) {
        await chrome.tabs.sendMessage(this.tabId, {
          type: 'STOP_LISTENING'
        });
      }
    } catch (error) {
      console.error('Failed to stop listening:', error);
    }

    this.notifyStateChanged();

    // 触发AI分析
    this.triggerAIAnalysis();

    return { success: true, session: this.currentSession };
  }

  async resetRecording() {
    this.state = 'idle';
    this.currentSession = null;
    this.tabId = null;
    this.notifyStateChanged();
    return { success: true };
  }

  getState() {
    return {
      state: this.state,
      stepCount: this.currentSession?.steps?.length || 0,
      session: this.currentSession
    };
  }

  async addStep(step) {
    if (this.state !== 'recording' || !this.currentSession) {
      console.warn('[RecordingManager] Cannot add step: invalid state or no session');
      return;
    }

    if (!step || !step.type) {
      console.warn('[RecordingManager] Invalid step data:', step);
      return;
    }

    try {
      // 添加步骤但暂不截图，避免阻塞主线程
      this.currentSession.steps.push(step);

      // 异步截图，提高响应速度
      this.captureScreenshotAsync();

      this.notifyStateChanged();
    } catch (error) {
      console.error('[RecordingManager] Failed to add step:', error);
    }
  }

  // 异步截图方法，避免阻塞主线程
  async captureScreenshotAsync() {
    try {
      // 使用setTimeout确保在下一个事件循环中执行截图
      setTimeout(async () => {
        if (this.state === 'recording' && this.tabId) {
          const screenshot = await chrome.tabs.captureVisibleTab(null, {
            format: 'png',
            quality: 85
          });
          
          // 更新最新步骤的截图
          if (this.currentSession.steps.length > 0) {
            this.currentSession.steps[this.currentSession.steps.length - 1].screenshot = screenshot;
          }
        }
      }, 0);
    } catch (error) {
      console.error('[RecordingManager] Failed to capture screenshot:', error);
      // 继续执行，截图失败不影响步骤记录
    }
  }

  notifyStateChanged() {
    // 通知popup更新状态
    chrome.runtime.sendMessage({
      type: 'RECORDING_STATE_CHANGED',
      state: this.getState()
    }).catch(() => {
      // Popup可能未打开，忽略错误
    });
  }

  generateSessionId() {
    return 'session_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
  }

  async triggerAIAnalysis() {
    try {
      // 加载配置
      const config = await this.loadConfig();

      if (!config.apiKey) {
        console.warn('No API key configured, skipping AI analysis');
        return;
      }

      if (!config.smartDescription) {
        console.log('[Background] Smart description is disabled, skipping AI analysis');
        return;
      }

      // 保存会话数据供sidepanel使用
      this.currentSession.config = config;

      // 发送消息到sidepanel处理AI分析
      // 注意：如果sidepanel未打开，消息会失败，这是正常的
      // 用户打开sidepanel时会自动检查会话状态并触发分析
      chrome.runtime.sendMessage({
        type: 'START_AI_ANALYSIS',
        session: this.currentSession,
        config: config
      }).catch((error) => {
        // Sidepanel可能未打开，这是正常的，不影响录制功能
        console.log('[Background] Sidepanel not open, message queued. User can open sidepanel manually.');
      });
    } catch (error) {
      console.error('Failed to trigger AI analysis:', error);
    }
  }

  async loadConfig() {
    // 使用 Promise 包装 chrome.storage.local.get
    const result = await new Promise((resolve, reject) => {
      if (chrome && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get(['apiKey', 'baseUrl', 'modelName', 'smartDescription'], (result) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve(result || {});
          }
        });
      } else {
        reject(new Error('chrome.storage is not available'));
      }
    });

    return {
      apiKey: result.apiKey || '',
      baseUrl: result.baseUrl || 'https://api.openai.com/v1',
      modelName: result.modelName || 'gpt-3.5-turbo',
      smartDescription: result.smartDescription !== undefined ? result.smartDescription : true
    };
  }
}

// 全局录制管理器
const recordingManager = new RecordingManager();

// 消息监听（使用单例模式避免重复监听）
if (!chrome.runtime.scribeMessageListener) {
  chrome.runtime.scribeMessageListener = (message, sender, sendResponse) => {
  async function handleMessage() {
    try {
      console.log('[Background] Received message:', message.type, message);

      // 处理录制相关消息
      if (['GET_RECORDING_STATE', 'START_RECORDING', 'STOP_RECORDING', 'RESET_RECORDING', 'ADD_STEP', 'GET_SESSION'].includes(message.type)) {
        switch (message.type) {
          case 'GET_RECORDING_STATE':
            return recordingManager.getState();

          case 'START_RECORDING':
            if (!message.tabId) {
              return { error: 'Missing tabId parameter' };
            }
            return await recordingManager.startRecording(message.tabId);

          case 'STOP_RECORDING':
            return await recordingManager.stopRecording();

          case 'RESET_RECORDING':
            return await recordingManager.resetRecording();

          case 'ADD_STEP':
            if (!message.step) {
              return { error: 'Missing step data' };
            }
            if (sender.tab) {
              // 更新页面信息（每次都更新，以处理SPA导航）
              if (recordingManager.currentSession) {
                recordingManager.currentSession.pageUrl = sender.tab.url || '';
                recordingManager.currentSession.pageTitle = sender.tab.title || '';
                await recordingManager.addStep(message.step);
              }
            }
            return { success: true };

          case 'GET_SESSION':
            return recordingManager.currentSession;

          default:
            return { error: 'Unknown message type: ' + message.type };
        }
      } 
      // 处理文档相关消息
      else if (['GET_DOCUMENTS_LIST', 'SEARCH_DOCUMENTS', 'GET_DOCUMENT_CONTENT', 'DELETE_DOCUMENT', 'LINK_DOCUMENT_TO_CODE', 'GET_LINKED_CODES_FOR_DOCUMENT'].includes(message.type)) {
        return await handleDocumentMessage(message, sendResponse);
      } 
      else {
        console.warn('[Background] Unknown message type:', message.type);
        return { error: 'Unknown message type: ' + message.type };
      }
    } catch (error) {
      console.error('[Background] Error handling message:', error);
      return { error: error.message };
    }
  }

  handleMessage().then(result => {
    console.log('[Background] Sending response:', result);
    sendResponse(result);
  }).catch(error => {
    console.error('[Background] Failed to send response:', error);
    sendResponse({ error: error.message });
  });

  return true; // 保持消息通道开启以支持异步响应
  };

  chrome.runtime.onMessage.addListener(chrome.runtime.scribeMessageListener);
}

// 插件安装/更新时
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('[Background] Smart Page Scribe installed');
    // 可以打开设置页面引导用户配置
  } else if (details.reason === 'update') {
    console.log('[Background] Smart Page Scribe updated');
  }
});

// 初始化通知
chrome.notifications.onClicked.addListener((notificationId) => {
  if (notificationId === 'open-settings') {
    chrome.runtime.openOptionsPage();
  }
});

// 文档上传相关的消息处理
async function handleDocumentMessage(message, sendResponse) {
  try {
    switch (message.type) {
      case 'GET_DOCUMENTS_LIST':
        // 获取文档列表
        const docsResult = await chrome.storage.local.get(['documents']);
        const documents = docsResult.documents || [];
        return {
          success: true,
          documents: documents.map(doc => ({
            id: doc.id,
            name: doc.name,
            size: doc.size,
            type: doc.type,
            uploadTime: doc.uploadTime
          }))
        };

      case 'SEARCH_DOCUMENTS':
        // 搜索文档
        const searchResult = await chrome.storage.local.get(['documents']);
        const allDocs = searchResult.documents || [];
        const searchTerm = message.query.toLowerCase();
        
        const matchedDocs = allDocs.filter(doc => 
          doc.name.toLowerCase().includes(searchTerm) || 
          (doc.content && doc.content.toLowerCase().includes(searchTerm))
        );
        
        return {
          success: true,
          documents: matchedDocs
        };

      case 'GET_DOCUMENT_CONTENT':
        // 获取特定文档内容
        const contentResult = await chrome.storage.local.get(['documents']);
        const allDocuments = contentResult.documents || [];
        const document = allDocuments.find(doc => doc.id === message.docId);
        
        if (document) {
          return {
            success: true,
            document: document
          };
        } else {
          return {
            success: false,
            message: '文档不存在'
          };
        }

      case 'DELETE_DOCUMENT':
        // 删除文档
        const deleteResult = await chrome.storage.local.get(['documents']);
        const existingDocs = deleteResult.documents || [];
        const updatedDocs = existingDocs.filter(doc => doc.id !== message.docId);
        
        await chrome.storage.local.set({ documents: updatedDocs });
        
        return {
          success: true,
          message: '文档删除成功'
        };

      case 'LINK_DOCUMENT_TO_CODE':
        // 创建文档与代码的关联
        const linkResult = await chrome.storage.local.get(['documentCodeLinks']);
        const existingLinks = linkResult.documentCodeLinks || [];
        
        const newLink = {
          id: Date.now().toString(36) + Math.random().toString(36).substr(2),
          docId: message.docId,
          codeContext: message.codeContext,
          linkedAt: new Date().toISOString(),
          metadata: {
            codeType: message.codeContext.code ? detectCodeType(message.codeContext.code) : 'unknown',
            functionName: message.codeContext.code ? extractFunctionName(message.codeContext.code) : 'unknown',
            description: message.codeContext.description || ''
          }
        };
        
        existingLinks.push(newLink);
        await chrome.storage.local.set({ documentCodeLinks: existingLinks });
        
        return {
          success: true,
          link: newLink
        };

      case 'GET_LINKED_CODES_FOR_DOCUMENT':
        // 获取文档的关联代码
        const linkResult = await chrome.storage.local.get(['documentCodeLinks']);
        const allLinks = linkResult.documentCodeLinks || [];
        const linkedCodes = allLinks.filter(link => link.docId === message.docId);
        
        return {
          success: true,
          links: linkedCodes
        };

      default:
        return { error: 'Unknown document message type: ' + message.type };
    }
  } catch (error) {
    console.error('[Background] Error handling document message:', error);
    return { error: error.message };
  }
}

// 辅助函数：检测代码类型
function detectCodeType(code) {
  if (code.includes('function') || code.includes('def ') || code.includes('var ') || code.includes('let ') || code.includes('const ')) {
    return 'javascript';
  } else if (code.includes('import') || code.includes('from') || code.includes('def ') || code.includes('class ')) {
    return 'python';
  } else if (code.includes('#include') || code.includes('#define') || code.includes('int main')) {
    return 'c_cpp';
  } else if (code.includes('public class') || code.includes('private') || code.includes('protected')) {
    return 'java';
  } else if (code.includes('<!DOCTYPE html>') || code.includes('<html>') || code.includes('<div')) {
    return 'html';
  } else if (code.includes('{') && code.includes('}')) {
    return 'general';
  }
  return 'unknown';
}

// 辅助函数：提取函数名
function extractFunctionName(code) {
  // JavaScript/Python函数名提取
  const funcMatch = code.match(/(?:function\s+)?([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/);
  if (funcMatch && funcMatch[1]) {
    return funcMatch[1];
  }
  
  // Python def匹配
  const pythonMatch = code.match(/def\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/);
  if (pythonMatch && pythonMatch[1]) {
    return pythonMatch[1];
  }
  
  // Java方法名匹配
  const javaMatch = code.match(/(?:public|private|protected)\s+\w+\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/);
  if (javaMatch && javaMatch[1]) {
    return javaMatch[1];
  }
  
  return 'unknown_function';
}
