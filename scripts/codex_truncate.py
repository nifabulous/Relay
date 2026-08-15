#!/usr/bin/env python3
"""Truncate text to a byte ceiling without splitting a UTF-8 code point.

`head -c` cuts raw bytes, so a ceiling that lands mid-character emits an
invalid sequence. The result is posted to the GitHub API, which rejects or
mangles it, and the failure surfaces far from its cause. This trims to a
character boundary instead, then appends a visible marker so a reader knows the
comment is incomplete — the marker is included in the ceiling, never added past
it.
"""

from __future__ import annotations

import argparse
import sys

DEFAULT_MARKER = "\n\n[Truncated at {limit} bytes.]\n"


def truncate_utf8(text: str, max_bytes: int, marker: str = DEFAULT_MARKER) -> str:
    """Return ``text`` encoded in at most ``max_bytes`` UTF-8 bytes."""
    if max_bytes <= 0:
        raise ValueError("max_bytes must be positive")
    if len(text.encode("utf-8")) <= max_bytes:
        return text

    rendered = marker.format(limit=max_bytes)
    budget = max_bytes - len(rendered.encode("utf-8"))
    if budget <= 0:
        # No room for both. Keep the content, drop the marker, still on a
        # character boundary.
        return _cut(text, max_bytes)
    return _cut(text, budget) + rendered


def _cut(text: str, max_bytes: int) -> str:
    encoded = text.encode("utf-8")[:max_bytes]
    # A truncated trailing sequence is dropped rather than replaced: an escaped
    # replacement character would itself add bytes back over the ceiling.
    return encoded.decode("utf-8", errors="ignore")


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--max-bytes", required=True, type=int)
    parser.add_argument("--marker", default=DEFAULT_MARKER)
    args = parser.parse_args(argv)
    if args.max_bytes <= 0:
        parser.error("--max-bytes must be positive")
    return args


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv if argv is not None else sys.argv[1:])
    sys.stdout.write(truncate_utf8(sys.stdin.read(), args.max_bytes, args.marker))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
