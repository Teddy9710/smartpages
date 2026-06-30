// 快速诊断工具 - 在侧边栏Console中运行

// 1. 检查配置
async function checkConfig() {
  const [sessionConfig, localConfig] = await Promise.all([
    chrome.storage.session.get(['apiKey']),
    chrome.storage.local.get(['baseUrl', 'modelName'])
  ]);
  const config = { ...localConfig, apiKey: sessionConfig.apiKey || '' };

  console.log('=== API配置检查 ===');
  console.log('API Key:', config.apiKey ? '已配置' : '未配置');
  console.log('Base URL:', config.baseUrl || '未配置');
  console.log('模型名称:', config.modelName || '未配置');

  if (!config.apiKey) {
    console.warn('⚠️ 未配置API Key，将使用默认描述选项');
  }

  return config;
}

// 2. 测试API连接
async function testAPI() {
  const config = await checkConfig();

  if (!config.apiKey) {
    console.log('跳过API测试（未配置）');
    return false;
  }

  console.log('=== 测试API连接 ===');
  const baseUrl = config.baseUrl || 'https://api.openai.com/v1';
  const url = `${baseUrl}/chat/completions`;

  console.log('请求URL:', url);

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

    console.log('响应状态:', response.status);

    if (response.ok) {
      console.log('✅ API连接成功');
      return true;
    } else {
      const error = await response.json();
      console.error('❌ API错误:', error);
      return false;
    }
  } catch (error) {
    clearTimeout(timeoutId);
    console.error('❌ 请求失败:', error.message);
    return false;
  }
}

// 3. 检查录制状态
async function checkRecordingState() {
  console.log('=== 录制状态检查 ===');

  const state = await chrome.runtime.sendMessage({type: 'GET_RECORDING_STATE'});
  console.log('状态:', state.state);
  console.log('步骤数:', state.stepCount);

  if (state.session) {
    console.log('会话ID:', state.session.sessionId);
    console.log('步骤详情:', state.session.steps);
  }

  return state;
}

// 运行所有检查
async function runDiagnostics() {
  console.clear();
  console.log('🔍 开始诊断...\n');

  await checkConfig();
  console.log('');

  await testAPI();
  console.log('');

  await checkRecordingState();
  console.log('');

  console.log('📋 诊断建议：');

  const config = await checkConfig();
  if (!config.apiKey) {
    console.log('✓ 没有API配置是正常的');
    console.log('✓ 插件会使用默认描述选项');
    console.log('✓ 不需要等待，30秒后会自动显示默认选项');
  } else {
    console.log('⚠️ 已配置API但可能连接失败');
    console.log('⚠️ 请检查API Key和Base URL是否正确');
  }

  console.log('\n提示：等待30秒，如果还是"正在分析"，请手动刷新侧边栏');
}

// 自动运行
runDiagnostics();
