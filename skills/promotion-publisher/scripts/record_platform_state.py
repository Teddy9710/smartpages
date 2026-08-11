#!/usr/bin/env python3
"""Record non-secret remote publication state next to a promotion draft."""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path


def file_hash(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--draft", required=True, type=Path)
    parser.add_argument("--platform", required=True)
    parser.add_argument("--account", required=True)
    parser.add_argument("--remote-id", required=True)
    parser.add_argument("--status", required=True, choices=("draft", "published", "archived"))
    parser.add_argument("--url", required=True)
    args = parser.parse_args()

    if not args.draft.is_file():
        raise FileNotFoundError(args.draft)

    state_path = Path(f"{args.draft}.publish.json")
    previous: dict[str, object] = {}
    if state_path.is_file():
        previous = json.loads(state_path.read_text(encoding="utf-8"))

    timestamp = datetime.now(timezone.utc).isoformat()
    history = list(previous.get("history", []))
    history.append(
        {
            "timestamp": timestamp,
            "status": args.status,
            "url": args.url,
            "content_sha256": file_hash(args.draft),
        }
    )
    state = {
        "platform": args.platform,
        "account": args.account,
        "remote_id": str(args.remote_id),
        "status": args.status,
        "url": args.url,
        "content_sha256": file_hash(args.draft),
        "updated_at": timestamp,
        "history": history,
    }
    state_path.write_text(json.dumps(state, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Platform state recorded: {state_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
