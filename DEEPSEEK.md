# DeepSeek 配置指南

Smart Page Scribe 完全支持 DeepSeek API！DeepSeek 提供高性能且价格优惠的AI模型，非常适合文档生成任务。

## 为什么选择 DeepSeek？

- ✅ **性价比高**：价格比 OpenAI 优惠很多
- ✅ **性能优秀**：DeepSeek-V3 模型性能接近 GPT-4
- ✅ **中文友好**：对中文理解能力更强
- ✅ **兼容性好**：完全兼容 OpenAI API 格式

## 快速配置

### 1. 获取 DeepSeek API Key

1. 访问 DeepSeek 官网：https://www.deepseek.com/
2. 注册/登录账号
3. 进入 API Keys 页面：https://platform.deepseek.com/api_keys
4. 创建新的 API Key
5. 复制 API Key（格式类似：`sk-xxxxxxxxxxxxxxxxxxxxxxxx`）

### 2. 配置插件

1. 点击浏览器工具栏中的插件图标
2. 点击"⚙️ 设置"按钮
3. 填写以下信息：

**必填项：**
- **API Key**: 粘贴您的 DeepSeek API Key

**可选项：**
- **Base URL**: `https://api.deepseek.com` （如果不填，默认使用 OpenAI）
- **模型名称**: `deepseek-chat` （推荐）或 `deepseek-coder`

### 3. 完整配置示例

```
API Key: sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
Base URL: https://api.deepseek.com
模型名称: deepseek-chat
```

### 4. 测试连接

点击"测试连接"按钮，应该显示：
- ✅ 连接成功！API配置有效

### 5. 保存配置

点击"保存配置"完成设置。

## 支持的 DeepSeek 模型

### deepseek-chat（推荐）
- **用途**：通用对话和文档生成
- **性能**：接近 GPT-4 水平
- **价格**：输入 ¥1/百万tokens，输出 ¥2/百万tokens
- **适用场景**：生成操作文档、技术说明

### deepseek-coder
- **用途**：代码相关任务
- **性能**：专门优化的代码模型
- **适用场景**：记录编程操作、API使用教程

## DeepSeek vs OpenAI 对比

| 特性 | DeepSeek-V3 | OpenAI GPT-4 | OpenAI GPT-3.5 |
|------|-------------|--------------|----------------|
| 文档生成质量 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| 中文理解 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ |
| 速度 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ |
| 价格 | ⭐⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐ |
| **推荐指数** | **⭐⭐⭐⭐⭐** | ⭐⭐⭐⭐ | ⭐⭐⭐ |

## 使用场景示例

### 场景1：生成中文操作文档
**配置：**
```
API Key: sk-xxxx
Base URL: https://api.deepseek.com
模型名称: deepseek-chat
```

**结果：** DeepSeek 对中文的理解和生成更自然，生成的文档更符合中文阅读习惯。

### 场景2：记录编程教程
**配置：**
```
API Key: sk-xxxx
Base URL: https://api.deepseek.com
模型名称: deepseek-coder
```

**结果：** 专门优化的代码模型，技术文档更准确。

### 场景3：大量录制（节省成本）
**优势：**
- DeepSeek 价格是 OpenAI 的 1/10
- 每天录制100个操作，成本几乎可忽略
- 适合高频使用场景

## 常见问题

### Q1: DeepSeek API Key 格式？

**A:** DeepSeek API Key 通常以 `sk-` 开头，与 OpenAI 格式相同。

### Q2: Base URL 填什么？

**A:**
- 标准环境：`https://api.deepseek.com`
- 不需要加 `/v1` 后缀

### Q3: 测试连接失败？

**A:** 请检查：
1. API Key 是否正确
2. Base URL 是否填写（`https://api.deepseek.com`）
3. 网络是否能访问 DeepSeek API
4. API 账户是否有余额

### Q4: 生成速度慢？

