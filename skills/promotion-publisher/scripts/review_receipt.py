#!/usr/bin/env python3
"""Create or verify a SHA-256 receipt for an exact HumanWriting-reviewed draft."""

from __future__ import annotations

import argparse
import hashlib
from pathlib import Path


def digest(path: Path) -> str:
    hasher = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            hasher.update(block)
    return hasher.hexdigest()


def receipt_path(draft: Path) -> Path:
    return Path(f"{draft}.humanwriting.sha256")


def approve(draft: Path) -> int:
    if not draft.is_file():
        raise FileNotFoundError(draft)
    value = digest(draft)
    target = receipt_path(draft)
    target.write_text(f"{value}\n", encoding="ascii")
    print(f"HumanWriting receipt created: {target}")
    return 0


def verify(draft: Path) -> int:
    target = receipt_path(draft)
    if not draft.is_file() or not target.is_file():
        print("HumanWriting receipt verification failed: draft or receipt is missing.")
        return 1
    expected = target.read_text(encoding="ascii").strip().lower()
    actual = digest(draft)
    if expected != actual:
        print("HumanWriting receipt verification failed: the draft changed after review.")
        return 1
    print(f"HumanWriting receipt verified: {draft}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Run approve only after the HumanWriting skill reviews the exact draft."
    )
    parser.add_argument("action", choices=("approve", "verify"))
    parser.add_argument("draft", type=Path)
    args = parser.parse_args()
    return approve(args.draft) if args.action == "approve" else verify(args.draft)


if __name__ == "__main__":
    raise SystemExit(main())
