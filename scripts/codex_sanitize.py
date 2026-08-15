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
# Vendor-prefixed header names: Proxy-Authorization, X-Authorization,
# X-Amz-Authorization. Enumerating prefixes one at a time lost ground every
# round — each fix closed one spelling and left its neighbour — so the prefix is
# matched structurally instead. Bounded repetition rather than `*`: four
# segments covers every real header and keeps backtracking linear on a long
# hyphenated line that never reaches the header name.
_HEADER_PREFIX = r"(?:[A-Za-z][A-Za-z0-9]*-){0,4}"

# `Authentication` is not a standard request header but is used in the wild and
# is a frequent misspelling of the real one. `WWW-Authenticate` is deliberately
# excluded: it is a server challenge, not a credential.
_AUTH_HEADER = rf"{_HEADER_PREFIX}auth(?:orization|entication)"

_AUTH_SCHEMES = (
    r"(?:bearer|basic|token|digest|negotiate|oauth|hoba|mutual|apikey|"
    r"scram-sha-1|scram-sha-256|aws4-hmac-sha256)"
)

SECRET_PATTERNS: tuple[tuple[re.Pattern[str], str], ...] = (
    (
        re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----.*?-----END [A-Z ]*PRIVATE KEY-----", re.DOTALL),
        "[REDACTED_PRIVATE_KEY]",
    ),
    (
        # A whole-line Authorization header, whatever the scheme. The value is
        # taken to end of line rather than to the first space because Digest
        # spreads its credential across a comma-separated parameter list. The
        # scheme is kept: it is diagnostic and is not itself the secret, and an
        # unmatched optional group substitutes as empty for a scheme-less value.
        re.compile(rf"(?i)^([+\- ]*\s*{_AUTH_HEADER}\s*[:=]\s*)({_AUTH_SCHEMES}\s+)?.+$"),
        r"\1\2[REDACTED]",
    ),
    (
        # The same header appearing inline, e.g. in a shell invocation. Bounded
        # to a single token here, since the surrounding line is code.
        re.compile(rf"(?i)\b({_AUTH_HEADER}\s*[:=]\s*)({_AUTH_SCHEMES}\s+)?[^\s\r\n]+"),
        r"\1\2[REDACTED]",
    ),
    (
        # A cookie header is a bearer credential in all but name. Header-shaped
        # lines, including diff-prefixed lines, consume the complete value so
        # quoted RFC 6265 cookies cannot leave their contents behind.
        re.compile(rf"(?i)^([+\- ]*\s*{_HEADER_PREFIX}cookie\s*[:=]\s*).+$"),
        r"\1[REDACTED_COOKIE]",
    ),
    (
        # The same cookie assignment appearing inline in code. A cookie is
        # `name="value"`, so the quote sits *inside* the value rather than at
        # its start: matching a quoted run only as a leading alternative stopped
        # at the opening quote and left the secret behind it. Bare characters
        # and quoted runs therefore alternate freely across the whole value.
        re.compile(
            rf"(?i)\b({_HEADER_PREFIX}cookie\s*[:=]\s*)"
            r"(?:[^\s\r\n\"'}]|\"[^\"\r\n]*\"|'[^'\r\n]*')+"
        ),
        r"\1[REDACTED_COOKIE]",
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
        # Quoted assignments first, and matched to the closing quote rather than
        # to the first space: a passphrase is the case where the value contains
        # spaces, and the unquoted rule below stops at the first one.
        re.compile(
            # Bounded, not `*`: an unbounded segment repetition costs seconds on
            # a single long hyphenated line (a minified bundle or lockfile entry
            # in a diff), which a hostile PR could use to burn the job timeout.
            # Eight segments is far more than any real credential name.
            r"(?i)\b(?:[A-Za-z][A-Za-z0-9]*[_-]){0,8}"
            r"(?:api[_-]?key|secret|token|password|passwd|pwd|credential)"
            r"\s*[:=]\s*(['\"])(?:(?!\1).)*\1"
        ),
        "[REDACTED_SECRET_ASSIGNMENT]",
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


# Diff structure, not content: `index <sha>..<sha>` and the numeric prefix of
# `@@ -a,b +c,d @@`. Their digit runs are addresses in the diff, never
# identifiers. Hunk context after the closing `@@` is source code and must be
# redacted normally.
_GIT_METADATA_RE = re.compile(r"^index [0-9a-f]+\.\.[0-9a-f]+(?: \d+)?$")
_HUNK_HEADER_RE = re.compile(r"^@@ -\d+(?:,\d+)? \+\d+(?:,\d+)? @@")

# Runs masked before redaction and restored after, so no numeric rule can claim
# them. The placeholder carries at most two digits, which is short of every
# numeric rule's floor, so it cannot be re-matched.
_ISO_8601_RE = re.compile(
    r"\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)?"
)

# Standard references. `ISO 20022 2019` is nine digits with a separator, which
# is exactly the phone rule's shape, so a payments repo's most-discussed
# standard read as a phone number in every review. The digit count is bounded by
# the pattern itself, so nothing longer than a standard number can hide here.
_STANDARD_REFERENCE_RE = re.compile(r"\bISO[ /-]?\d{3,5}(?:[:-]\d{2,4})?\b", re.IGNORECASE)

# SVG coordinate lists: a run like `points="20 6 9 17 4 12"` is geometry, but it
# is also nine digits with separators. Only the purely numeric attributes are
# considered — `d` paths interleave letters and are not worth the looser match.
_SVG_COORDINATES_RE = re.compile(r"\b(?:points|viewBox)\s*=\s*\"[0-9 .,+-]*\"")

# A coordinate list is many short groups. The exemption is gated on that shape
# rather than on the attribute name, so an account number parked inside a
# `points=` attribute is still redacted rather than waved through.
_LONG_DIGIT_RUN_RE = re.compile(r"\d{8,}")


def _is_coordinate_list(match: "re.Match[str]") -> bool:
    return _LONG_DIGIT_RUN_RE.search(match.group(0)) is None


# (pattern, predicate) — a predicate of None exempts every match.
_EXEMPT_RULES = (
    (_ISO_8601_RE, None),
    (_STANDARD_REFERENCE_RE, None),
    (_SVG_COORDINATES_RE, _is_coordinate_list),
)


def _redact_card(match: "re.Match[str]") -> str:
    digits = sum(character.isdigit() for character in match.group(0))
    if 13 <= digits <= 19:
        return "[REDACTED_CARD]"
    return match.group(0)


def _sanitize_line(line: str) -> str:
    if _GIT_METADATA_RE.fullmatch(line.rstrip("\r\n")):
        return line

    hunk_prefix = ""
    hunk_match = _HUNK_HEADER_RE.match(line)
    if hunk_match:
        hunk_prefix = hunk_match.group(0)
        line = line[len(hunk_prefix) :]

    exempt: list[str] = []

    def _mask_with(predicate):
        def _mask(match: "re.Match[str]") -> str:
            if predicate is not None and not predicate(match):
                return match.group(0)
            exempt.append(match.group(0))
            return f"[LITERAL_{len(exempt) - 1}]"

        return _mask

    masked = line
    for pattern, predicate in _EXEMPT_RULES:
        masked = pattern.sub(_mask_with(predicate), masked)
    for pattern, replacement in SECRET_PATTERNS[1:]:
        masked = pattern.sub(replacement, masked)
    masked = redact_sensitive_text_preserving_bic(masked)
    masked = _CARD_RE.sub(_redact_card, masked)
    for index, literal in enumerate(exempt):
        masked = masked.replace(f"[LITERAL_{index}]", literal)
    return hunk_prefix + masked


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
