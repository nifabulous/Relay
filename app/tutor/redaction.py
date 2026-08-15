"""Deterministic redaction of sensitive identifiers in tutor text.

Redaction is **unconditional**. There is deliberately no configuration flag,
environment variable, or keyword argument that can switch it off: a control
able to disable a stated privacy invariant is not a feature, it is the defect.
The only lever a caller has is *what text it hands over*.

Redaction belongs at the **provider boundary, never before retrieval**.
Retrieval keys on the very tokens this module removes — a learner asking "what
does BIC DEUTDEFF mean?" must still reach the BIC concept card, and redacting
first would destroy the term the lookup depends on. This module is a pure
string transform with no opinion about when it runs; callers are responsible
for running it last, immediately before the model call.

Placeholders are **typed** (`[IBAN]`, `[BIC]`, `[UETR]`, `[ACCOUNT]`,
`[EMAIL]`, `[PHONE]`, `[SECRET]`) so the model can still reason about *what
kind* of identifier was mentioned without ever receiving its value. No
placeholder is itself 8 or 11 uppercase characters, so none can be re-matched
as a BIC by a later rule.

Over-redaction is treated as a real failure, not a safe default: a tutor that
cannot say "IBAN", quote a year, or read an amount back is useless.
"""
import re

# ISO 3166-1 alpha-2. Embedded as a closed literal rather than read from a
# country package: the set is stable, and the redactor must not grow a runtime
# dependency on a library that only arrives here transitively today.
_ISO_3166_ALPHA2 = frozenset(
    {
        "AD", "AE", "AF", "AG", "AI", "AL", "AM", "AO", "AQ", "AR", "AS", "AT", "AU", "AW",
        "AX", "AZ", "BA", "BB", "BD", "BE", "BF", "BG", "BH", "BI", "BJ", "BL", "BM", "BN",
        "BO", "BQ", "BR", "BS", "BT", "BV", "BW", "BY", "BZ", "CA", "CC", "CD", "CF", "CG",
        "CH", "CI", "CK", "CL", "CM", "CN", "CO", "CR", "CU", "CV", "CW", "CX", "CY", "CZ",
        "DE", "DJ", "DK", "DM", "DO", "DZ", "EC", "EE", "EG", "EH", "ER", "ES", "ET", "FI",
        "FJ", "FK", "FM", "FO", "FR", "GA", "GB", "GD", "GE", "GF", "GG", "GH", "GI", "GL",
        "GM", "GN", "GP", "GQ", "GR", "GS", "GT", "GU", "GW", "GY", "HK", "HM", "HN", "HR",
        "HT", "HU", "ID", "IE", "IL", "IM", "IN", "IO", "IQ", "IR", "IS", "IT", "JE", "JM",
        "JO", "JP", "KE", "KG", "KH", "KI", "KM", "KN", "KP", "KR", "KW", "KY", "KZ", "LA",
        "LB", "LC", "LI", "LK", "LR", "LS", "LT", "LU", "LV", "LY", "MA", "MC", "MD", "ME",
        "MF", "MG", "MH", "MK", "ML", "MM", "MN", "MO", "MP", "MQ", "MR", "MS", "MT", "MU",
        "MV", "MW", "MX", "MY", "MZ", "NA", "NC", "NE", "NF", "NG", "NI", "NL", "NO", "NP",
        "NR", "NU", "NZ", "OM", "PA", "PE", "PF", "PG", "PH", "PK", "PL", "PM", "PN", "PR",
        "PS", "PT", "PW", "PY", "QA", "RE", "RO", "RS", "RU", "RW", "SA", "SB", "SC", "SD",
        "SE", "SG", "SH", "SI", "SJ", "SK", "SL", "SM", "SN", "SO", "SR", "SS", "ST", "SV",
        "SX", "SY", "SZ", "TC", "TD", "TF", "TG", "TH", "TJ", "TK", "TL", "TM", "TN", "TO",
        "TR", "TT", "TV", "TW", "TZ", "UA", "UG", "UM", "US", "UY", "UZ", "VA", "VC", "VE",
        "VG", "VI", "VN", "VU", "WF", "WS", "YE", "YT", "ZA", "ZM", "ZW",
    }
)

# Vendor-prefixed keys (sk-..., ghp_..., AKIA...), bearer tokens, and
# `NAME=value` / `NAME: value` assignments whose name reads as a credential.
_SECRET_RE = re.compile(
    r"""(?x)
    \b(?:sk|pk|rk|ak|api|key|tok)[-_](?:live|test|prod)?[-_]?[A-Za-z0-9_-]{16,}\b
    | \b(?:gh[pousr]|xox[baprs])_[A-Za-z0-9]{16,}\b
    | \bAKIA[0-9A-Z]{16}\b
    | \bBearer\s+[A-Za-z0-9._~+/-]{20,}={0,2}
    # NAME=value / NAME: value where NAME reads as a credential. The name part
    # is built from separator-terminated segments so the credential word has to
    # be a whole segment: this matches ADMIN_API_KEY and X-Admin-Key but not
    # the "key" buried inside "Turnkey:".
    | \b(?:[A-Za-z][A-Za-z0-9]*[_-])*
      (?:KEY|TOKEN|SECRET|PASSWORD|PASSWD|PWD|CREDENTIAL)
      \s*[:=]\s*
      \"?[A-Za-z0-9._~+/-]{8,}\"?
    """,
    re.IGNORECASE,
)

