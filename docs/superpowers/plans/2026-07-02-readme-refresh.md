# SmartPages README Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite the Chinese and English project READMEs as concise, product-first landing pages while preserving verified installation, PDF export, security, development, contribution, and licensing information.

**Architecture:** `README.md` and `README.en.md` will share the same section order and factual claims, but each will use natural language for its audience. Existing repository assets remain the visual source of truth: the animated demo appears immediately after the hero, while the static product image appears in the interface section.

**Tech Stack:** GitHub-flavored Markdown, HTML alignment blocks, repository-relative image and document links, PowerShell verification commands.

---

### Task 1: Rewrite the Chinese README

**Files:**
- Modify: `README.md`
- Reference: `manifest.json`
- Reference: `package.json`
- Reference: `sidepanel/sidepanel.html`
- Reference: `sidepanel/sidepanel.js`

- [ ] **Step 1: Replace the hero and demo section**

Keep the language switch, icon, badges, and `docs/assets/smartpages-demo-zh.gif`. Use the value proposition “录一次操作，自动写成清晰文档”, identify SmartPages as an open-source browser workflow recorder and AI documentation assistant, and place the GIF immediately below the badges.

- [ ] **Step 2: Add the product-first content path**

Use this section order: `为什么选择 SmartPages`, `它如何工作`, `安装`, `快速开始`, `核心能力`, `产品界面`, `模型兼容`, `隐私与安全`, `开发与贡献`, `许可证`. Keep paragraphs short, consolidate repeated feature lists, and keep `docs/assets/readme-hero.png` in `产品界面`.

- [ ] **Step 3: Describe PDF support accurately**

List PDF alongside Markdown, HTML, and plain text. State that the side-panel PDF button opens the browser print dialog, where the user selects “另存为 PDF”; do not claim a silent direct download.

- [ ] **Step 4: Preserve adoption-critical facts**

Retain Chrome/Edge unpacked installation, `npm install`, `npm run build`, `npm run dev`, supported provider families, API-key storage, CSP and sanitization notes, CLA link, GPL v3 terms, and commercial-license requirement. Link deeper technical material instead of reproducing architecture and directory trees.

### Task 2: Rewrite the English README

**Files:**
- Modify: `README.en.md`
- Reference: `README.md`
- Reference: `CONTRIBUTING.en.md`

- [ ] **Step 1: Mirror the Chinese information architecture**

Use this section order: `Why SmartPages`, `How It Works`, `Installation`, `Quick Start`, `Core Capabilities`, `Product Tour`, `Model Compatibility`, `Privacy and Security`, `Development and Contributing`, `License`. Translate ideas naturally rather than line by line.

- [ ] **Step 2: Keep visuals and facts synchronized**

Use the same icon, badges, animated demo, static product image, supported providers, output formats, commands, security claims, contribution links, and license terms as `README.md`.

- [ ] **Step 3: Describe the PDF workflow precisely**

State that the PDF action opens the browser print dialog and the user chooses “Save as PDF”. Do not label PDF as planned or unavailable.

### Task 3: Verify Both Documents

**Files:**
- Verify: `README.md`
- Verify: `README.en.md`

- [ ] **Step 1: Check formatting and stale claims**

Run:

```powershell
& 'D:\git for windows\Git\cmd\git.exe' diff --check -- README.md README.en.md
rg -n "暂未内置|规划中|Not built in|Planned" README.md README.en.md
```

Expected: `git diff --check` exits successfully; `rg` returns no stale PDF or placeholder claims.

- [ ] **Step 2: Check required asset and document links**

Run:

```powershell
@('icons/icon128.png','docs/assets/smartpages-demo-zh.gif','docs/assets/readme-hero.png','CONTRIBUTING.md','CONTRIBUTING.en.md','LICENSE','QUICKSTART.md','TESTING.md','TROUBLESHOOTING.md') | ForEach-Object { if (-not (Test-Path $_)) { throw "Missing README target: $_" } }
```

Expected: command exits successfully without output.

- [ ] **Step 3: Compare synchronized claims**

Confirm both files mention Chrome, Edge, Markdown, HTML, PDF, GPT/OpenAI, Gemini, Claude/Anthropic, DeepSeek, `npm run build`, `npm run dev`, Chrome Storage, GPL v3, and commercial licensing.

- [ ] **Step 4: Review the final diff**

Run:

```powershell
& 'D:\git for windows\Git\cmd\git.exe' diff --stat -- README.md README.en.md
& 'D:\git for windows\Git\cmd\git.exe' diff -- README.md README.en.md
```

Expected: only the two README files change; the new structure is shorter, product-first, bilingual, and factually aligned.
