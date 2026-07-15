"""
Sanctions screening service — matches names against a mock OFAC-style watchlist.

Reuses the existing name_matcher.py engine (normalize_name + similarity_ratio)
to demonstrate how real screening works: fuzzy matching against a list of
sanctioned individuals, entities, and vessels.

NOT REAL SCREENING. Uses a synthetic training-only watchlist.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import List, Optional

from ..data.sanctions_watchlist import WATCHLIST
from .name_matcher import similarity_ratio

# Screening thresholds — lower than VoP because sanctions errs cautious.
# A "possible hit" at 0.75 must be reviewed; a "hard hit" at 0.90 is blocked.
HARD_HIT_THRESHOLD = 0.90
POSSIBLE_HIT_THRESHOLD = 0.75


@dataclass
class ScreeningMatch:
    name: str
    score: float
    matched_entry: Optional[dict] = None
    matched_against: Optional[str] = None


@dataclass
class PartyScreening:
    party: str  # "sender" | "beneficiary"
    name: str
    hit: bool
    score: float
    recommendation: str  # CLEAR | REVIEW | REJECT
    matched_entry: Optional[dict] = None


@dataclass
class HopScreening:
    hop: int
    bic: str
    bank_name: str
    decision: str  # CLEAR | POSSIBLE_HIT | HARD_HIT
    action: str  # PASS | REVIEW | HOLD | REJECT
    delay_hours: float
    notes: str


@dataclass
class ScreeningResult:
    sender: PartyScreening
    beneficiary: PartyScreening
    overall_recommendation: str  # CLEAR | REVIEW | BLOCKED
    blocked: bool
    hops: List[HopScreening] = field(default_factory=list)
    blocked_at_hop: Optional[int] = None
    total_delay_hours: float = 0.0


def screen_name(name: str) -> ScreeningMatch:
    """Match one name against the whole watchlist. Returns best score."""
    best = ScreeningMatch(name=name, score=0.0)
    for entry in WATCHLIST:
        candidates = [entry["name"]] + entry.get("aliases", [])
        for cand in candidates:
            s = similarity_ratio(name, cand)
            if s > best.score:
                best = ScreeningMatch(
                    name=name, score=s,
                    matched_entry=entry, matched_against=cand,
                )
    return best


def _recommendation(score: float) -> str:
    if score >= HARD_HIT_THRESHOLD:
        return "REJECT"
    if score >= POSSIBLE_HIT_THRESHOLD:
        return "REVIEW"
    return "CLEAR"


def screen_payment(
    sender_name: str,
    beneficiary_name: str,
    intermediary_bics: Optional[List[str]] = None,
    intermediary_names: Optional[List[str]] = None,
) -> ScreeningResult:
    """
    Screen both parties, then show screening at each hop in the chain.

    Screening is computed once (same watchlist globally), but each bank
    applies its own decision based on the score. This teaches that
    screening happens at EVERY bank, not just the sender.
    """
    intermediary_bics = intermediary_bics or []
    intermediary_names = intermediary_names or []

    # Screen both parties
    sender_match = screen_name(sender_name)
    beneficiary_match = screen_name(beneficiary_name)

    sender_hit = sender_match.score >= POSSIBLE_HIT_THRESHOLD
    beneficiary_hit = beneficiary_match.score >= POSSIBLE_HIT_THRESHOLD

    sender = PartyScreening(
        party="sender", name=sender_name,
        hit=sender_hit,
        score=round(sender_match.score, 4),
        recommendation=_recommendation(sender_match.score),
        matched_entry=sender_match.matched_entry if sender_hit else None,
    )
    beneficiary = PartyScreening(
        party="beneficiary", name=beneficiary_name,
        hit=beneficiary_hit,
        score=round(beneficiary_match.score, 4),
        recommendation=_recommendation(beneficiary_match.score),
        matched_entry=beneficiary_match.matched_entry if beneficiary_hit else None,
    )

    # Build hop chain: sender bank → intermediaries → beneficiary bank
    hops: List[HopScreening] = []

    # Build the full chain of (bic, name) pairs
    chain = [("SENDER", sender_name or "Sender Bank")]
    for bic, name in zip(intermediary_bics, intermediary_names):
        chain.append((bic, name))
    chain.append(("BENEFICIARY", beneficiary_name or "Beneficiary Bank"))

    blocked = False
    blocked_at = None
    total_delay = 0.0

    for i, (bic, bank_name) in enumerate(chain):
        # Each hop screens BOTH the party names AND its own bank name.
        # This means a sanctioned intermediary bank name is caught too.
        # Different banks may use slightly different thresholds, simulating
        # the real-world effect where a payment can clear at one bank and
        # get held at another.
        bank_match = screen_name(bank_name) if bank_name else ScreeningMatch(name="", score=0.0)
        hop_max = max(sender_match.score, beneficiary_match.score, bank_match.score)

        # Add slight per-hop threshold variation to simulate different banks
        # having different screening policies (some stricter, some looser)
        hop_hard = HARD_HIT_THRESHOLD - (i * 0.01)  # each hop slightly stricter
        hop_possible = POSSIBLE_HIT_THRESHOLD - (i * 0.01)

        if hop_max >= hop_hard:
            decision = "HARD_HIT"
            action = "REJECT"
            delay = 0.0
            if bank_match.score >= hop_hard and bank_match.score >= max(sender_match.score, beneficiary_match.score):
                notes = f"Hard match on bank name '{bank_name}' — payment rejected"
            else:
                notes = "Hard match on party name — payment rejected"
            blocked = True
            if blocked_at is None:
                blocked_at = i
        elif hop_max >= hop_possible:
            decision = "POSSIBLE_HIT"
            action = "HOLD"
            delay = 24.0
            notes = "Possible match — held for compliance review"
        else:
            decision = "CLEAR"
            action = "PASS"
            delay = 0.1
            notes = "No match — cleared"

        hops.append(HopScreening(
            hop=i, bic=bic, bank_name=bank_name,
            decision=decision, action=action,
            delay_hours=delay, notes=notes,
        ))
        if not blocked:
            total_delay += delay
        if blocked:
            break

    if blocked:
        overall = "BLOCKED"
    elif any(h.action in ("HOLD", "REVIEW") for h in hops):
        overall = "REVIEW"
    else:
        overall = "CLEAR"

    return ScreeningResult(
        sender=sender,
        beneficiary=beneficiary,
        hops=hops,
        overall_recommendation=overall,
        blocked=blocked,
        blocked_at_hop=blocked_at,
        total_delay_hours=round(total_delay, 1),
    )
