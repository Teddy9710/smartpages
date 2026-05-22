# SmartPages - 代码结构文档

## 项目概述

**SmartPages（智能网页文档助手）** 是一个 Chrome 浏览器扩展，能够智能录制用户的网页操作并自动生成结构化的 Markdown 文档。

### 核心功能

1. **操作录制** - 自动捕获用户在网页上的点击、导航等操作
2. **AI 智能分析** - 基于大语言模型智能推测用户意图并生成文档
3. **实时截图** - 在每步操作时自动截取页面截图
4. **文档编辑** - 提供 Markdown 编辑器和预览功能
5. **多 API 支持** - 支持 OpenAI、DeepSeek 等兼容 OpenAI API 格式的服务

### 技术栈

- **平台**: Chrome Extension Manifest V3
- **语言**: Vanilla JavaScript (ES6+)
- **存储**: Chrome Storage API
- **AI 集成**: OpenAI API 兼容接口
- **UI**: HTML + CSS (原生)

---

## 目录结构

```
smartpages/
├── background/              # 后台服务工作目录
│   └── background.js        # Service Worker（核心逻辑）
├── content/                 # 内容脚本目录
│   └── recorder.js          # 页面操作录制脚本
├── popup/                   # 弹出面板目录
│   ├── popup.html           # 弹出面板UI
│   ├── popup.css            # 弹出面板样式
│   └── popup.js             # 弹出面板逻辑
├── sidepanel/               # 侧边栏目录
│   ├── sidepanel.html       # 侧边栏UI
│   ├── sidepanel.css        # 侧边栏样式
│   └── sidepanel.js         # 侧边栏逻辑（AI分析、文档生成）
├── settings/                # 设置页面目录
│   ├── settings.html        # 设置页面UI
│   ├── settings.css         # 设置页面样式
│   └── settings.js          # 设置页面逻辑
├── icons/                   # 图标资源目录
│   ├── icon16.png
│   ├── icon32.png
│   ├── icon48.png
│   ├── icon128.png
│   └── placeholder.html
├── libs/                    # 外部库目录（当前为空）
├── skills/                  # 自定义技能目录
│   └── code-structure-docs/ # 代码结构文档生成技能
│       ├── prompt.md        # 技能提示词
│       ├── skill.json       # 技能配置
│       └── README.md        # 技能说明
├── manifest.json            # 扩展清单文件
├── package.json             # NPM 配置文件
└── prd.md                   # 产品需求文档
```

---

## 核心模块详解

### 1. Background Service Worker (`background/background.js`)

**职责**: 扩展的核心控制器，管理录制状态和会话数据

#### 核心类: RecordingManager

```javascript
class RecordingManager {
  // 状态管理
  state: 'idle' | 'recording' | 'stopped'
  currentSession: Object     // 当前录制会话
  tabId: number              // 当前标签页ID

  // 主要方法
  async startRecording(tabId)      // 开始录制
  async stopRecording()            // 停止录制
  async resetRecording()           // 重置录制
  async addStep(step)              // 添加操作步骤
  async triggerAIAnalysis()        // 触发AI分析
}
```

#### 消息处理

| 消息类型 | 参数 | 返回值 | 说明 |
|---------|------|--------|------|
| `GET_RECORDING_STATE` | - | `{state, stepCount, session}` | 获取录制状态 |
| `START_RECORDING` | `{tabId}` | `{success}` | 开始录制 |
| `STOP_RECORDING` | - | `{success, session}` | 停止录制 |
| `RESET_RECORDING` | - | `{success}` | 重置录制 |
| `ADD_STEP` | `{step}` | `{success}` | 添加操作步骤 |
| `GET_SESSION` | - | `session` | 获取当前会话 |

**关键功能**:
- 验证页面可访问性（排除 chrome:// 等特殊页面）
- 自动截图捕获
- 会话数据打包
- 与 content script 和 popup 的消息通信

---

### 2. Content Script (`content/recorder.js`)

