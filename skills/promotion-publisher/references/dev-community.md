# DEV Community adapter

Use this adapter for DEV Community or another Forem instance after verifying endpoint differences.

## Capability profile

- Draft creation: official Forem article API or authenticated editor.
- Draft update: authenticated editor; use an official update endpoint only after verifying current docs and retaining the remote article ID.
- Public publish: authenticated editor after exact user authorization.
- Authentication: DEV API key for API operations; existing signed-in browser session for editor operations.
- Secret handling: read the API key from `DEVTO_API_KEY` or a hidden prompt. Never store or print it.

## Draft format

Use Markdown with YAML frontmatter:

```yaml
---
title: A platform-specific title
published: false
description: A concrete one-sentence description
tags: webdev, ai, opensource, productivity
cover_image:
---
```

Keep at most four tags. Use a public HTTPS URL for cover images and inline GIFs. For repository assets, prefer a stable raw URL, for example:

```markdown
![Product workflow demo](https://raw.githubusercontent.com/owner/repo/main/docs/assets/demo.gif)
```

## Create a draft through the API

1. Run the HumanWriting pass on the exact draft.
2. Create and verify the review receipt.
3. Run `scripts/publish_dev_draft.ps1 -DraftPath <path>`.
4. Confirm `published: false` in the preview and API response.
5. Record the returned article ID immediately with `record_platform_state.py`.

The helper creates an unpublished draft only. It must never accept a switch that publishes publicly.

## Update an existing draft

1. Read the `.publish.json` sidecar for the remote ID and account.
2. If the state record is missing, read the authenticated DEV Dashboard and extract the edit link/ID. Do not guess URL variants.
3. Open that exact edit page.
4. Confirm the existing title/account before editing.
5. Replace only the fields authorized by the user.
6. Save Draft once. If the action is slow or ambiguous, inspect the dashboard or preview before retrying.
7. Verify the preview shows `Unpublished Post`, the expected title/body/media, and the same remote ID.
8. Update the state sidecar.

## Publish

1. Re-run HumanWriting on the exact final copy and verify its receipt.
2. Show the user: DEV Community, account, article ID, title, tags, cover, inline media, links, and current unpublished state.
3. Require an explicit instruction to publish this article.
4. Open the exact edit page and click Publish once.
5. Verify the resulting URL no longer contains a preview token and the page shows a public posting date instead of `Unpublished Post`.
6. Confirm the cover, GIF, repository link, title, tags, and author render correctly.
7. Record `status=published` and the clean public URL.

## Current SmartPages assets

- Cover: `docs/assets/readme-hero.png`
- Demo GIF: `docs/assets/smartpages-demo-zh.gif`
- English setup poster: `assets/smartpages-poster-first-setup-en.png`
- Product icon: `icons/icon-source.png`

Resolve asset paths from the repository and use public URLs only when sending them to DEV.
