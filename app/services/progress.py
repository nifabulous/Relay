"""
Progress & badge service for the SWIFT Routing Lab learning platform.

The frontend stores completed module IDs in localStorage and passes them to
the backend (as a comma-separated query param) to compute:

- Completion stats (how many of the total modules are done, percentage)
- Earned badges (with name + description)
- Next recommended module (first uncompleted module in canonical order)

This is a pure-function service — no database, no side effects. The frontend
is the source of truth for which modules a learner has completed; we just
compute the derived summary.

Module IDs match the current frontend curriculum (e.g. `lab-1`, `lab-9`,
`gbp-eur-rails`, `fees-fx`, and `capstone`). Legacy numeric and tool IDs are
accepted as aliases so existing saved progress remains readable.
"""

from __future__ import annotations

import logging

logger = logging.getLogger(__name__)


from dataclasses import dataclass, field
from typing import List, Optional

# ---------------------------------------------------------------------------
# Module catalogue
# ---------------------------------------------------------------------------

# Canonical ordered list of all current curriculum module IDs.
# The order here defines both the completion percentage denominator and the
# "next recommended" suggestion. This is intentionally kept in sync with
# frontend/src/features/learn/curriculum.ts.
ALL_MODULE_IDS: List[str] = [
    "lab-1", "lab-2", "lab-3", "lab-4", "lab-5", "lab-6",
    "lab-7", "lab-8", "lab-9", "gbp-eur-rails", "cad-rails",
    "fees-fx", "capstone",
]

# Fast lookup set for membership checks.
_VALID_IDS = set(ALL_MODULE_IDS)

# Compatibility aliases for progress written by the previous curriculum.
# The aliases normalize into current IDs before counts, badges, or ordering
# are computed. Standalone legacy tool IDs remain accepted only for their
# existing badges; they are not counted as curriculum modules.
_LEGACY_ID_ALIASES = {
    **{str(i): f"lab-{i}" for i in range(1, 10)},
    "fees": "fees-fx",
    "fx": "fees-fx",
    "settlement": "lab-5",
    "mt103": "lab-8",
}
_LEGACY_TOOL_IDS = {"sanctions", "cases", "glossary"}


# ---------------------------------------------------------------------------
# Badge definitions
# ---------------------------------------------------------------------------

@dataclass
class Badge:
    """A single achievement badge.

    Attributes:
        id:            Stable machine identifier (kebab-case).
        name:          Display name (what the learner sees).
        description:   Short celebration text shown when earned.
        requirement:   Human-readable description of how to earn it.
        required_ids:  Module IDs that must ALL be completed to earn it.
    """
    id: str
    name: str
    description: str
    requirement: str
    required_ids: List[str] = field(default_factory=list)


# All badges, ordered roughly by difficulty/effort (easiest first).
ALL_BADGES: List[Badge] = [
    Badge(
        id="fee-forensics",
        name="Fee Forensics",
        description="You traced every dollar lost to intermediary lift fees.",
        requirement="Complete the Fees & FX module.",
        required_ids=["fees-fx"],
    ),
    Badge(
        id="fx-sharp",
        name="FX Sharp",
        description="You exposed the hidden cost of exchange-rate spreads.",
        requirement="Complete the Fees & FX module.",
        required_ids=["fees-fx"],
    ),
    Badge(
        id="compliance-aware",
        name="Compliance Aware",
        description="You learned why payments get stopped and screened.",
        requirement="Complete the Sanctions Screening module.",
        required_ids=["sanctions"],
    ),
    Badge(
        id="payment-fundamentals",
        name="Payment Fundamentals",
        description="You mastered the identifiers that make payments work.",
        requirement="Complete Labs 1, 2, and 3.",
        required_ids=["lab-1", "lab-2", "lab-3"],
    ),
    Badge(
        id="gpi-tracker",
        name="gpi Tracker",
        description="You decoded the MT103 and followed the UETR trail.",
        requirement="Complete the MT103 Decoder module.",
        required_ids=["lab-6"],
    ),
    Badge(
        id="settlement-sage",
        name="Settlement Sage",
        description="You understand value dates, cut-offs, and holidays.",
        requirement="Complete the Settlement Cycles module.",
        required_ids=["lab-5"],
    ),
    Badge(
        id="payment-operator",
        name="Payment Operator",
        description="You can route a payment end-to-end through the full chain.",
        requirement="Complete all 9 labs and the capstone.",
        required_ids=[
            "lab-1", "lab-2", "lab-3", "lab-4", "lab-5", "lab-6",
            "lab-7", "lab-8", "lab-9", "capstone",
        ],
    ),
    Badge(
        id="wire-wizard",
        name="Wire Wizard",
        description="You completed every module. You are ready for the operations floor.",
        requirement="Complete all modules in the lab.",
        required_ids=list(ALL_MODULE_IDS),
    ),
]


# ---------------------------------------------------------------------------
# Result types
# ---------------------------------------------------------------------------

@dataclass
class ProgressSummary:
    """The computed progress dashboard data."""
    completed_count: int
    total_count: int
    percentage: int
    earned_badges: List[Badge]
    next_recommended: Optional[str]


# ---------------------------------------------------------------------------
# Core logic
# ---------------------------------------------------------------------------

def _normalise_completed(completed_ids: List[str]) -> List[str]:
    """Normalize current/legacy IDs and preserve first-seen order."""
    seen = []
    seen_set = set()
    for mid in completed_ids:
        canonical = _LEGACY_ID_ALIASES.get(mid, mid)
        if (canonical in _VALID_IDS or canonical in _LEGACY_TOOL_IDS) and canonical not in seen_set:
            seen.append(canonical)
            seen_set.add(canonical)
    return seen


def _earned_badges(completed_set: set) -> List[Badge]:
    """Return badges whose required_ids are all in the completed set."""
    earned = []
    for badge in ALL_BADGES:
        if all(rid in completed_set for rid in badge.required_ids):
            earned.append(badge)
    return earned


def _next_recommended(completed_set: set) -> Optional[str]:
    """Return the first module in canonical order that isn't completed yet."""
    for mid in ALL_MODULE_IDS:
        if mid not in completed_set:
            return mid
    return None


def get_progress_summary(completed_ids: List[str]) -> ProgressSummary:
    """Compute the full progress summary from a list of completed module IDs.

    Unknown IDs are silently ignored. Duplicates are collapsed. The
    percentage is floored to an integer (e.g. 7/15 = 46, not 46.6).
    """
    completed = _normalise_completed(completed_ids)
    completed_set = set(completed)

    total = len(ALL_MODULE_IDS)
    count = sum(mid in _VALID_IDS for mid in completed)
    percentage = int(round(100 * count / total)) if total else 0

    # Guard against floating-point rounding pushing 100% when it shouldn't be.
    if percentage == 100 and count < total:
        percentage = 99

    earned = _earned_badges(completed_set)
    next_rec = _next_recommended(completed_set)

    return ProgressSummary(
        completed_count=count,
        total_count=total,
        percentage=percentage,
        earned_badges=earned,
        next_recommended=next_rec,
    )
