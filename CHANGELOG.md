# 更新日志 (Changelog)

所有值得注意的项目更改都将记录在此文件中。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)，
本项目遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [1.0.0] - 2025-01-18

### Added
- ✨ 智能录制引擎 - 自动捕获用户操作（点击、页面跳转）
- ✨ 自动截图功能 - 每步操作自动捕获视觉信息
- ✨ AI智能分析 - 自动推测用户意图，生成任务描述
- ✨ Markdown文档生成 - 基于录制内容自动生成结构化文档
- ✨ 内置Markdown解析器 - 无需外部依赖，支持常用Markdown语法
- ✨ 多AI服务商支持 - 兼容OpenAI、DeepSeek等API
- ✨ 配置管理系统 - 安全存储API配置，支持测试连接
- ✨ 侧边栏编辑器 - 实时预览、编辑、复制、导出功能
- ✨ 描述智能解析 - 支持多种AI返回格式
- ✨ 30秒超时控制 - 避免API调用永久挂起
- ✨ 错误降级策略 - AI失败时自动使用默认选项
- ✨ 详细调试日志 - 便于问题排查

### Changed
- 🔧 移除外部CDN依赖 - 使用内置Markdown解析器替代marked.js
- 🔧 改进状态管理 - Popup状态实时同步
- 🔧 优化错误提示 - 更友好的用户提示信息

### Fixed
- 🐛 修复API配置保存失败 - chrome.storage API调用方式错误
- 🐛 修复Side Panel打开失败 - 缺少必需的windowId参数
- 🐛 修复AI分析卡住问题 - 添加30秒超时控制
- 🐛 修复CSP违规错误 - 移除外部脚本引用
- 🐛 修复返回值解析错误 - 添加智能文本解析器
- 🐛 修复Content Script连接错误 - 添加页面验证和刷新提示
- 🐛 修复侧边栏空状态问题 - 改进session检查逻辑
- 🐛 修复Popup状态不更新 - 添加手动刷新机制
- 🐛 修复特殊页面录制问题 - 添加页面类型检查
- 🐛 修复URL格式问题 - 自动清理多余的斜杠

### Security
- 🔒 API密钥安全存储 - 使用Chrome Storage API加密
- 🔒 API密钥脱敏显示 - 保护用户隐私
- 🔒 CSP合规 - 移除所有外部脚本引用

---

## 详细修复记录

### v1.0.0 - 2025-01-18 (Initial Release)

#### Bug Fixes

**1. API配置保存失败**
- **问题**: TypeError: Cannot read properties of undefined (reading 'local')
- **原因**: chrome.storage API在options_page中需要回调式Promise包装
- **影响**: settings/settings.js, sidepanel/sidepanel.js, background/background.js
- **解决**: 使用回调方式包装chrome.storage.local.get/set调用
- **文件**: BUGFIX-2025-01-18.md

**2. Side Panel打开失败**
- **问题**: TypeError: No matching signature for sidePanel.open()
- **原因**: 缺少必需的windowId参数
- **影响**: popup/popup.js
- **解决**: 添加windowId参数：`chrome.sidePanel.open({ windowId: currentWindow.id })`
- **文件**: BUGFIX-SIDEPANEL-2025-01-18.md

**3. AI分析永久卡住**
- **问题**: 停止录制后一直显示"正在分析操作..."
- **原因**:
  - 网络请求没有超时控制
  - 错误处理不完善
  - URL格式可能错误
- **影响**: sidepanel/sidepanel.js
- **解决**:
  - 添加30秒AbortController超时
  - 改进URL处理（移除多余斜杠）
  - 添加详细错误日志
- **文件**: BUGFIX-TIMEOUT-2025-01-18.md

**4. CSP违规错误**
- **问题**: Refused to load script from CDN (violates CSP directive)
- **原因**: 从外部CDN加载marked.js违反内容安全策略
- **影响**: sidepanel/sidepanel.html
- **解决**: 移除外部CDN依赖，实现内置Markdown解析器
- **新增功能**: 支持#、##、###、**、*、`、-、1.、[]()、![]()等Markdown语法
- **文件**: BUGFIX-CSP-2025-01-18.md

**5. AI返回值解析错误**
- **问题**: TypeError: this.generatedDescriptions.forEach is not a function
- **原因**: AI返回文本字符串，代码直接当作数组使用
- **影响**: sidepanel/sidepanel.js
- **解决**: 添加parseDescriptions()方法，智能解析多种返回格式
- **支持格式**: 数字序号(1.)、短横线(-)、圆点(•)、纯文本
- **文件**: BUGFIX-CSP-2025-01-18.md

**6. Content Script连接失败**
- **问题**: Could not establish connection. Receiving end does not exist
- **原因**: Content Script未注入（页面未刷新）
- **影响**: background/background.js, popup/popup.js
- **解决**:
  - 添加页面类型验证（chrome://、edge://等）
  - 改进错误提示（提示用户刷新页面）
  - 添加tab可访问性检查
- **文件**: BUGFIX-CONNECTION-2025-01-18.md, QUICKFIX-CONNECTION.md

**7. 侧边栏显示空状态**
- **问题**: 点击"打开编辑器"后显示"欢迎使用智能文档助手"
- **原因**: checkExistingSession()检查方式错误
- **影响**: sidepanel/sidepanel.js
- **解决**: 改用GET_RECORDING_STATE并验证session数据
- **文件**: QUICKFIX-EDITOR.md

