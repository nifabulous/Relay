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

Module IDs match the hash-route fragments in learn.js (e.g. `#lab-1` → "1",
`#fees` → "fees", `#lab-capstone` → "capstone").
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import List, Optional

# ---------------------------------------------------------------------------
# Module catalogue
# ---------------------------------------------------------------------------

# Canonical ordered list of all module IDs in the learning journey.
# The order here defines both the completion percentage denominator and the
# "next recommended" suggestion. These IDs match the hash routes in learn.js.
ALL_MODULE_IDS: List[str] = [
    "1",          # Lab 1: BICs & IBANs
    "2",          # Lab 2: Checksums
    "3",          # Lab 3: Verification of Payee
    "4",          # Lab 4: Routing Chains
    "5",          # Lab 5: Settlement Instructions
    "6",          # Lab 6: UETR & gpi Tracking
    "7",          # Lab 7: Payment Schemes
    "capstone",   # Capstone: Full Payment
    "fees",       # Fee Calculator
    "fx",         # FX Calculator
    "sanctions",  # Sanctions Screening
    "settlement", # Settlement Cycles
    "mt103",      # MT103 Decoder
    "cases",      # Case Studies
    "glossary",   # Glossary
]

# Fast lookup set for membership checks.
_VALID_IDS = set(ALL_MODULE_IDS)


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
        requirement="Complete the Fee Calculator module.",
        required_ids=["fees"],
    ),
    Badge(
        id="fx-sharp",
        name="FX Sharp",
        description="You exposed the hidden cost of exchange-rate spreads.",
        requirement="Complete the FX Calculator module.",
        required_ids=["fx"],
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
        required_ids=["1", "2", "3"],
    ),
    Badge(
        id="gpi-tracker",
        name="gpi Tracker",
        description="You decoded the MT103 and followed the UETR trail.",
        requirement="Complete the MT103 Decoder module.",
        required_ids=["mt103"],
    ),
    Badge(
        id="settlement-sage",
        name="Settlement Sage",
        description="You understand value dates, cut-offs, and holidays.",
        requirement="Complete the Settlement Cycles module.",
        required_ids=["settlement"],
    ),
    Badge(
        id="payment-operator",
        name="Payment Operator",
        description="You can route a payment end-to-end through the full chain.",
        requirement="Complete all 7 labs and the capstone.",
        required_ids=["1", "2", "3", "4", "5", "6", "7", "capstone"],
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
    """Deduplicate, filter to known IDs, preserving first-seen order."""
    seen = []
    seen_set = set()
    for mid in completed_ids:
        if mid in _VALID_IDS and mid not in seen_set:
            seen.append(mid)
            seen_set.add(mid)
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
    count = len(completed)
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
