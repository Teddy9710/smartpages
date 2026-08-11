# Xiaohongshu adapter

Use this adapter for Xiaohongshu image or video notes. Apply the core workflow in `../SKILL.md` first.

## Safety boundary

- Prefer an official API or connector if Xiaohongshu makes one available for the intended account. Verify current capabilities before every integration change.
- Otherwise use the signed-in Xiaohongshu Creator Center in the in-app browser. Do not collect, export, log, or reuse cookies, passwords, QR data, OTPs, or browser profiles.
- Automate only post preparation, media upload, form filling, preview, and verification. Do not automate follows, likes, favorites, comments, private messages, or traffic manipulation.
- Stop at login, CAPTCHA, account verification, risk-control, or content-review gates. Do not bypass them.
- Never use a remote CDP host. If a separately audited helper is ever used, bind it to loopback only (`127.0.0.1`, `localhost`, or `::1`) and force preview mode. Do not call a helper whose default action is public publishing.
- Public release requires a fresh, explicit confirmation naming Xiaohongshu, the account, and the exact staged post. A general request to promote a project is not release authorization.

## Copy and media

- Write for a visual productivity-tool audience: one concrete pain point, a short personal observation, three to five practical benefits, and a restrained call for feedback.
- Use HumanWriting on the exact title, body, hashtags, and call to action. Then create the SHA receipt with `review_receipt.py approve`.
- Keep claims factual. Do not promise unsupported model capabilities, privacy properties, or results.
- Put the strongest visual first. For SmartPages, prefer the setup poster or a clean cover followed by configuration and generated-document screenshots.
- Use local media only. The preparation script accepts 1–18 JPEG/PNG/WebP images or one MP4/MOV video. Convert an animated GIF to video before staging.
- Do not depend on an external URL in the note body; link handling and reach policies can change. If a repository link is useful, show it for confirmation and verify the platform's current behavior before publishing.

## Draft format

Store the exact reviewed content in a UTF-8 Markdown file:

```markdown
---
title: 录一次操作，自动写成清晰文档
tags: SmartPages, AI效率工具, Chrome插件, 开源
---
我做了一个把浏览器操作自动整理成文档的小工具。

它会记录关键步骤，再生成一份可以继续编辑的说明文档。
```

The title is part of the reviewed draft. Do not pass it separately on the command line.

## Prepare the staging manifest

After HumanWriting review and receipt creation, run one of:

```powershell
python scripts/prepare_xiaohongshu_post.py --draft C:\absolute\xiaohongshu.md --images C:\absolute\cover.png C:\absolute\step-2.png
python scripts/prepare_xiaohongshu_post.py --draft C:\absolute\xiaohongshu.md --video C:\absolute\demo.mp4
```

The command verifies the receipt and local media, then creates `<draft>.xiaohongshu.json`. The manifest contains no credentials and is always marked `preview_only`.

## Browser staging

1. Open `https://creator.xiaohongshu.com/publish/publish` in the existing authenticated browser session.
2. Confirm the visible account. If the requested account cannot be established from the page, stop.
3. Read the generated manifest. Select image-note or video-note mode, upload the listed local files in order, and fill the exact title, body, and tags.
4. Wait for every upload and platform-side processing step to complete. Inspect the cover, crop, ordering, line breaks, hashtags, and any platform warnings.
5. Save as a platform draft if that control exists. Otherwise leave the completed form open. Do not click the final publish control.
6. Report the account, exact title, media count and order, content hash, visible warnings, and current staged state. Ask for explicit release confirmation.

## Publish and verify

After explicit confirmation, re-open or re-check the staged form, verify the manifest hash still matches the HumanWriting receipt, and click publish once. Do not retry an ambiguous submission.

Verify the note in Creator Center or the public note page. Record the account, note ID, public URL when available, status, content hash, and timestamp with `record_platform_state.py`. If the platform reports review or processing, record that status instead of claiming the note is public.

## Community-tool audit note

The adapter design was informed by the MIT-licensed `white0dew/XiaohongshuSkills` project (audited at commit `9daad657318e04cb9edc5a2d27738844d85dcda5`). Its Windows and Creator Center flow were useful references, but its default direct-publish path, remote CDP option, and engagement commands fall outside this skill's safety boundary. No upstream code is bundled or executed by this adapter.