**8. Popup状态不更新**
- **问题**: 点击"停止录制"后UI不变
- **原因**: 没有等待响应和刷新状态
- **影响**: popup/popup.js
- **解决**:
  - 添加按钮状态控制（禁用、显示文字）
  - 等待响应后手动刷新状态
  - 添加详细调试日志
- **文件**: popup/popup.js

**9. API Key验证过于严格**
- **问题**: 非sk-开头的API Key（如DeepSeek）被拒绝
- **原因**: 强制要求sk-前缀
- **影响**: settings/settings.js
- **解决**: 改为长度验证（>10字符），兼容所有API提供商
- **文件**: settings/settings.js

#### Features

**1. 智能录制引擎**
- 自动捕获点击事件（通过事件监听）
- 生成元素选择器（XPath/CSS）
- 检测SPA路由跳转（hashchange、popstate、pushState）
- 每步自动截图（captureVisibleTab）
- 会话数据打包（sessionId、时间戳、页面信息）

**2. AI智能协作中心**
- 阶段一：意图推测（专用Prompt模板A）
- 阶段二：文档生成（专用Prompt模板B）
- 支持自定义Base URL和模型名称
- 错误降级策略（失败时使用默认选项）
- 30秒超时保护

**3. 文档编辑器**
- 实时Markdown预览
- 源码编辑模式
- 一键复制到剪贴板
- 导出为.md文件
- 内置轻量级Markdown解析器

**4. 配置管理**
- 图形化配置界面
- API密钥脱敏显示
- 连接测试功能
- 配置持久化存储
- 智能描述开关

**5. 多AI服务商支持**
- ✅ OpenAI (https://api.openai.com/v1)
- ✅ DeepSeek (https://api.deepseek.com)
- ✅ 任何兼容OpenAI格式的API
- 完整的DeepSeek配置指南（DEEPSEEK.md）

#### Improvements

**1. 用户体验**
- 点击视觉反馈（红色波纹动画）
- 加载状态提示
- 友好的错误消息
- 通知提示系统（showNotification）

**2. 开发体验**
- 详细的Console日志（[Popup]、[SidePanel]、[Background]前缀）
- API测试工具（quick-api-test.html）
- 诊断工具（diagnostic-tool.js）
- 完整的文档体系

**3. 代码质量**
- 模块化架构（Popup、SidePanel、Background、Content Script分离）
- 异步错误处理
- Promise包装的chrome.storage调用
- 状态管理集中化

#### Documentation

**用户文档**
- README.md - 项目介绍和功能说明
- QUICKSTART.md - 快速开始指南
- STEP-BY-STEP.md - 详细操作步骤
- TESTING.md - 完整测试指南
- DEEPSEEK.md - DeepSeek配置指南

**故障排除**
- TROUBLESHOOTING.md - 故障诊断指南
- BUGFIX-2025-01-18.md - Storage API修复
- BUGFIX-SIDEPANEL-2025-01-18.md - Side Panel修复
- BUGFIX-TIMEOUT-2025-01-18.md - 超时控制修复
- BUGFIX-CSP-2025-01-18.md - CSP和解析修复
- QUICKFIX-CONNECTION.md - 连接错误修复
- QUICKFIX-EDITOR.md - 编辑器空状态修复
- STUCK-ANALYZING.md - 分析卡住解决方案

**开发文档**
- prd.md - 产品需求文档
- manifest.json - Chrome扩展配置
- package.json - 项目元信息

**工具**
- test.sh / test.bat - 项目完整性检查脚本
- quick-api-test.html - API连接测试工具
- diagnostic-tool.js - 诊断脚本
- icons/placeholder.html - 图标生成器

---

## 技术栈

### 前端
- Vanilla JavaScript (ES6+)
- CSS3 (渐变、动画、Flexbox)
- HTML5
- Chrome Extension Manifest V3

### Chrome APIs
- chrome.storage.local - 配置存储
- chrome.tabs - 标签页管理
- chrome.runtime - 消息传递
- chrome.windows - 窗口管理
- chrome.sidePanel - 侧边栏
- chrome.notifications - 系统通知
- permissions: storage, tabs, notifications, sidePanel, activeTab

### 架构模式
- Service Worker (Background)
- Content Script (页面注入)
- Options Page (设置)
- Popup (弹出窗口)
- Side Panel (侧边栏)

---

## 已知问题

### 限制
1. **Content Script注入**: 页面必须在插件加载后刷新才能注入
2. **特殊页面**: 无法在chrome://、edge://等系统页面录制
3. **单次录制**: 同时只能进行一个录制任务
4. **截图限制**: 只能捕获可见区域

### 未来计划
- [ ] 支持多标签页同时录制
- [ ] 添加视频录制功能
- [ ] 支持导出为PDF
- [ ] 添加模板系统
- [ ] 支持多语言界面
- [ ] 云端同步配置
- [ ] 团队协作功能

---

## 浏览器兼容性

### 已测试
- ✅ Chrome 120+
- ✅ Edge 120+

### 理论支持
- ⚠️ Chromium-based browsers (Brave, Opera等)
- ❌ Firefox (需要重写为WebExtensions)
- ❌ Safari (需要重写为Safari Web Extensions)

---

## 贡献者

- 开发：Claude (Anthropic)
- 测试：用户反馈

---

## 许可证

MIT License - 详见 LICENSE 文件

---

## 致谢

感谢以下资源和工具：
- [Chrome Extension Documentation](https://developer.chrome.com/docs/extensions/)
- [Marked.js](https://marked.js.org/) (Markdown解析参考)
- [DeepSeek](https://www.deepseek.com/) (AI服务)
- [OpenAI](https://openai.com/) (AI服务)

---

**最后更新**: 2025-01-18
