# Reddit — single-community draft

Recommended community: choose one relevant subreddit only after checking its current rules, such as r/opensource or r/webdev. Do not cross-post the same promotion across multiple communities.

Title:

I built a source-available Chrome extension that turns recorded browser workflows into editable AI documentation

Body:

I kept running into the same problem: after completing a product workflow, I still had to recreate every step, take screenshots, and format an internal guide or bug report.

So I built **SmartPages**, a Chrome/Edge extension that records a real browser workflow—clicks, input, navigation, and screenshots—and turns it into an editable document using the AI provider you choose.

What it currently supports:

- User guides, tutorials, internal SOPs, test cases, and bug reports
- OpenAI-compatible providers plus Anthropic
- Markdown, HTML, Word, PDF, ZIP, and image export
- Local document history and optional Supabase sync
- An experimental `.smartpages.json` workflow format and local MCP/Agent Bridge

Privacy was important to me: provider credentials stay in browser storage, recorded content is sent only when generating a document, and screenshots are sent only when image input is explicitly enabled. Passwords, verification codes, and tokens should never be recorded.

Repository and installation instructions:

https://github.com/Teddy9710/smartpages

I would appreciate practical feedback on where this fits—or fails to fit—real documentation and QA workflows.

Suggested flair/tags: Open Source, Project, Chrome Extension, AI, Developer Tools

