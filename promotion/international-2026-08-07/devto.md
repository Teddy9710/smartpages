---
title: I Built a Browser Extension That Turns Recorded Workflows into Docs
published: false
description: SmartPages records browser steps and screenshots, then turns them into editable guides, SOPs, test cases, and bug reports.
tags: webdev, ai, opensource, productivity
cover_image:
---

Writing documentation often means doing the same job twice.

First, you complete the workflow. Then you repeat it mentally: reconstruct the steps, capture screenshots, explain what happened, and format everything into a guide, SOP, test case, or bug report.

I built **SmartPages** so the recording can become the first draft of the documentation.

## What SmartPages does

SmartPages is a Chrome and Edge extension that records clicks, input, navigation, and step screenshots. When you're ready to generate a document, it sends the selected recording data to an AI provider you configure.

The result stays editable. You can correct a step, rewrite an explanation, or remove anything that doesn't belong in the final document.

Here's the workflow from recording through document generation:

![SmartPages workflow recording and document generation demo](https://raw.githubusercontent.com/Teddy9710/smartpages/main/docs/assets/smartpages-demo-zh.gif)

You can use it for:

- Product and user guides
- Internal SOPs
- QA test cases
- Bug reproduction reports
- Training and support documentation

## Bring your own model

SmartPages doesn't require a particular model vendor. It supports OpenAI-compatible providers, including OpenAI, Gemini, DeepSeek, Qwen, Kimi, GLM, MiniMax, OpenRouter, and custom endpoints. It also supports Anthropic's Messages API.

Each provider has its own settings for the API key, base URL, model, and image input.

## From recording to delivery

The basic flow is:

1. Load the extension in Chrome or Edge.
2. Configure and test a model provider.
3. Open the target page and start recording.
4. Complete the workflow normally and stop recording.
5. Review the captured steps and choose a document goal.
6. Generate, edit, and export the result.

Exports include Markdown, HTML, Word, PDF, ZIP, images, and plain text.

## Privacy boundaries

Provider credentials remain in Chrome Storage. Recorded content is sent only when you generate a document. Screenshots are included only when image input is explicitly enabled, and hidden screenshots are excluded.

The recording itself should never include passwords, verification codes, tokens, identity numbers, or other sensitive information.

## Workflows for local agents

Version 1.3 adds an experimental machine-readable `.smartpages.json` workflow format. A workflow can be validated and replayed locally. Approved workflows can also be exposed through a local MCP/Agent Bridge.

This is for cases where a documented browser procedure should later become a repeatable, controlled workflow.

## Try it

The source code, release packages, installation guide, demo, and architecture notes are on GitHub:

{% embed https://github.com/Teddy9710/smartpages %}

If you try it, I'm most interested in where the recording breaks down and whether the generated document saves meaningful editing time.
