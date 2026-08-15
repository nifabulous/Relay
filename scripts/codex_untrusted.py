#!/usr/bin/env python3
"""Wrap untrusted GitHub content in delimiters the content cannot forge.

The trusted review contract travels in the Responses API ``instructions``
field. Everything sourced from a pull request or issue is data, so it travels
in ``input`` inside a labelled block. A block is only a boundary if the content
inside it cannot close it, so every delimiter-shaped run in the payload is
defanged before wrapping.
"""

from __future__ import annotations

import argparse
import re
import sys

OPEN_TEMPLATE = "<<<UNTRUSTED_DATA {label}>>>"
CLOSE_TEMPLATE = "<<<END_UNTRUSTED_DATA {label}>>>"

LABEL_PATTERN = re.compile(r"^[A-Za-z0-9_-]{1,64}$")

# Matched anywhere, not just at line start: leading whitespace, trailing
# padding, and mid-line placement are all ways to smuggle a closing fence past
# an anchored pattern.
_DELIMITER_RE = re.compile(r"<<<\s*(?:END_)?UNTRUSTED_DATA[^\n>]*>*", re.IGNORECASE)

DEFANGED = "[DEFANGED_DELIMITER]"


def defang(text: str) -> str:
    """Neutralise delimiter-shaped runs so untrusted data cannot close its block."""
    return _DELIMITER_RE.sub(DEFANGED, text)


def wrap_untrusted(label: str, text: str) -> str:
    """Return ``text`` enclosed in a labelled, unforgeable untrusted-data block."""
    if not LABEL_PATTERN.fullmatch(label):
        raise ValueError("label must match [A-Za-z0-9_-]{1,64}")
    body = defang(text)
    if not body.endswith("\n"):
        body += "\n"
    return f"{OPEN_TEMPLATE.format(label=label)}\n{body}{CLOSE_TEMPLATE.format(label=label)}\n"


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--label", required=True)
    args = parser.parse_args(argv)
    if not LABEL_PATTERN.fullmatch(args.label):
        parser.error("--label must match [A-Za-z0-9_-]{1,64}")
    return args


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv if argv is not None else sys.argv[1:])
    sys.stdout.write(wrap_untrusted(args.label, sys.stdin.read()))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