**职责**: 注入到网页中，监听和记录用户操作

#### 主要功能

1. **点击事件记录**
   - 监听全局点击事件（捕获阶段）
   - 生成元素选择器（CSS Selector / XPath）
   - 提取元素文本内容
   - 记录点击坐标
   - 防抖处理（500ms内同一元素不重复记录）

2. **导航事件记录**
   - 监听 `hashchange` 事件
   - 监听 `popstate` 事件
   - 劫持 `history.pushState` 和 `history.replaceState`

3. **视觉反馈**
   - 点击时显示红色波纹动画

#### 数据结构

```javascript
// 点击步骤
{
  type: 'click',
  timestamp: number,
  selector: string,        // CSS选择器
  tagName: string,
  text: string,
  x: number,
  y: number,
  screenshot: string       // Base64截图
}

// 导航步骤
{
  type: 'navigate',
  timestamp: number,
  from: string,
  to: string,
  screenshot: string
}
```

#### 消息监听

| 消息类型 | 说明 |
|---------|------|
| `START_LISTENING` | 开始监听操作 |
| `STOP_LISTENING` | 停止监听操作 |
| `IS_LISTENING` | 查询监听状态 |

---

### 3. Popup (`popup/`)

**职责**: 提供录制控制的快捷入口

#### 核心类: PopupManager

```javascript
class PopupManager {
  async init()                        // 初始化
  async refreshState()                // 刷新状态
  updateState(state)                  // 更新UI状态
  async startRecording()              // 开始录制
  async stopRecording()               // 停止录制
  async openEditor()                  // 打开侧边栏编辑器
  async newRecording()                // 新建录制
  openSettings()                      // 打开设置页面
}
```

#### UI 状态

| 状态 | 显示内容 |
|-----|---------|
| `idle` | "开始录制" 按钮 |
| `recording` | "🔴 录制中 (X步)" 和 "停止录制" 按钮 |
| `stopped` | "录制已停止"、"总步骤数" 和 "打开编辑器" 按钮 |

---

### 4. Side Panel (`sidepanel/`)

**职责**: AI 分析和文档生成的主要界面

#### 核心类: SidePanelManager

```javascript
class SidePanelManager {
  // 会话管理
  currentSession: Object
  config: Object
  generatedDescriptions: string[]
  selectedDescription: string
  generatedDocument: string

  // 主要方法
  async handleAIAnalysis(session, config)    // 处理AI分析请求
  async generateDescriptions()               // 生成任务描述
  async generateDocument()                   // 生成文档
  buildIntentPrompt()                       // 构建意图推测Prompt
  buildDocumentPrompt(description)          // 构建文档生成Prompt
  async callAI(prompt, config)              // 调用AI API
  updatePreview()                           // 更新Markdown预览
  parseMarkdown(text)                       // 简单的Markdown解析器
  async copyToClipboard()                   // 复制到剪贴板
  downloadFile()                            // 下载文件
}
```

#### 界面视图

| 视图 | 说明 |
|-----|------|
| `empty-state` | 空状态提示 |
| `loading-state` | 加载中提示 |
| `error-state` | 错误提示 |
| `description-selector` | AI 生成的描述选择器 |
| `document-editor` | 文档编辑器（预览/编辑模式） |

#### AI Prompt 模板

**意图推测 Prompt** (`buildIntentPrompt`):
```
你是一个用户意图分析助手。根据以下用户在网页上的操作序列，
推测其最可能想要记录的文档任务。

操作总结：用户在页面【{pageTitle}】上，进行了 {N} 步操作。
第一步是【{firstStep}】，最后一步是【{lastStep}】。

请生成1到3个最可能、最简洁的任务描述，每个描述应像一个文章标题
或具体指令，例如"创建XX功能的配置教程"、"记录YY数据的查询过程"。

直接以清晰的列表形式返回，每行一个描述，不要额外解释，
不要使用markdown格式。
```

