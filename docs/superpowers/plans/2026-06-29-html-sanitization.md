# HTML Sanitization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent generated HTML and Markdown from injecting executable markup into extension previews or exports.

**Architecture:** Add a reusable DOM document sanitizer in `utils/common.js` and route both live rendering and Markdown export conversion through it. Keep the implementation dependency-free and compatible with browser globals and Node test exports.

**Tech Stack:** JavaScript, DOMParser, Node assert/vm test harness, Manifest V3.

---

### Task 1: Sanitizer regression coverage

**Files:**
- Create: `tests/common-html-sanitization.test.js`
- Modify: `utils/common.js`

- [ ] Write tests asserting removal of executable elements, event attributes, inline styles, `srcdoc`, JavaScript/VBScript URLs, and unsafe data URIs.
- [ ] Run `node tests/common-html-sanitization.test.js` and confirm the assertions fail against current behavior.
- [ ] Add `sanitizeHtmlDocument(doc)` and call it from `safeSetInnerHTML`.
- [ ] Re-run the focused test and confirm it passes.

### Task 2: Markdown export parity

**Files:**
- Modify: `tests/sidepanel-html-sanitization.test.js`
- Modify: `sidepanel/sidepanel.js`

- [ ] Write a failing test proving `_markdownToSafeHtml` rejects the same dangerous attributes and URLs.
- [ ] Replace its local partial filter with `sanitizeHtmlDocument`.
- [ ] Run the focused sidepanel test and confirm it passes.

### Task 3: Repository verification and issue closure

**Files:**
- Modify only if verification reveals a directly related defect.

- [ ] Run `npm run verify` and resolve only sanitizer-related failures.
- [ ] Commit the tested changes with issue references.
- [ ] Push `main`, comment with verification evidence, and close GitHub issues #43 and #49.
