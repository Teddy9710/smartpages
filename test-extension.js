// 扩展测试脚本 - 用于在浏览器控制台运行
// 使用方法：在浏览器控制台粘贴此脚本

console.log('=== Smart Page Scribe 扩展测试 ===\n');

async function testExtension() {
  const results = {
    passed: 0,
    failed: 0,
    tests: []
  };

  function logTest(name, passed, details) {
    const status = passed ? '✅ PASS' : '❌ FAIL';
    console.log(`${status}: ${name}`);
    if (details) console.log('  ', details);
    results.tests.push({ name, passed, details });
    if (passed) results.passed++;
    else results.failed++;
  }

  try {
    // 测试1: 检查Chrome API可用性
    console.log('\n--- 测试Chrome API ---');
    logTest('chrome.runtime可用', typeof chrome !== 'undefined' && !!chrome.runtime);
    logTest('chrome.storage可用', typeof chrome !== 'undefined' && !!chrome.storage);
    logTest('chrome.tabs可用', typeof chrome !== 'undefined' && !!chrome.tabs);

    // 测试2: 检查Background连接
    console.log('\n--- 测试Background连接 ---');
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_RECORDING_STATE' });
      logTest('Background脚本响应', response && typeof response === 'object', { response });
    } catch (error) {
      logTest('Background脚本响应', false, { error: error.message });
    }

    // 测试3: 检查状态管理
    console.log('\n--- 测试状态管理 ---');
    try {
      const state1 = await chrome.runtime.sendMessage({ type: 'GET_RECORDING_STATE' });
      logTest('获取录制状态', state1 && typeof state1.state === 'string', { state: state1 });

      const validStates = ['idle', 'recording', 'stopped'];
      logTest('状态值有效', validStates.includes(state1?.state), { state: state1?.state });
    } catch (error) {
      logTest('获取录制状态', false, { error: error.message });
    }

    // 测试4: 检查Storage
    console.log('\n--- 测试Storage ---');
    try {
      const data = await new Promise((resolve, reject) => {
        chrome.storage.local.get(['apiKey', 'baseUrl', 'modelName', 'smartDescription'], (result) => {
          if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
          else resolve(result);
        });
      });
      logTest('读取配置成功', data && typeof data === 'object', { configKeys: Object.keys(data) });
    } catch (error) {
      logTest('读取配置成功', false, { error: error.message });
    }

    // 测试5: 检查Content Script注入
    console.log('\n--- 测试Content Script ---');
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab && tab.url && (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://'))) {
        logTest('检查Content Script', false, { error: '无法在系统页面测试' });
      } else {
        try {
          const response = await chrome.tabs.sendMessage(tab.id, { type: 'IS_LISTENING' });
          logTest('Content Script已注入', response && typeof response.isListening === 'boolean', { response });
        } catch (error) {
          logTest('Content Script已注入', false, { error: error.message, hint: '请刷新页面' });
        }
      }
    } catch (error) {
      logTest('检查Content Script', false, { error: error.message });
    }

    // 测试6: 测试录制流程
    console.log('\n--- 测试录制流程 ---');
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      if (!tab || !tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
        logTest('开始录制', false, { error: '当前页面不支持录制' });
      } else {
        // 尝试开始录制
        try {
          const startResponse = await chrome.runtime.sendMessage({
            type: 'START_RECORDING',
            tabId: tab.id
          });
          logTest('开始录制', startResponse && startResponse.success === true, { response: startResponse });

          // 等待一秒
          await new Promise(resolve => setTimeout(resolve, 1000));

          // 停止录制
          const stopResponse = await chrome.runtime.sendMessage({ type: 'STOP_RECORDING' });
          logTest('停止录制', stopResponse && stopResponse.success === true, { response: stopResponse });

          // 重置
          await chrome.runtime.sendMessage({ type: 'RESET_RECORDING' });
        } catch (error) {
          logTest('录制流程测试', false, { error: error.message });
        }
      }
    } catch (error) {
      logTest('录制流程测试', false, { error: error.message });
    }

  } catch (error) {
    console.error('\n测试过程中发生错误:', error);
  }

  // 输出总结
  console.log('\n=== 测试总结 ===');
  console.log(`通过: ${results.passed}`);
  console.log(`失败: ${results.failed}`);
  console.log(`总计: ${results.passed + results.failed}`);
  console.log(`成功率: ${((results.passed / (results.passed + results.failed)) * 100).toFixed(1)}%`);

  return results;
}

// 运行测试
testExtension().then(results => {
  console.log('\n测试完成！如需重新测试，运行: testExtension()');
});
