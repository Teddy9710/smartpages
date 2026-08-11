// 快速诊断工具 - 在侧边栏Console中运行

const diagnosticQuiet = Boolean(globalThis.SMARTPAGES_DIAGNOSTIC_QUIET);
const log = globalThis.SmartPagesLogger?.createLogger({ quiet: diagnosticQuiet }) || {
  clear: () => { if (!diagnosticQuiet) console.clear(); },
  info: (...args) => { if (!diagnosticQuiet) console.log(...args); },
  warn: (...args) => { if (!diagnosticQuiet) console.warn(...args); },
  error: (...args) => console.error(...args)
};

// 1. 检查配置
async function checkConfig() {
  const [sessionConfig, localConfig] = await Promise.all([
    chrome.storage.session.get(['apiKey']),
    chrome.storage.local.get(['baseUrl', 'modelName'])
  ]);
  const config = { ...localConfig, apiKey: sessionConfig.apiKey || '' };

  log.info('=== API配置检查 ===');
  log.info('API Key:', config.apiKey ? '已配置' : '未配置');
  log.info('Base URL:', config.baseUrl || '未配置');
  log.info('模型名称:', config.modelName || '未配置');

  if (!config.apiKey) {
    log.warn('⚠️ 未配置API Key，将使用默认描述选项');
  }

  return config;
}

// 2. 测试API连接
async function testAPI() {
  const config = await checkConfig();

  if (!config.apiKey) {
    log.info('跳过API测试（未配置）');
    return false;
  }

  log.info('=== 测试API连接 ===');
  const baseUrl = config.baseUrl || 'https://api.openai.com/v1';
  const url = `${baseUrl}/chat/completions`;

  log.info('请求URL:', url);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`
      },
      body: JSON.stringify({
        model: config.modelName || 'gpt-3.5-turbo',
        messages: [{role: 'user', content: 'Hi'}],
        max_tokens: 5
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    log.info('响应状态:', response.status);

    if (response.ok) {
      log.info('✅ API连接成功');
      return true;
    } else {
      const error = await response.json();
      log.error('❌ API错误:', error);
      return false;
    }
  } catch (error) {
    clearTimeout(timeoutId);
    log.error('❌ 请求失败:', error.message);
    return false;
  }
}

// 3. 检查录制状态
async function checkRecordingState() {
  log.info('=== 录制状态检查 ===');

  const state = await chrome.runtime.sendMessage({type: 'GET_RECORDING_STATE'});
  log.info('状态:', state.state);
  log.info('步骤数:', state.stepCount);

  if (state.session) {
    log.info('会话ID:', state.session.sessionId);
    log.info('步骤详情:', state.session.steps);
  }

  return state;
}

// 运行所有检查
async function runDiagnostics() {
  log.clear();
  log.info('🔍 开始诊断...\n');

  await checkConfig();
  log.info('');

  await testAPI();
  log.info('');

  await checkRecordingState();
  log.info('');

  log.info('📋 诊断建议：');

  const config = await checkConfig();
  if (!config.apiKey) {
    log.info('✓ 没有API配置是正常的');
    log.info('✓ 插件会使用默认描述选项');
    log.info('✓ 不需要等待，30秒后会自动显示默认选项');
  } else {
    log.info('⚠️ 已配置API但可能连接失败');
    log.info('⚠️ 请检查API Key和Base URL是否正确');
  }

  log.info('\n提示：等待30秒，如果还是"正在分析"，请手动刷新侧边栏');
}

// 自动运行
runDiagnostics();