_EMAIL_RE = re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b")

_UETR_RE = re.compile(
    r"\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b"
)

# Both the contiguous form and the space-grouped form. The grouped form is what
# appears on invoices and statements, so it is the one a learner actually pastes.
# It MUST be matched here: _PHONE_RE below is permissive about internal spaces
# and would otherwise claim the middle of a grouped IBAN, emitting a partial
# leak under the wrong label ("DE89 3704 ... 00" -> "DE[PHONE]130 00"), which is
# worse than no match because it also misinforms the model about what it saw.
_IBAN_RE = re.compile(
    r"\b[A-Z]{2}\d{2}"
    r"(?:"
    r"[A-Z0-9]{11,30}"                             # contiguous
    r"|"
    r"(?:\s[A-Z0-9]{4}){2,7}(?:\s[A-Z0-9]{1,4})?"  # grouped in fours
    r")\b"
)

_PHONE_RE = re.compile(r"\+?\(?\d[\d\s().-]{7,17}\d")

# Unbroken digit runs long enough to be an account number. The 8-digit floor is
# what keeps a 4-digit year and the 1-3 digit groups of a formatted amount
# ("1,000,000") out of range.
_ACCOUNT_RE = re.compile(r"\b\d{8,}\b")

_BIC_RE = re.compile(r"\b[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}(?:[A-Z0-9]{3})?\b")

_BIC_CUE_RE = re.compile(
    r"(?:\bbic|\bswift)(?:\s+(?:code|codes|address))?\s*$", re.IGNORECASE
)


def _looks_like_bic(token: str, prefix: str) -> bool:
    """Decide whether a BIC-shaped token is a real BIC rather than prose.

    The ISO 9362 shape is far too loose to act on alone. Measured against
    /usr/share/dict/words it matches 56,018 ordinary English words; adding the
    country-code constraint still leaves 27,763. Scanning Relay's own
    learner-facing prose (228 files) turns up REQUIRED, CREDITED, BENEFICIARY,
    EXERCISE, GLOSSARY and twenty more real words that clear shape *and*
    country code. So a valid country code is necessary but nowhere near
    sufficient, and a vowel-shape heuristic was rejected too: it still left
    7,700 word collisions while losing 15 of 89 real BICs (INGBNL2A, NBADAEAA,
    TGBATRIS, ...).

    A candidate therefore also has to carry one unambiguous signal:

    * it contains a digit — no English word does, and in the same corpus scan
      every digit-bearing candidate (CITIUS33, BOFAUS3N, NWBKGB2L, ...) was a
      genuine BIC and not one was prose; or
    * it is 11 characters ending in XXX, the ISO 9362 head-office branch code —
      no English word ends that way; or
    * a BIC/SWIFT cue sits *immediately* before it ("BIC DEUTDEFF", "SWIFT code
      BNPAFRPP"). Adjacency is required rather than a cue anywhere in the text,
      because documents that discuss BICs are exactly the documents that also
      contain the colliding words above.

    The knowingly accepted gap is a bare all-letter 8-character BIC with no cue
    ("send to DEUTDEFF"). Closing it costs redacting ordinary capitalised
    prose, which the corpus shows is the more frequent event, and a BIC is
    public directory data identifying an institution — not, like an IBAN or an
    account number, a person. Precision wins for BIC alone; the other
    identifier types are matched aggressively.
    """
    if token[4:6] not in _ISO_3166_ALPHA2:
        return False
    if any(character.isdigit() for character in token):
        return True
    if len(token) == 11 and token.endswith("XXX"):
        return True
    return _BIC_CUE_RE.search(prefix) is not None


def _redact_phone(match: "re.Match[str]") -> str:
    """Redact only runs that are actually phone-shaped.

    The bare character-run regex also matches dates ("2026-08-15") and grouped
    figures, so the real decision is made here: a phone number carries 9-15
    digits and is either internationally prefixed or internally separated. A
    year, a date, and an unseparated digit run all fail one of those and are
    handed back untouched — an unseparated run falls through to the account
    rule instead.
    """
    token = match.group(0)
    digits = sum(character.isdigit() for character in token)
    if not 9 <= digits <= 15:
        return token
    if token.startswith("+") or any(character in " .-()" for character in token):
        return "[PHONE]"
    return token


def _redact_bic(match: "re.Match[str]") -> str:
    token = match.group(0)
    if _looks_like_bic(token, match.string[: match.start()]):
        return "[BIC]"
    return token


def redact_sensitive_text(value: str) -> str:
    """Replace sensitive identifiers in ``value`` with typed placeholders."""
    value = _SECRET_RE.sub("[SECRET]", value)
    value = _EMAIL_RE.sub("[EMAIL]", value)
    value = _UETR_RE.sub("[UETR]", value)
    value = _IBAN_RE.sub("[IBAN]", value)
    value = _BIC_RE.sub(_redact_bic, value)
    value = _PHONE_RE.sub(_redact_phone, value)
    value = _ACCOUNT_RE.sub("[ACCOUNT]", value)
    return value
