#!/usr/bin/env python3
"""Redact secrets, payment identifiers, and personal data before model submission.

Payment-identifier redaction is not reimplemented here. ``app/tutor/redaction.py``
is the repository's established redactor: it already handles IBANs (contiguous
and grouped), BIC/SWIFT codes, UETRs, account numbers, emails, and phone
numbers, and — critically — it applies them in an order that cannot emit a
partial identifier under the wrong label. This module reuses that function and
adds only what a GitHub payload needs on top: PEM key blocks, vendor API keys,
and card-shaped numbers.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.tutor.redaction import redact_sensitive_text  # noqa: E402

# Applied before the shared redactor. None of these can match a payment
# identifier, so running them first cannot split one.
SECRET_PATTERNS: tuple[tuple[re.Pattern[str], str], ...] = (
    (
        re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----.*?-----END [A-Z ]*PRIVATE KEY-----", re.DOTALL),
        "[REDACTED_PRIVATE_KEY]",
    ),
    (
        re.compile(r"(?i)(authorization\s*[:=]\s*bearer\s+)[^\s\r\n]+"),
        r"\1[REDACTED]",
    ),
    (
        re.compile(r"\b(?:sk|rk|pk|ghp|github_pat|xox[baprs])[-_][A-Za-z0-9_-]{12,}\b"),
        "[REDACTED_TOKEN]",
    ),
    (
        re.compile(r"\bAKIA[0-9A-Z]{16}\b"),
        "[REDACTED_CLOUD_KEY]",
    ),
    (
        re.compile(r"(?i)(?:api[_-]?key|secret|token|password|passwd)\s*[:=]\s*(['\"]?)[^\s,'\"}]+\1"),
        "[REDACTED_SECRET_ASSIGNMENT]",
    ),
)

# Card-shaped runs, contiguous or grouped by spaces/hyphens. Applied *after*
# the shared redactor: a grouped IBAN also reads as a long digit run, and
# claiming it here would emit half an IBAN labelled as a card.
_CARD_RE = re.compile(r"(?<![\d-])(?:\d[ -]?){12,18}\d(?![\d-])")


def _redact_card(match: "re.Match[str]") -> str:
    digits = sum(character.isdigit() for character in match.group(0))
    if 13 <= digits <= 19:
        return "[REDACTED_CARD]"
    return match.group(0)


def sanitize(text: str) -> str:
    """Redact credentials, payment identifiers, and personal data in ``text``."""
    sanitized = text
    for pattern, replacement in SECRET_PATTERNS:
        sanitized = pattern.sub(replacement, sanitized)
    sanitized = redact_sensitive_text(sanitized)
    return _CARD_RE.sub(_redact_card, sanitized)


def main() -> int:
    sys.stdout.write(sanitize(sys.stdin.read()))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