**A:** DeepSeek 通常比 OpenAI 快，如果慢请检查：
1. 网络连接
2. DeepSeek 服务器状态
3. 尝试减少 max_tokens 参数（在代码中调整）

### Q5: 可以同时使用多个 API 吗？

**A:** 当前版本不支持同时使用多个 API。建议：
- 日常使用：DeepSeek（省钱）
- 特殊需求：临时切换到 OpenAI

## 配置切换

### 从 OpenAI 切换到 DeepSeek

1. 打开设置页面
2. 修改 Base URL 为：`https://api.deepseek.com`
3. 修改模型名称为：`deepseek-chat`
4. API Key 改为 DeepSeek 的
5. 测试连接
6. 保存配置

### 从 DeepSeek 切换回 OpenAI

1. 打开设置页面
2. 清空 Base URL（或填 `https://api.openai.com/v1`）
3. 修改模型名称为：`gpt-3.5-turbo` 或 `gpt-4`
4. API Key 改为 OpenAI 的
5. 测试连接
6. 保存配置

## 成本对比示例

假设每天生成 10 篇文档，每篇需要 1000 tokens：

| 服务 | 模型 | 输入成本 | 输出成本 | 每月成本（30天） |
|------|------|----------|----------|------------------|
| DeepSeek | deepseek-chat | ¥0.001 | ¥0.002 | **¥0.09** |
| OpenAI | gpt-3.5-turbo | $0.0015 | $0.002 | **$1.35** (~¥9.7) |
| OpenAI | gpt-4 | $0.03 | $0.06 | **$27** (~¥195) |

**结论**：使用 DeepSeek 可以节省 **95%+** 的成本！

## 最佳实践

### 1. 推荐配置（日常使用）
```
API Key: sk-xxxxx（DeepSeek）
Base URL: https://api.deepseek.com
模型名称: deepseek-chat
```

### 2. 高质量要求
如果对文档质量要求极高：
```
模型名称: deepseek-chat
任务描述: 提供详细的上下文信息
```

### 3. 技术文档
```
模型名称: deepseek-coder
适用于: 编程教程、API文档
```

### 4. 大批量生成
```
服务: DeepSeek
优势: 成本极低，速度快
建议: 设置智能描述关闭，手动指定描述
```

## 高级配置

### 自定义 Prompt 模板

如果您想优化 DeepSeek 的输出，可以在代码中修改 Prompt 模板：

**文件**：`sidepanel/sidepanel.js`

**优化建议**：
1. 添加更多中文示例
2. 指定输出格式
3. 明确文档风格要求

### 参数调整

在 `sidepanel.js` 中调整 AI 调用参数：

```javascript
{
  model: config.modelName,
  messages: [...],
  temperature: 0.7,  // 创造性（0-1，DeepSeek推荐0.7）
  max_tokens: 2000   // 最大输出长度
}
```

## API 状态监控

DeepSeek API 状态页面：https://status.deepseek.com/

如果遇到连接问题，可以先检查服务状态。

## 更新日志

**2025-01-18**
- ✅ 移除 API Key "sk-" 前缀强制验证
- ✅ 完全兼容 DeepSeek API
- ✅ 添加 DeepSeek 配置文档

## 相关资源

- **DeepSeek 官网**：https://www.deepseek.com/
- **API 文档**：https://platform.deepseek.com/api-docs/
- **定价**：https://platform.deepseek.com/pricing
- **控制台**：https://platform.deepseek.com/
- **GitHub**：https://github.com/deepseek-ai

## 技术支持

如果遇到 DeepSeek 配置问题：
1. 查看 DeepSeek 官方文档
2. 检查本插件的 Console 日志
3. 尝试测试连接功能
4. 查看 API 使用量和余额

---

**推荐配置** 🎯：
```
API Key: 您的DeepSeek密钥
Base URL: https://api.deepseek.com
模型名称: deepseek-chat
```

**开始享受高性价比的AI文档生成吧！** 💰✨
