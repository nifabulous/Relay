#!/usr/bin/env python3
"""Redact secrets, payment identifiers, and personal data before model submission.

Payment-identifier redaction is not reimplemented here. ``app/tutor/redaction.py``
is the repository's established redactor: it already handles IBANs (contiguous
and grouped), BIC/SWIFT codes, UETRs, account numbers, emails, and phone
numbers, and — critically — it applies them in an order that cannot emit a
partial identifier under the wrong label. This module reuses that function and
adds only what a GitHub payload needs on top: PEM key blocks, vendor API keys,
and card-shaped numbers.

Two deliberate differences from the tutor path, because the corpus is source
diffs rather than learner prose:

* BIC/SWIFT codes are preserved. They are public directory data already
  committed to this repository, and collapsing them hides the very values a
  payment-domain review has to compare.
* Git metadata lines and ISO-8601 date/times are exempt. Neither can carry a
  personal identifier, and both otherwise get mislabelled — a blob hash as an
  account number, a migration's ``Create Date`` as a phone number — which tells
  the reviewer something false about what it is looking at.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.tutor.redaction import redact_sensitive_text_preserving_bic  # noqa: E402

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


# Diff structure, not content: `index <sha>..<sha>` and `@@ -a,b +c,d @@`. Their
# digit runs are addresses in the diff, never identifiers.
_GIT_METADATA_RE = re.compile(r"^(?:index [0-9a-f]+\.\.[0-9a-f]+(?: \d+)?|@@ .*)$")

# Masked before redaction and restored after, so no numeric rule can claim a
# date or timestamp. The placeholder carries at most two digits, which is short
# of every numeric rule's floor.
_ISO_8601_RE = re.compile(
    r"\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)?"
)


def _redact_card(match: "re.Match[str]") -> str:
    digits = sum(character.isdigit() for character in match.group(0))
    if 13 <= digits <= 19:
        return "[REDACTED_CARD]"
    return match.group(0)


def _sanitize_line(line: str) -> str:
    if _GIT_METADATA_RE.fullmatch(line.rstrip("\r\n")):
        return line

    timestamps: list[str] = []

    def _mask(match: "re.Match[str]") -> str:
        timestamps.append(match.group(0))
        return f"[DATETIME_{len(timestamps) - 1}]"

    masked = _ISO_8601_RE.sub(_mask, line)
    for pattern, replacement in SECRET_PATTERNS[1:]:
        masked = pattern.sub(replacement, masked)
    masked = redact_sensitive_text_preserving_bic(masked)
    masked = _CARD_RE.sub(_redact_card, masked)
    for index, timestamp in enumerate(timestamps):
        masked = masked.replace(f"[DATETIME_{index}]", timestamp)
    return masked


def sanitize(text: str) -> str:
    """Redact credentials, payment identifiers, and personal data in ``text``."""
    # The PEM rule spans lines, so it runs over the whole payload first; every
    # other rule is line-scoped, which is what makes the exemptions above
    # expressible.
    pem_pattern, pem_replacement = SECRET_PATTERNS[0]
    text = pem_pattern.sub(pem_replacement, text)
    return "".join(
        _sanitize_line(line) for line in text.splitlines(keepends=True)
    )


def main() -> int:
    sys.stdout.write(sanitize(sys.stdin.read()))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
