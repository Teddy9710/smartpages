#!/usr/bin/env python3
"""Create Chinese platform-specific promotion drafts from one Markdown source."""

from __future__ import annotations

import argparse
from pathlib import Path
import re


CHANNELS = {
    "v2ex": {
        "title": "我做了一个开源浏览器插件：录一次网页操作，AI 自动写文档",
        "tone": "真诚、简洁、开发者交流",
        "tags": "分享创造 / 程序员 / Chrome / 开源",
    },
    "juejin": {
        "title": "从手写操作文档到 AI 自动生成：我做了一个开源 Chrome 插件",
        "tone": "技术文章，强调实现和使用场景",
        "tags": "前端, Chrome 插件, AI, 开源, 效率工具",
    },
    "csdn": {
        "title": "SmartPages：网页流程录制 + AI 自动生成操作文档的开源浏览器插件",
        "tone": "教程式，强调安装、配置和操作步骤",
        "tags": "Chrome 插件, AI, 文档生成, 自动化测试, 开源项目",
    },
    "cnblogs": {
        "title": "做了一个开源浏览器插件，用 AI 把网页操作流程变成文档",
        "tone": "工程日志，说明动机、实现和取舍",
        "tags": "Chrome Extension, AI, 开源项目",
    },
    "zhihu": {
        "title": "如何减少操作文档、测试步骤和 Bug 复现说明的编写成本？",
        "tone": "问题导向、克制，说明方案和限制",
        "tags": "AI 工具, Chrome 插件, 文档自动化",
    },
    "jike": {
        "title": "录一次网页操作，AI 自动写成文档",
        "tone": "短、个人化，配一张 GIF",
        "tags": "效率工具 / 开源 / AI",
    },
    "wechat": {
        "title": "不用再手写操作文档了：SmartPages 把网页流程变成可编辑文档",
        "tone": "完整、顺畅，适合公众号长文",
        "tags": "AI 工具, 开源项目, 效率工具",
    },
    "xiaohongshu": {
        "title": "录一次操作，自动整理成清晰文档",
        "tone": "视觉化、实用、少用开发术语",
        "tags": "效率工具 / AI / 浏览器插件",
    },
}


def compact_markdown(text: str) -> str:
    return re.sub(r"\n{3,}", "\n\n", text.strip())


def build_draft(
    channel: str,
    meta: dict[str, str],
    source: str,
    project: str,
    repo: str,
    asset: str,
) -> str:
    lines = [
        f"# {meta['title']}",
        "",
        f"> 平台：{channel}",
        f"> 语气：{meta['tone']}",
        f"> 建议标签：{meta['tags']}",
        "",
    ]
    if asset:
        lines.extend([f"![{project} 演示]({asset})", ""])
    lines.extend(
        [
            f"这是我最近做的一个开源项目：{project}。",
            "",
            "它解决一个很具体的问题：写操作手册、测试步骤、Bug 复现说明或培训文档时，往往要重新截图、回忆步骤并整理格式。",
            "",
            f"{project} 会记录一次真实的网页操作流程，包括点击、输入、页面跳转和截图，再用你配置的 AI 模型生成可继续编辑的文档。",
            "",
            "下面是需要按当前平台继续调整的项目原始材料：",
            "",
            compact_markdown(source),
            "",
        ]
    )
    if repo:
        lines.extend(["项目地址：", repo, ""])
    lines.extend(
        [
            "如果你试用了，我最想知道录制在哪一步出错，以及生成稿是否真正减少了后续编辑时间。",
            "",
            "---",
            "",
            "发送前必须使用 HumanWriting 优化当前平台的完整文案，并生成内容哈希审核凭证。先保存草稿；公开发布需要用户对该平台和文章进行明确确认。",
        ]
    )
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True, help="Source Markdown copy")
    parser.add_argument("--out", required=True, help="Output directory")
    parser.add_argument("--project", default="SmartPages")
    parser.add_argument("--repo", default="")
    parser.add_argument("--asset", default="")
    args = parser.parse_args()

    source_path = Path(args.source)
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    source = source_path.read_text(encoding="utf-8")

    checklist = [
        "# Posting checklist",
        "",
        "- [ ] Run HumanWriting on each exact platform draft.",
        "- [ ] Create and verify the matching review receipt.",
    ]
    for channel, meta in CHANNELS.items():
        draft = build_draft(channel, meta, source, args.project, args.repo, args.asset)
        filename = out_dir / f"{channel}.md"
        filename.write_text(draft, encoding="utf-8")
        checklist.append(f"- [ ] {channel}: `{filename.name}` — {meta['title']}")

    checklist.extend(
        [
            "",
            "Before any remote write:",
            "- Confirm the platform and account.",
            "- Verify links and media.",
            "- Save a draft first where supported.",
            "- Record the remote ID and URL.",
            "- Require exact user confirmation before public publishing.",
        ]
    )
    (out_dir / "posting-checklist.md").write_text("\n".join(checklist), encoding="utf-8")
    print(f"Created {len(CHANNELS)} drafts in {out_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
