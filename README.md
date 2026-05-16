# Smart Page Scribe

[English](README.en.md)

<p align="center">
  <img src="icons/icon128.png" width="96" height="96" alt="Smart Page Scribe icon">
</p>

<p align="center">
  <strong>浏览器操作录制 + AI 文档生成助手</strong><br>
  记录网页操作流程，自动生成可直接编辑、可优化、可导出的操作文档。
</p>

<p align="center">
  <img alt="Chrome Extension MV3" src="https://img.shields.io/badge/Chrome%20Extension-MV3-2563eb">
  <img alt="Vanilla JavaScript" src="https://img.shields.io/badge/JavaScript-ES2022-f7df1e">
  <img alt="Markdown HTML" src="https://img.shields.io/badge/Export-Markdown%20%2F%20HTML-14b8a6">
  <img alt="License" src="https://img.shields.io/badge/License-MIT-111827">
</p>

---

## 项目简介

Smart Page Scribe 是一个浏览器扩展，用来把真实网页操作流程转换为结构化文档。它适合测试、实施、产品、客服、运维，以及任何经常需要编写“如何操作”文档的人。

扩展会记录点击、输入、页面跳转等关键步骤，并为每一步保留截图。录制结束后，它会调用 OpenAI-compatible Chat Completions API 生成 Markdown 文档。用户可以在侧边栏中直接编辑预览内容，也可以切换到 Markdown 源码编辑、AI 二次优化、回退、复制、下载 Markdown，或导出独立 HTML。

---

## 界面一览

<p align="center">
  <img src="docs/assets/readme-hero.png" width="760" alt="Smart Page Scribe product preview">
</p>

| 页面 | 作用 |
| --- | --- |
| Popup 弹窗 | 开始录制、停止录制、查看录制状态、打开文档助手 |
| Side Panel 文档助手 | 选择文档类型、生成文档、直接编辑预览、编辑 Markdown、AI 优化、回退、导出 |
| Settings 设置页 | 配置模型服务商、API Key、Base URL、模型名、Token、提示词、风格指南和示例文档 |
| Content Script | 注入目标网页，采集用户操作和截图 |
| Background Service Worker | 管理录制会话、消息转发、截图和脚本注入 |

---

## 核心功能

### 1. 网页操作录制

- 一键开始或停止录制。
- 自动记录点击、输入、路由变化等操作。
- 每个步骤可关联页面截图。
- Content Script 未注入时自动补注入，减少手动刷新页面的打断。

### 2. AI 文档生成

- 根据录制步骤生成 Markdown 文档。
- 支持用户指南、教程文档、测试用例、问题报告等文档类型。
- 支持追加要求或完全自定义提示词。
- 支持风格指南，让生成内容遵循固定语气、结构、标题层级和写作规范。
- 支持按文档类型配置示例文档，让模型参考示例的结构和颗粒度，但不照抄示例事实。
- 支持配置最大输出 Token，减少长文档被截断的概率。

### 3. 文档编辑与导出

- 生成后可在预览区直接修改，不需要先点击编辑按钮。
- 支持 Markdown 预览和源码编辑双模式。
- 一键复制 Markdown。
- 下载 Markdown 文件。
- 导出独立 HTML 文件。
- AI 二次优化：输入优化要求后重新润色文档。
- 支持回退到 AI 优化前版本。

### 4. 模型服务配置

- 设置页提供常见模型服务商下拉选项。
- 选择服务商后自动填入推荐 Base URL 和模型名。
- Base URL 仍支持手动输入，兼容 OpenAI-compatible API。
- 根据当前服务商显示对应 API Key 获取入口。

### 5. 文档资源管理

- 支持上传和管理 PDF、DOCX、TXT 等文档资源。
- 支持搜索、刷新、删除等基础管理操作。
- 相关逻辑位于 `utils/documentUpload.js`、`utils/documentApi.js`、`utils/docUIUtils.js`。

---

## 工作流程

```mermaid
flowchart LR
  A["打开目标网页"] --> B["点击扩展并开始录制"]
  B --> C["记录操作和截图"]
  C --> D["停止录制"]
  D --> E["选择文档类型或自定义目标"]
  E --> F["调用模型生成 Markdown"]
  F --> G["预览直接编辑 / 源码编辑 / AI 优化"]
  G --> H["复制 Markdown"]
  G --> I["下载 .md"]
  G --> J["导出 .html"]
```

---

## 架构概览

```mermaid
flowchart TB
  subgraph Extension["浏览器扩展"]
    Popup["popup/\n录制入口"]
    SidePanel["sidepanel/\n文档助手"]
    Settings["settings/\n配置中心"]
    Background["background/\nService Worker"]
    Content["content/\n页面录制脚本"]
    Utils["utils/\n公共能力"]
  end

  Page["目标网页"] <--> Content
  Popup <--> Background
  SidePanel <--> Background
  Settings <--> Utils
  Background <--> Content
  SidePanel --> Utils
  Utils --> Storage["Chrome Storage"]
  SidePanel --> LLM["OpenAI-Compatible\n/chat/completions API"]
```

---

## 支持的模型 API

项目按 OpenAI-compatible Chat Completions 格式调用模型接口：

```text
POST {Base URL}/chat/completions
```

