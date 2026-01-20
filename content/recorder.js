// Content Script - 监听页面操作
(function() {
  'use strict';

  let isListening = false;
  let lastElement = null;
  let lastClickTime = 0;

  // 生成元素选择器
  function generateSelector(element) {
    if (element.id) {
      return `#${element.id}`;
    }

    let selector = element.tagName.toLowerCase();

    if (element.className) {
      const classes = element.className.split(' ').filter(c => c).join('.');
      if (classes) {
        selector += '.' + classes;
      }
    }

    // 如果有name属性
    if (element.name) {
      selector += `[name="${element.name}"]`;
    }

    // 尝试构建更精确的选择器
    const path = [];
    let current = element;

    while (current && current !== document.body) {
      let selector = current.tagName.toLowerCase();

      if (current.id) {
        selector += '#' + current.id;
        path.unshift(selector);
        break;
      }

      if (current.className) {
        const classes = current.className.split(' ').filter(c => c).join('.');
        if (classes) {
          selector += '.' + classes;
        }
      }

      // 添加nth-child以定位
      if (current.parentElement) {
        const siblings = Array.from(current.parentElement.children);
        const index = siblings.indexOf(current);
        if (index > 0) {
          selector += `:nth-child(${index + 1})`;
        }
      }

      path.unshift(selector);
      current = current.parentElement;

      // 防止路径过长
      if (path.length >= 5) break;
    }

    return path.join(' > ');
  }

  // 获取元素的文本内容
  function getElementText(element) {
    // 如果是input元素，返回其value或placeholder
    if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
      return element.value || element.placeholder || '';
    }

    // 返回textContent，限制长度
    const text = element.textContent?.trim() || '';
    return text.substring(0, 50);
  }

  // 记录点击事件
  function recordClick(event) {
    if (!isListening) return;

    // 防止重复记录同一元素的快速点击
    const now = Date.now();
    if (event.target === lastElement && now - lastClickTime < 500) {
      return;
    }

    lastElement = event.target;
    lastClickTime = now;

    const target = event.target;

    // 创建步骤记录
    const step = {
      type: 'click',
      timestamp: now,
      selector: generateSelector(target),
      tagName: target.tagName.toLowerCase(),
      text: getElementText(target),
      x: event.clientX,
      y: event.clientY
    };

    // 发送到background
    chrome.runtime.sendMessage({
      type: 'ADD_STEP',
      step: step
    }).catch(error => {
      console.error('[Smart Page Scribe] Failed to send step:', error);
    });

    // 添加视觉反馈
    showClickFeedback(event.clientX, event.clientY);
  }

  // 显示点击反馈
  function showClickFeedback(x, y) {
    const feedback = document.createElement('div');
    feedback.style.cssText = `
      position: fixed;
      left: ${x}px;
      top: ${y}px;
      width: 20px;
      height: 20px;
      border: 2px solid #ef4444;
      border-radius: 50%;
      pointer-events: none;
      z-index: 999999;
      animation: ripple 0.5s ease-out forwards;
    `;

    // 添加动画样式
    if (!document.getElementById('scribe-feedback-style')) {
      const style = document.createElement('style');
      style.id = 'scribe-feedback-style';
      style.textContent = `
        @keyframes ripple {
          0% {
            transform: scale(0.5);
            opacity: 1;
          }
          100% {
            transform: scale(2);
            opacity: 0;
          }
        }
      `;
      document.head.appendChild(style);
    }

    document.body.appendChild(feedback);

    setTimeout(() => {
      feedback.remove();
    }, 500);
  }

  // 记录页面导航
  function recordNavigation(from, to) {
    if (!isListening) return;

    const step = {
      type: 'navigate',
      timestamp: Date.now(),
      from: from,
      to: to
    };

    chrome.runtime.sendMessage({
      type: 'ADD_STEP',
      step: step
    }).catch(error => {
      console.error('[Smart Page Scribe] Failed to send navigation step:', error);
    });
  }

  // 监听URL变化（SPA路由）
  function observeUrlChanges() {
    let lastUrl = location.href;

    // 监听hashchange
    window.addEventListener('hashchange', () => {
      recordNavigation(lastUrl, location.href);
      lastUrl = location.href;
    });

    // 监听popstate
    window.addEventListener('popstate', () => {
      recordNavigation(lastUrl, location.href);
      lastUrl = location.href;
    });

    // 劫持pushState和replaceState
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    history.pushState = function(...args) {
      originalPushState.apply(this, args);
      recordNavigation(lastUrl, location.href);
      lastUrl = location.href;
    };

    history.replaceState = function(...args) {
      originalReplaceState.apply(this, args);
      recordNavigation(lastUrl, location.href);
      lastUrl = location.href;
    };
  }

  // 开始监听
  function startListening() {
    if (isListening) return;

    isListening = true;

    // 监听点击事件（使用捕获阶段）
    document.addEventListener('click', recordClick, true);

    // 监听URL变化
    observeUrlChanges();

    console.log('[Smart Page Scribe] Recording started');
  }

  // 停止监听
  function stopListening() {
    if (!isListening) return;

    isListening = false;

    document.removeEventListener('click', recordClick, true);

    console.log('[Smart Page Scribe] Recording stopped');
  }

  // 监听来自background的消息
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.type) {
      case 'START_LISTENING':
        startListening();
        sendResponse({ success: true });
        break;

      case 'STOP_LISTENING':
        stopListening();
        sendResponse({ success: true });
        break;

      case 'IS_LISTENING':
        sendResponse({ isListening });
        break;

      default:
        sendResponse({ error: 'Unknown message type' });
    }

    return true;
  });

  // 页面加载完成时通知background
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      console.log('[Smart Page Scribe] Content script loaded');
    });
  } else {
    console.log('[Smart Page Scribe] Content script loaded');
  }
})();