**文档生成 Prompt** (`buildDocumentPrompt`):
```
你是一个专业的文档工程师。请根据以下用户操作序列和任务描述，
生成一份详细的步骤指南。

## 任务描述
{description}

## 操作环境
页面：{pageTitle} ({pageUrl})
操作时间：{startTime}
总步骤数：{stepCount}

## 详细操作步骤
{steps}

## 生成要求
1. 使用清晰中文撰写，格式为Markdown。
2. 为每个关键步骤创建二级标题。
3. 在每一步中，用括号注明操作细节。
4. 添加必要的说明和提示。
5. 在文档末尾添加"注意事项"章节。
6. 使用标准的Markdown语法。
```

---

### 5. Settings (`settings/`)

**职责**: API 配置和管理

#### 核心类: SettingsManager

```javascript
class SettingsManager {
  config: {
    apiKey: string,
    baseUrl: string,
    modelName: string,
    smartDescription: boolean
  }

  async loadConfig()              // 加载配置
  populateForm()                  // 填充表单
  async saveConfig()              // 保存配置
  async testConnection()          // 测试API连接
  maskApiKey(apiKey)              // API Key脱敏
  toggleApiKeyVisibility()        // 切换API Key显示/隐藏
}
```

#### 配置项

| 字段 | 类型 | 默认值 | 说明 |
|-----|------|--------|------|
| `apiKey` | string | - | API 密钥 |
| `baseUrl` | string | `https://api.openai.com/v1` | API 基础URL |
| `modelName` | string | `gpt-3.5-turbo` | 模型名称 |
| `smartDescription` | boolean | `true` | 是否启用智能描述 |

#### 安全特性

- API Key 存储在 `chrome.storage.local`（加密存储）
- UI 中显示脱敏后的 API Key（仅显示前7位和后4位）
- 提供"显示/隐藏"切换功能

---

## 数据流

### 1. 录制流程

```
用户点击Popup"开始录制"
    ↓
Background: startRecording()
    ↓
Content Script: START_LISTENING
    ↓
用户操作页面
    ↓
Content Script: 捕获点击/导航
    ↓
Content Script: ADD_STEP → Background
    ↓
Background: addStep() + 截图
    ↓
用户点击"停止录制"
    ↓
Background: stopRecording()
    ↓
Background: triggerAIAnalysis() → SidePanel
```

### 2. AI 分析流程

```
Background: triggerAIAnalysis()
    ↓
SidePanel: handleAIAnalysis()
    ↓
SidePanel: generateDescriptions()
    ↓
构建意图推测Prompt
    ↓
调用 AI API
    ↓
解析返回的描述列表
    ↓
显示描述选择器UI
```

### 3. 文档生成流程

```
用户选择/输入描述
    ↓
SidePanel: generateDocument()
    ↓
构建文档生成Prompt（包含详细步骤）
    ↓
调用 AI API
    ↓
接收 Markdown 文档
    ↓
显示文档编辑器（预览/编辑模式）
    ↓
用户可复制/下载/手动编辑
```

---

## 配置文件

### manifest.json

Chrome 扩展清单文件，定义扩展的基本信息和权限：

```json
{
  "manifest_version": 3,
  "name": "SmartPages - 智能网页文档助手",
  "version": "1.0.0",
  "permissions": [
    "storage",
    "tabs",
    "notifications",
    "sidePanel",
    "activeTab"
  ],
  "host_permissions": ["<all_urls>"],
  "background": {
    "service_worker": "background/background.js"
  },
  "content_scripts": [{
    "matches": ["<all_urls>"],
    "js": ["content/recorder.js"],
    "run_at": "document_end"
  }],
  "side_panel": {
    "default_path": "sidepanel/sidepanel.html"
  }
}
```

### package.json

NPM 配置文件：

```json
{
  "name": "smartpages",
  "version": "1.0.0",
  "scripts": {
    "build": "echo 'Building extension...'",
    "dev": "echo 'Development mode...'"
  },
  "keywords": [
    "chrome-extension",
    "documentation",
    "ai"
  ]
}
```

