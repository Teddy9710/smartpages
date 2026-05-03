# Smart Page Scribe - 智能网页文档助手

<p align="center">
  <strong>一键录制网页操作，AI 自动生成专业文档</strong>
</p>

---

## ✨ 功能特性

### 🎬 智能录制引擎
- 一键开始/停止录制，自动捕获点击操作
- 检测 SPA 路由跳转，支持复杂交互流程
- 每步操作自动截图，完整记录操作过程

### 🤖 AI 智能协作
- **智能意图推测**：AI 自动分析操作，推测文档类型
- **智能文档生成**：基于录制内容自动生成结构化 Markdown 文档
- 支持自定义大模型 API（OpenAI 兼容接口，如 DeepSeek）

### 📝 专业编辑器
- 实时 Markdown 预览 + 源码编辑模式
- 一键复制 / 导出为 Markdown 文件

### 📂 文档上传与管理
- 多格式支持（PDF、DOCX、TXT、MD）
- GitHub 云端上传 + 本地安全存储
- 全文搜索 + 文档版本管理
- RESTful API + CLI 接口

### 🔒 安全
- Content Security Policy (CSP) 防护
- API 密钥 Chrome Storage 加密存储
- 所有动态内容通过 `createElement` 安全渲染（XSS 防护）
- 第三方库本地打包，无外部 CDN 依赖

---

## 🚀 安装

### 前置要求
- Chrome / Edge 浏览器
- OpenAI 兼容的 API 密钥（推荐 [DeepSeek](https://platform.deepseek.com)，高性价比）

### 安装步骤

1. **克隆项目**
   ```bash
   git clone https://github.com/Teddy9710/smartpages.git
   cd smartpages
   ```

2. **（可选）使用构建工具**
   ```bash
   npm install
   npm run build    # 输出到 dist/
   ```

3. **加载扩展**
   - 打开 `chrome://extensions/`（或 `edge://extensions/`）
   - 开启「开发者模式」
   - 点击「加载已解压的扩展程序」
   - 选择项目根目录（或 `dist/` 目录）

4. **配置 API**
   - 点击扩展图标 → 设置
   - 填写 API Key、Base URL、模型名称
   - 点击「测试连接」验证

---

## 🎯 使用指南

### 录制操作流程

1. 打开目标网页 → 点击扩展图标 → **开始录制**
2. 在页面上执行操作（点击、跳转等会被自动记录）
3. 完成后点击 → **停止录制**

### 生成文档

1. 停止录制后侧边栏自动打开
2. AI 分析操作并提供文档描述建议
3. 选择描述（或自定义） → 点击「生成文档」
4. 预览、编辑、复制或下载

---

## 📁 项目结构

```
smartpages/
├── manifest.json           # Manifest V3 配置
├── vite.config.js          # Vite 构建配置
├── tsconfig.json           # TypeScript 配置（渐进迁移）
├── .eslintrc.json          # ESLint 配置
├── .prettierrc             # Prettier 配置
├── @types/global.d.ts      # 类型定义
├── libs/                   # 第三方库（本地打包）
│   └── marked.min.js
├── popup/                  # 弹出窗口
├── sidepanel/              # 侧边栏编辑器
├── settings/               # 设置页面
├── background/             # Service Worker
├── content/                # 内容脚本（录制器）
├── utils/                  # 共享工具库
│   ├── common.js           # 通用函数 & 常量
│   ├── documentUpload.js   # 文档上传
│   ├── documentApi.js      # API 客户端
│   └── codeUtils.js        # 代码工具
├── upload/                 # 文档上传管理
├── skills/                 # 技能模块
├── icons/                  # 图标资源
├── styles/                 # 全局样式
└── docs/                   # 模拟 & 文档
```

---

## 🛠️ 技术栈

| 类别 | 技术 |
|------|------|
| 扩展标准 | Chrome Extension Manifest V3 |
| 前端 | Vanilla JavaScript (ES2022) |
| Markdown 渲染 | Marked.js（本地打包） |
| 存储 | Chrome Storage API (加密) |
| 构建 | Vite + vite-plugin-static-copy |
| 类型检查 | TypeScript (allowJs, 渐进迁移) |
| 代码规范 | ESLint + Prettier |
| 包管理 | npm |

---

## 💻 开发

### 可用命令

```bash
npm install          # 安装依赖
npm run dev          # 开发模式（watch）
npm run build        # 生产构建 → dist/
npm run lint         # 代码检查
npm run lint:fix     # 自动修复
npm run typecheck    # TypeScript 类型检查
```

### 调试

- **Popup**：右键扩展图标 → 检查弹出内容
- **Background**：扩展管理页 → 点击 service worker
- **Content Script**：页面开发者工具
- **Side Panel**：侧边栏右键 → 检查

### 代码规范

- ES6+ 语法，async/await 异步模式
- 所有 DOM 操作使用 `createElement()`，禁止 `innerHTML` 拼接用户数据
- 配置项提取为常量（`utils/common.js`）
- 中文注释

---

## 📚 文档导航

| 文档 | 说明 |
|------|------|
| [QUICKSTART.md](QUICKSTART.md) | 5 分钟快速上手 |
| [STEP-BY-STEP.md](STEP-BY-STEP.md) | 详细操作步骤 |
| [DEEPSEEK.md](DEEPSEEK.md) | DeepSeek API 配置指南 |
| [TROUBLESHOOTING.md](TROUBLESHOOTING.md) | 故障诊断 |
| [CHANGELOG.md](CHANGELOG.md) | 更新日志 |
| [prd.md](prd.md) | 产品需求文档 |
| [TESTING.md](TESTING.md) | 测试指南 |

---

## 🔐 安全特性

- ✅ **CSP 配置**：`script-src 'self'` 禁止内联脚本和外部加载
- ✅ **XSS 防护**：所有动态内容通过 `createElement` / `safeSetInnerHTML` 渲染
- ✅ **本地依赖**：第三方库全部本地打包，无运行时 CDN 请求
- ✅ **存储空间监控**：自动检测 Chrome Storage 用量，接近上限时预警
- ✅ **加密存储**：API 密钥通过 Chrome Storage API 加密保存

---

## ❓ 常见问题

**Q: 录制时没有反应？**
刷新目标页面，content script 需要重新注入。

**Q: API 调用失败？**
检查 API Key、Base URL 可达性、账户额度，使用「测试连接」功能排查。

**Q: 生成文档质量不高？**
提供更详细的任务描述，或切换更强模型（如 GPT-4）。

**Q: 如何使用其他 AI 服务？**
设置中修改 Base URL，确保兼容 OpenAI API 格式即可。

---

## 🗺️ 路线图

- [ ] 支持导出为 PDF
- [ ] 添加文档模板系统
- [ ] 多语言支持（i18n）
- [ ] 视频录制功能
- [ ] 云端配置同步
- [ ] 团队协作功能
- [ ] 完全迁移至 TypeScript

---

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

1. Fork 本项目
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

## 📄 许可证

[MIT License](LICENSE)

---

**享受智能文档生成的便利！** 📝✨
