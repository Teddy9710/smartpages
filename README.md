# Smart Page Scribe - 智能网页文档助手

一个强大的浏览器插件，能够智能录制用户的网页操作并自动生成专业的文档。

## 📚 文档导航

**快速开始：**
- 📖 [INDEX.md](INDEX.md) - **完整的文档索引（推荐先看）**
- 🚀 [QUICKSTART.md](QUICKSTART.md) - 5分钟快速上手
- 📝 [STEP-BY-STEP.md](STEP-BY-STEP.md) - 详细操作步骤

**配置指南：**
- 🔧 [DEEPSEEK.md](DEEPSEEK.md) - DeepSeek API配置（推荐，高性价比）
- ⚙️ [设置页面](settings/settings.html) - 直接打开配置

**故障排除：**
- 🔍 [INDEX.md](INDEX.md) - 查看所有故障排除文档
- 🚨 [TROUBLESHOOTING.md](TROUBLESHOOTING.md) - 综合故障诊断
- ⚡ [快速修复指南](QUICKFIX-CONNECTION.md) - 连接错误
- ⚡ [快速修复指南](STUCK-ANALYZING.md) - 分析卡住

**开发者：**
- 📋 [CHANGELOG.md](CHANGELOG.md) - 完整的更新日志
- 📄 [prd.md](prd.md) - 产品需求文档

---

## 功能特性

### 1. 智能录制引擎
- 一键开始/停止录制
- 自动捕获点击操作
- 检测单页应用(SPA)的路由跳转
- 每步操作自动截图
- 支持复杂的用户交互流程

### 2. AI智能协作
- **智能意图推测**: AI自动分析您的操作，推测您想要生成的文档类型
- **智能文档生成**: 基于录制内容自动生成结构化的Markdown文档
- 支持自定义大模型API（OpenAI兼容接口）
- 可配置模型参数（Base URL、模型名称等）

### 3. 专业的编辑器
- 实时Markdown预览
- 源码编辑模式
- 一键复制文档
- 导出为Markdown文件

### 4. 灵活的配置
- 安全存储API密钥
- 支持自定义API端点
- 可开关的智能描述功能
- API连接测试

## 安装指南

### 准备工作

1. 准备图标文件（可选）
   - 在 `icons/` 目录下放置以下文件：
     - icon16.png (16x16)
     - icon32.png (32x32)
     - icon48.png (48x48)
     - icon128.png (128x128)
   - 详细说明请参考 `icons/README.md`

2. 准备API密钥
   - OpenAI API: https://platform.openai.com/api-keys
   - 或其他兼容OpenAI格式的API服务

### 安装步骤

#### Chrome/Edge浏览器

1. 下载或克隆本项目到本地
2. 打开浏览器，访问扩展管理页面：
   - Chrome: `chrome://extensions/`
   - Edge: `edge://extensions/`
3. 开启"开发者模式"（右上角开关）
4. 点击"加载已解压的扩展程序"
5. 选择项目的根目录
6. 插件安装完成！

## 使用指南

### 首次配置

1. 点击浏览器工具栏中的插件图标
2. 点击"设置"按钮
3. 填写API配置：
   - **API Key**: 您的OpenAI API密钥（以 sk- 开头）
   - **Base URL**: 可选，默认为 `https://api.openai.com/v1`
   - **模型名称**: 可选，默认为 `gpt-3.5-turbo`
4. 点击"测试连接"验证配置
5. 点击"保存配置"

### 录制操作流程

1. **开始录制**
   - 打开您要录制的网页
   - 点击插件图标，点击"开始录制"
   - 图标变红，表示正在录制

2. **执行操作**
   - 在页面上进行您要记录的操作
   - 每次点击会被自动记录
   - 页面跳转也会被捕获

3. **停止录制**
   - 再次点击插件图标
   - 点击"停止录制"
   - 录制会话自动保存

### 生成文档

1. 停止录制后，侧边栏会自动打开
2. AI会分析您的操作，提供几个可能的文档描述
3. 选择一个描述，或输入自定义描述
4. 点击"生成文档"
5. 等待AI生成完成
6. 在编辑器中预览、编辑、复制或下载文档

### 编辑器功能

- **预览模式**: 查看渲染后的Markdown文档
- **编辑模式**: 直接编辑Markdown源码
- **复制**: 一键复制到剪贴板
- **下载**: 保存为.md文件

## 项目结构

```
smartpages/
├── manifest.json          # 插件配置文件
├── package.json           # 项目信息
├── README.md              # 项目说明
├── prd.md                 # 产品需求文档
├── popup/                 # 弹出窗口
│   ├── popup.html
│   ├── popup.css
│   └── popup.js
├── settings/              # 设置页面
│   ├── settings.html
│   ├── settings.css
│   └── settings.js
├── sidepanel/             # 侧边栏编辑器
│   ├── sidepanel.html
│   ├── sidepanel.css
│   └── sidepanel.js
├── background/            # 后台服务
│   └── background.js
├── content/               # 内容脚本
│   └── recorder.js
└── icons/                 # 图标文件
    └── README.md
```

## 技术栈

- **Manifest V3**: 最新的Chrome扩展API
- **Vanilla JavaScript**: 纯JS实现，无框架依赖
- **Chrome Storage API**: 安全存储配置
- **Chrome Tabs API**: 标签页管理
- **Chrome Side Panel API**: 侧边栏界面
- **Marked.js**: Markdown渲染（通过CDN引入）
- **性能优化**: 包含节流、防抖、异步处理等优化技术

## 开发说明

### 本地开发

1. 克隆项目
2. 准备图标文件
3. 在浏览器中加载插件（开发者模式）
4. 修改代码后，在扩展管理页面点击"重新加载"

### 调试

- **Popup**: 右键点击插件图标 -> "检查弹出内容"
- **Background Script**: 在扩展管理页面点击"service worker"链接
- **Content Script**: 在页面上打开开发者工具
- **Side Panel**: 打开侧边栏后右键 -> "检查"

### 代码规范

- 使用 ES6+ 语法
- 异步操作使用 async/await
- 错误处理使用 try-catch
- 代码注释使用中文

## 常见问题

### Q: 录制时没有反应？
A: 请确保刷新了要录制的页面，content script需要在新加载的页面上注入。

### Q: API调用失败？
A:
1. 检查API Key是否正确
2. 检查Base URL是否可访问
3. 确认API账户有足够的额度
4. 尝试点击"测试连接"

### Q: 生成的文档质量不高？
A:
1. 尝试提供更详细的任务描述
2. 使用更强大的模型（如gpt-4）
3. 在编辑模式下手动调整

### Q: 如何使用其他AI服务？
A: 在设置中修改Base URL，确保服务兼容OpenAI API格式。

## 隐私与安全

- API密钥使用Chrome Storage API加密存储
- 录制数据仅保存在本地，不上传到任何服务器
- 仅在您主动点击"生成文档"时才会调用AI API
- 支持自定义API端点，数据完全由您控制

## 路线图

- [ ] 支持导出为PDF
- [ ] 添加模板系统
- [ ] 支持多语言
- [ ] 添加视频录制功能
- [ ] 云端同步配置
- [ ] 团队协作功能

## 贡献指南

欢迎提交Issue和Pull Request！

1. Fork本项目
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启Pull Request

## 许可证

MIT License

## 联系方式

如有问题或建议，欢迎通过GitHub Issues联系。

---

**享受智能文档生成的便利！** 📝✨