只要服务商兼容这个请求格式，通常都可以通过设置页配置。

| 配置项 | 说明 | 示例 |
| --- | --- | --- |
| 模型服务商 | 常见 API 预设，也可选择自定义 | OpenAI、DeepSeek、Kimi、OpenRouter |
| API Key | 模型服务密钥 | `sk-...` |
| Base URL | API 基础地址 | `https://api.openai.com/v1` |
| 模型名 | Chat Completions 模型名称 | `gpt-4o-mini`、`deepseek-chat` |
| 最大输出 Token | 控制生成文档长度 | `4000` |
| 提示词模式 | 追加要求或完全自定义 | 默认提示词 + 我的要求 |
| 风格指南 | 固定写作规范 | 标题层级、语气、术语、禁用表达 |
| 示例文档 | 按文档类型提供参考样例 | 用户指南、教程、测试用例、问题报告 |

注意：不同服务商的模型名、Base URL、上下文长度和计费规则不同，请以对应服务商文档为准。

---

## 生成文档格式

| 格式 | 用途 | 当前支持 |
| --- | --- | --- |
| Markdown `.md` | 默认生成格式，方便编辑和复制 | 支持 |
| HTML `.html` | 独立页面，方便交付或浏览器打开 | 支持 |
| PDF `.pdf` | 固定版式交付 | 暂未内置，可先导出 HTML 后用浏览器打印为 PDF |

---

## 安装使用

### 方式一：直接加载源码目录

适合只想使用扩展、不关心构建流程的场景。

1. 下载或克隆本项目。
2. 打开 Chrome/Edge 的扩展管理页：
   - Chrome: `chrome://extensions/`
   - Edge: `edge://extensions/`
3. 开启“开发者模式”。
4. 点击“加载已解压的扩展程序”。
5. 选择项目根目录 `smartpages/`。

### 方式二：构建后加载 `dist/`

适合开发、发布或确认打包产物的场景。

```bash
npm install
npm run build
```

然后在扩展管理页加载 `dist/` 目录。

---

## 快速上手

1. 打开设置页，选择模型服务商，填写 API Key、Base URL 和模型名。
2. 点击“测试连接”，确认模型 API 可用。
3. 如有固定规范，在设置页填写风格指南或示例文档。
4. 打开需要记录流程的网页。
5. 点击扩展图标，开始录制。
6. 在网页上完成操作流程。
7. 停止录制，进入侧边栏。
8. 选择推荐的文档目标，或输入自定义描述。
9. 生成文档后直接在预览区修改，也可以切换源码编辑、AI 优化或导出。

---

## 项目结构

```text
smartpages/
├── manifest.json              # Chrome Extension Manifest V3 配置
├── popup/                     # 扩展弹窗：开始/停止录制
├── sidepanel/                 # 文档助手：生成、预览、编辑、导出
├── settings/                  # 设置页：模型、提示词、风格指南、示例文档
├── background/                # Service Worker：会话、截图、消息转发
├── content/                   # Content Script：网页操作录制
├── utils/                     # 通用工具、配置、文档上传 API/UI 工具
├── styles/                    # 共享样式变量
├── libs/                      # 本地第三方库，例如 marked.js
├── icons/                     # 扩展图标
├── upload/                    # 文档上传相关扩展模块
├── docs/                      # 文档、素材和测试资料
├── scripts/                   # 构建辅助脚本
├── validate.js                # JS 语法校验脚本
└── vite.config.js             # 构建配置
```

---

## 主要命令

```bash
npm run build       # 生成 dist/ 扩展目录
npm run dev         # watch 模式构建
npm run lint        # ESLint 检查
npm run lint:fix    # 自动修复可修复问题
npm run typecheck   # TypeScript 类型检查
node validate.js    # 核心 JS 文件语法校验
```

---

## 安全与隐私

- API Key 存储在 Chrome Storage 中。
- 扩展页面启用 CSP，禁止外部脚本直接注入。
- 第三方库本地打包，避免运行时依赖 CDN。
- 生成提示词会要求对密码、Token、手机号、身份证号等敏感内容进行遮蔽。
- 文档渲染使用受控方式处理动态内容，降低 XSS 风险。

---

## 当前状态

| 模块 | 状态 |
| --- | --- |
| 操作录制 | 可用 |
| 截图采集 | 可用 |
| AI 文档生成 | 可用 |
| 风格指南和示例文档 | 可用 |
| 模型服务商下拉和自定义 Base URL | 可用 |
| 预览区直接编辑 | 可用 |
| Markdown 导出 | 可用 |
| HTML 导出 | 可用 |
| AI 二次优化与回退 | 可用 |
| 文档上传管理 | 可用 |
| PDF 直接导出 | 规划中 |

---

## 开发建议

- 修改 UI 后运行 `npm run build`。
- 修改 JS 后运行 `node validate.js` 和 `npm run typecheck`。
- 录制相关问题优先检查 `background/background.js` 与 `content/recorder.js`。
- 文档生成质量优先调整 `utils/common.js` 中的默认提示词和 `sidepanel/sidepanel.js` 中的文档类型说明。
- 设置页字段变更需要同步 `settings/settings.html`、`settings/settings.js` 和 `utils/common.js`。

---

## License

[MIT License](LICENSE)
