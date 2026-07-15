"""
Name-matching engine for Verification of Payee (VoP).

Implements the MATCH / CLOSE_MATCH / NO_MATCH decision per the EPC VoP scheme.
Uses normalization + fuzzy matching (difflib.SequenceMatcher) to compare the
payer-supplied name against the account holder name on record.

Thresholds (tunable, based on EPC guidance and real-world tuning):
  - ratio >= MATCH_THRESHOLD      → MATCH
  - CLOSE_THRESHOLD <= ratio < MATCH_THRESHOLD → CLOSE_MATCH
                                      (return the actual name for payer review)
  - ratio < CLOSE_THRESHOLD       → NO_MATCH
"""
from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from difflib import SequenceMatcher
from enum import Enum
from typing import Optional


class MatchOutcome(str, Enum):
    MATCH = "MATCH"
    CLOSE_MATCH = "CLOSE_MATCH"
    NO_MATCH = "NO_MATCH"


# Tunable thresholds. EPC recommends ~90% for MATCH; banks tune their own.
MATCH_THRESHOLD = 0.90
CLOSE_MATCH_THRESHOLD = 0.75


@dataclass
class NameMatchResult:
    outcome: MatchOutcome
    score: float  # 0.0–1.0 similarity ratio
    submitted_name: str
    account_name: Optional[str] = None  # returned on CLOSE_MATCH per EPC

    def to_reason_code(self) -> str:
        """EPC reason codes: MATCH / CLOSE_MATCH / NO_MATCH."""
        return self.outcome.value


# ---------------------------------------------------------------------------
# Normalization — make comparisons robust to formatting differences
# ---------------------------------------------------------------------------

# Common titles / prefixes to strip, so "Mr John Smith" ≈ "John Smith".
_TITLES = {
    "mr", "mrs", "ms", "miss", "dr", "prof", "sir", "rev",
    "mister", "mme", "sr", "sra", "srta",
}

# Suffixes / business-type indicators kept but normalized.
_LEGAL_SUFFIXES = {
    "ltd": "limited", "llc": "llc", "inc": "inc",
    "corp": "corporation", "co": "co", "plc": "plc",
    "gmbh": "gmbh", "ag": "ag", "sa": "sa", "bv": "bv",
    "nv": "nv", "oy": "oy", "ab": "ab", "sarl": "sarl",
}


def normalize_name(name: str) -> str:
    """
    Normalize a name for comparison:
      - Unicode NFKD decomposition (strip accents)
      - Lowercase
      - Remove punctuation
      - Collapse whitespace
      - Strip common titles
      - Token-sort so "John Smith" ≈ "Smith John"
    """
    if not name:
        return ""

    # NFKD: decompose accented chars, then drop combining marks
    name = unicodedata.normalize("NFKD", name)
    name = name.encode("ascii", "ignore").decode("ascii")

    # Lowercase
    name = name.lower()

    # Replace punctuation with spaces
    name = re.sub(r"[^\w\s]", " ", name)

    # Collapse whitespace
    name = re.sub(r"\s+", " ", name).strip()

    # Tokenize + strip titles
    tokens = [t for t in name.split() if t not in _TITLES]
    # Expand legal suffixes
    tokens = [_LEGAL_SUFFIXES.get(t, t) for t in tokens]

    # Token-sort: "John Smith" and "Smith, John" both become "john smith"
    tokens.sort()
    return " ".join(tokens)


def similarity_ratio(name_a: str, name_b: str) -> float:
    """Compute similarity ratio on normalized names."""
    norm_a = normalize_name(name_a)
    norm_b = normalize_name(name_b)

    if not norm_a or not norm_b:
        return 0.0

    return SequenceMatcher(None, norm_a, norm_b).ratio()


def match_names(
    submitted_name: str,
    account_name: str,
    match_threshold: float = MATCH_THRESHOLD,
    close_threshold: float = CLOSE_MATCH_THRESHOLD,
) -> NameMatchResult:
    """
    Compare the submitted name against the account-holder name.

    Returns a NameMatchResult with the outcome, score, and (for CLOSE_MATCH)
    the actual account name so the payer can review it.
    """
    score = similarity_ratio(submitted_name, account_name)

    if score >= match_threshold:
        return NameMatchResult(
            outcome=MatchOutcome.MATCH,
            score=score,
            submitted_name=submitted_name,
            account_name=account_name,
        )
    elif score >= close_threshold:
        return NameMatchResult(
            outcome=MatchOutcome.CLOSE_MATCH,
            score=score,
            submitted_name=submitted_name,
            account_name=account_name,  # returned to payer per EPC
        )
    else:
        return NameMatchResult(
            outcome=MatchOutcome.NO_MATCH,
            score=score,
            submitted_name=submitted_name,
            account_name=None,  # NOT returned per EPC (privacy)
        )