---

## 消息通信架构

### Background ↔ Content Script

| 方向 | 消息 | 用途 |
|-----|------|------|
| → | `START_LISTENING` | 开始录制监听 |
| → | `STOP_LISTENING` | 停止录制监听 |
| ← | `ADD_STEP` | 发送操作步骤 |

### Background ↔ Popup

| 方向 | 消息 | 用途 |
|-----|------|------|
| ← | `GET_RECORDING_STATE` | 获取录制状态 |
| ← | `START_RECORDING` | 开始录制 |
| ← | `STOP_RECORDING` | 停止录制 |
| ← | `RESET_RECORDING` | 重置录制 |
| → | `RECORDING_STATE_CHANGED` | 状态变化通知 |

### Background ↔ SidePanel

| 方向 | 消息 | 用途 |
|-----|------|------|
| → | `START_AI_ANALYSIS` | 触发AI分析 |
| ← | `GET_SESSION` | 获取会话数据 |

---

## 依赖关系

```
┌─────────────────┐
│     Popup       │
│  (快捷控制入口)   │
└────────┬────────┘
         │
         ↓
┌─────────────────┐     ┌──────────────────┐
│   Background    │←───→│  Content Script  │
│  (核心控制器)     │     │  (页面操作监听)    │
└────────┬────────┘     └──────────────────┘
         │
         ↓
┌─────────────────┐
│   SidePanel     │
│ (AI分析+文档生成) │
└─────────────────┘
         ↑
         │
┌─────────────────┐
│   Settings      │
│  (API配置管理)   │
└─────────────────┘
```

---

## 关键特性

### 1. 智能选择器生成

Content Script 使用以下策略生成元素选择器：

1. 优先使用 ID
2. 使用类名
3. 使用 name 属性
4. 构建路径（最多5层）
5. 添加 `nth-child` 定位

### 2. 防重复点击

- 时间窗口：500ms
- 同一元素不重复记录
- 避免误触导致的大量数据

### 3. SPA 路由监听

支持单页应用的导航检测：

- `hashchange` - Hash 路由
- `popstate` - History API
- `pushState/replaceState` - 劫持监听

### 4. 简单的 Markdown 解析器

SidePanel 内置轻量级 Markdown 解析器，支持：

- 标题（H1-H4）
- 粗体/斜体
- 列表（有序/无序）
- 链接
- 图片
- 代码块/行内代码

### 5. 错误处理

- API 调用超时（30秒）
- Content Script 注入失败提示
- 页面可访问性验证
- 友好的错误消息展示

---

## 开发建议

### 1. 本地开发

```bash
# 1. 克隆项目
git clone <repository>

# 2. 在 Chrome 中加载
# - 打开 chrome://extensions/
# - 启用"开发者模式"
# - 点击"加载已解压的扩展程序"
# - 选择项目目录
```

### 2. 调试

- **Background**: 在 `chrome://extensions/` 中点击 "Service Worker" 链接
- **Content Script**: 在页面的 DevTools 中调试
- **Popup/SidePanel**: 右键点击元素选择"检查"

### 3. 构建

项目无构建步骤，直接加载源码即可。

---

## 安全考虑

1. **API Key 存储**
   - 使用 `chrome.storage.local` 加密存储
   - UI 中仅显示脱敏版本

2. **权限最小化**
   - 仅请求必要的权限
   - `host_permissions: ["<all_urls>"]` 用于支持所有网站

3. **Content Script 隔离**
   - 运行在独立上下文
   - 无法访问扩展的内部变量

---

## 未来扩展

可能的改进方向：

1. 支持更多 AI 模型（Claude、Gemini 等）
2. 导出为 PDF、HTML 等格式
3. 云端同步录制记录
4. 多语言支持
5. 协作功能（分享文档）
6. 模板系统（不同类型的文档模板）

---

## 文档更新

- **版本**: 1.0.0
- **生成日期**: 2025-01-20
- **生成工具**: Code Structure Documentation Generator Skill
