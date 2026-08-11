---
name: promotion-publisher
description: Prepare, adapt, stage, update, and publish product or open-source promotion posts across domestic and international platforms. Use for launch posts, project announcements, channel-specific copy, HumanWriting review, draft automation, media insertion, publication confirmation, remote article tracking, or adding a new platform adapter while preserving the same safe workflow.
---

# Promotion Publisher

Use one stable publishing workflow and isolate platform differences in references.

## Core workflow

1. Inspect the source of truth: README files, release notes, screenshots, GIFs, posters, repository links, and existing drafts.
2. Select the target platform adapter. Read only its reference file. If no adapter exists, read `references/platform-adapter-template.md`, verify current official platform capabilities, and add an adapter before writing externally.
3. Create platform-specific copy. Do not mass-post identical text across communities.
4. Invoke the available HumanWriting skill on the exact title, description, body, and call to action before every external create, update, or publish operation.
5. Run `scripts/review_receipt.py approve <draft>` only after the HumanWriting pass. Run `verify` immediately before sending. Any edit invalidates the receipt and requires another HumanWriting pass.
6. Confirm the target account, platform, intended state, links, and media. Treat create, update, and publish as separate operations.
7. Prefer an official connector or API. Query available tools before using a browser. Use an existing authenticated browser session only when a connector/API cannot perform the operation.
8. Create or update a draft first when the platform supports drafts. Never convert a general promotion request into a public post.
9. Verify the saved draft using an authoritative platform signal and record its remote ID, URL, account, status, and content hash with `scripts/record_platform_state.py`.
10. Before public release, show the exact platform, account, title, links, media, and current draft state. Require explicit user authorization for that platform and article.
11. Publish once. Do not retry a slow or ambiguous submit action until the remote state has been checked.
12. Verify the public URL, title, author/account, media, links, and absence of draft/preview markers. Update the state record and report the result.

## Non-negotiable rules

- Keep passwords, API keys, OTPs, cookies, and preview tokens out of drafts, scripts, logs, state files, and chat responses.
- Read API keys from a process/user environment variable or hidden prompt. Never ask the user to paste a key into a file.
- Stop for login, CAPTCHA, or platform review gates; do not bypass them.
- Do not solicit votes, automate engagement, or post duplicate spam.
- Preserve factual claims, version numbers, privacy caveats, repository URLs, and model/provider names during copy editing.
- Keep remote IDs in state sidecars so future updates target the existing article rather than create duplicates.
- Keep draft and publish actions fail-closed when HumanWriting review is missing or stale.

## Platform routing

- Read `references/dev-community.md` for DEV/Forem draft creation, updates, media, publishing, and verification.
- Read `references/domestic-platforms.md` for V2EX, Juejin, CSDN, cnblogs, Zhihu, Jike, and WeChat Official Account tone and constraints.
- Read `references/xiaohongshu.md` for Xiaohongshu copy, local media staging, browser preview, explicit confirmation, and publication verification.
- Read `references/platform-adapter-template.md` when integrating Product Hunt, Hacker News, Reddit, or another platform.

## Reusable commands

Create domestic channel drafts:

```bash
python scripts/make_channel_drafts.py --source promotion/source.md --out promotion/drafts --project SmartPages --repo https://github.com/owner/repo --asset docs/assets/demo.gif
```

Approve and verify an exact HumanWriting-reviewed draft:

```bash
python scripts/review_receipt.py approve path/to/draft.md
python scripts/review_receipt.py verify path/to/draft.md
```

Record remote state after a verified platform operation:

```bash
python scripts/record_platform_state.py --draft path/to/draft.md --platform dev-community --account account-name --remote-id 123 --status draft --url https://example.com/post
```

Prepare a reviewed Xiaohongshu post for browser staging:

```bash
python scripts/prepare_xiaohongshu_post.py --draft path/to/xiaohongshu.md --images C:\absolute\cover.png C:\absolute\step.png
```

## Handoff

Report per platform: copy reviewed, receipt current, account verified, draft created/updated, media verified, published, public URL verified, or blocked by login/CAPTCHA/review. Distinguish local preparation from remote state changes.
