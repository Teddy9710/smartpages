#!/usr/bin/env python3
"""Prepare a reviewed Xiaohongshu post manifest without publishing it."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from datetime import datetime, timezone
from pathlib import Path


IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp"}
VIDEO_SUFFIXES = {".mp4", ".mov"}
MAX_IMAGES = 18
MAX_TITLE_WEIGHT = 38


def sha256(path: Path) -> str:
    hasher = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            hasher.update(block)
    return hasher.hexdigest()


def unquote(value: str) -> str:
    value = value.strip()
    if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
        return value[1:-1]
    return value


def parse_tags(value: str) -> list[str]:
    value = value.strip()
    if value.startswith("[") and value.endswith("]"):
        value = value[1:-1]
    tags: list[str] = []
    for part in re.split(r"[,，]", value):
        tag = unquote(part).strip().lstrip("#").strip()
        if tag and tag not in tags:
            tags.append(tag)
    return tags


def parse_draft(path: Path) -> tuple[str, list[str], str]:
    text = path.read_text(encoding="utf-8-sig")
    if not text.startswith("---"):
        raise ValueError("draft must start with YAML-style front matter")
    lines = text.splitlines()
    if not lines or lines[0].strip() != "---":
        raise ValueError("draft front matter must start with a line containing only ---")
    try:
        boundary = next(i for i in range(1, len(lines)) if lines[i].strip() == "---")
    except StopIteration as exc:
        raise ValueError("draft front matter is missing its closing --- line") from exc

    metadata: dict[str, str] = {}
    for line in lines[1:boundary]:
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        if ":" not in line:
            raise ValueError(f"unsupported front matter line: {line}")
        key, value = line.split(":", 1)
        metadata[key.strip().lower()] = value.strip()

    title = unquote(metadata.get("title", "")).strip()
    if not title:
        raise ValueError("front matter must contain a non-empty title")
    tags = parse_tags(metadata.get("tags", ""))
    body = "\n".join(lines[boundary + 1 :]).strip()
    if not body:
        raise ValueError("draft body must not be empty")
    return title, tags, body


def title_weight(value: str) -> int:
    return sum(1 if ord(character) < 128 else 2 for character in value)


def verify_receipt(draft: Path) -> tuple[Path, str]:
    receipt = Path(f"{draft}.humanwriting.sha256")
    if not receipt.is_file():
        raise ValueError(f"HumanWriting receipt is missing: {receipt}")
    expected = receipt.read_text(encoding="ascii").strip().lower()
    actual = sha256(draft)
    if not re.fullmatch(r"[0-9a-f]{64}", expected) or expected != actual:
        raise ValueError("HumanWriting receipt is invalid or stale; review and approve the exact draft again")
    return receipt, actual


def validate_local_file(path: Path, allowed: set[str], kind: str) -> Path:
    if not path.is_absolute():
        raise ValueError(f"{kind} path must be absolute: {path}")
    resolved = path.resolve(strict=True)
    if not resolved.is_file():
        raise ValueError(f"{kind} is not a file: {resolved}")
    if resolved.suffix.lower() not in allowed:
        allowed_text = ", ".join(sorted(allowed))
        raise ValueError(f"unsupported {kind} extension for {resolved}; expected one of: {allowed_text}")
    if resolved.stat().st_size == 0:
        raise ValueError(f"{kind} must not be empty: {resolved}")
    return resolved


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Verify a HumanWriting-reviewed draft and create a preview-only Xiaohongshu manifest."
    )
    parser.add_argument("--draft", required=True, type=Path, help="Reviewed UTF-8 Markdown draft")
    media = parser.add_mutually_exclusive_group(required=True)
    media.add_argument("--images", nargs="+", type=Path, help="1-18 absolute local image paths, in order")
    media.add_argument("--video", type=Path, help="One absolute local MP4 or MOV path")
    parser.add_argument("--output", type=Path, help="Manifest path; defaults to <draft>.xiaohongshu.json")
    return parser


def main() -> int:
    args = build_parser().parse_args()
    try:
        draft = args.draft.resolve(strict=True)
        if not draft.is_file():
            raise ValueError(f"draft is not a file: {draft}")
        receipt, draft_hash = verify_receipt(draft)
        title, tags, body = parse_draft(draft)
        weight = title_weight(title)
        if weight > MAX_TITLE_WEIGHT:
            raise ValueError(
                f"title weight is {weight}, above the conservative Xiaohongshu limit of {MAX_TITLE_WEIGHT}"
            )

        if args.images:
            if len(args.images) > MAX_IMAGES:
                raise ValueError(f"at most {MAX_IMAGES} images are supported")
            paths = [validate_local_file(path, IMAGE_SUFFIXES, "image") for path in args.images]
            media_type = "images"
        else:
            paths = [validate_local_file(args.video, VIDEO_SUFFIXES, "video")]
            media_type = "video"

        output = args.output or Path(f"{draft}.xiaohongshu.json")
        output = output.resolve()
        output.parent.mkdir(parents=True, exist_ok=True)
        manifest = {
            "schema_version": 1,
            "platform": "xiaohongshu",
            "mode": "preview_only",
            "explicit_publish_confirmation_required": True,
            "source_draft": str(draft),
            "humanwriting_receipt": str(receipt.resolve()),
            "content_sha256": draft_hash,
            "title": title,
            "title_weight": weight,
            "body": body,
            "tags": tags,
            "media_type": media_type,
            "media": [str(path) for path in paths],
            "prepared_at": datetime.now(timezone.utc).isoformat(),
        }
        output.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"Preview-only Xiaohongshu manifest created: {output}")
        print(f"Content SHA-256: {draft_hash}")
        print("No browser action or public publishing was performed.")
        return 0
    except (FileNotFoundError, OSError, UnicodeError, ValueError) as exc:
        print(f"Xiaohongshu manifest preparation failed: {exc}")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
