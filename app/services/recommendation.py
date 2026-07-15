"""
Recommendation engine for the combined prepare-payment endpoint.

A pure function that takes the four pre-send signals (validation, VoP outcome,
routing availability, SSI readiness) and returns a single recommendation:
  REJECT              — details invalid, fix first
  STOP                — likely wrong account / fraud risk (NO_MATCH)
  BLOCKED             — no route to destination
  REVIEW              — needs human confirmation (CLOSE_MATCH)
  CAUTION             — can't verify, proceed at own risk
  PROCEED_WITH_CAUTION — everything checks out but SSI accounts unverified
  PROCEED             — everything verified, safe to send

Strictness levels let callers tune how CLOSE_MATCH and NOT_CHECKED are treated:
  lenient  — CLOSE_MATCH → PROCEED_WITH_CAUTION (warn but allow)
  standard — CLOSE_MATCH → REVIEW (default; human must confirm)
  strict   — CLOSE_MATCH → STOP (block), NOT_CHECKED → STOP
"""
from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import List


class Recommendation(str, Enum):
    PROCEED = "PROCEED"
    PROCEED_WITH_CAUTION = "PROCEED_WITH_CAUTION"
    REVIEW = "REVIEW"
    CAUTION = "CAUTION"
    STOP = "STOP"
    BLOCKED = "BLOCKED"
    REJECT = "REJECT"


# Terminal recommendations that should block the Send button entirely.
BLOCKING = {Recommendation.STOP, Recommendation.BLOCKED, Recommendation.REJECT}


@dataclass
class RecommendationResult:
    recommendation: Recommendation
    reason: str
    warnings: List[str] = field(default_factory=list)
    blocks: List[str] = field(default_factory=list)

    @property
    def is_blocking(self) -> bool:
        """True if the Send button should be disabled in a UI."""
        return self.recommendation in BLOCKING


def decide(
    validation_valid: bool,
    vop_outcome: str,  # MATCH | CLOSE_MATCH | NO_MATCH | NOT_CHECKED
    has_routing: bool,
    has_real_ssi_accounts: bool,
    has_placeholder_ssi_only: bool,
    validation_errors: List[str] = None,
    strictness: str = "standard",
) -> RecommendationResult:
    """
    The decision matrix. Pure function — no I/O, deterministic.

    Args:
        validation_valid: did IBAN/BIC validation pass?
        vop_outcome: result of name verification
        has_routing: are there intermediary suggestions for this corridor?
        has_real_ssi_accounts: are there SSI records with non-placeholder accounts?
        has_placeholder_ssi_only: SSI exists but only ACCT- placeholders
        validation_errors: error messages from validation (for REJECT detail)
        strictness: 'lenient' | 'standard' | 'strict'

    Returns a RecommendationResult with recommendation + human-readable reason.
    """
    warnings: list[str] = []
    blocks: list[str] = []
    validation_errors = validation_errors or []

    # Layer 1: validation gate — nothing else matters if the details are invalid
    if not validation_valid:
        blocks.append("Beneficiary details failed validation")
        return RecommendationResult(
            recommendation=Recommendation.REJECT,
            reason="Beneficiary details are invalid — fix before proceeding.",
            warnings=warnings,
            blocks=blocks + validation_errors,
        )

    # Layer 2: VoP outcome — the safety-critical check
    if vop_outcome == "NO_MATCH":
        blocks.append("Payee name does not match account holder (potential fraud)")
        return RecommendationResult(
            recommendation=Recommendation.STOP,
            reason="Name does not match the account holder. Do not proceed.",
            warnings=warnings,
            blocks=blocks,
        )

    if vop_outcome == "CLOSE_MATCH":
        if strictness == "lenient":
            warnings.append("Name is a close match — verify with payer when possible")
            # Fall through to routing/SSI checks; don't return yet
        elif strictness == "strict":
            blocks.append("Close name match — strict mode requires exact match")
            return RecommendationResult(
                recommendation=Recommendation.STOP,
                reason="Close name match; strict mode blocks until resolved.",
                warnings=warnings,
                blocks=blocks,
            )
        else:  # standard
            warnings.append("Name is a close match — payer must confirm")
            return RecommendationResult(
                recommendation=Recommendation.REVIEW,
                reason="Name is similar but not exact. The payer must confirm before sending.",
                warnings=warnings,
                blocks=blocks,
            )

    if vop_outcome == "NOT_CHECKED":
        if strictness == "strict":
            blocks.append("Could not verify payee — strict mode blocks unverified payments")
            return RecommendationResult(
                recommendation=Recommendation.STOP,
                reason="Could not verify payee; strict mode blocks unverified payments.",
                warnings=warnings,
                blocks=blocks,
            )
        else:
            warnings.append("Payee could not be verified — proceed at own risk")
            # Fall through to routing/SSI; will end as CAUTION unless routing blocks

    # Layer 3: routing — is there a path to the destination?
    if not has_routing:
        blocks.append("No intermediary routing available for this corridor")
        return RecommendationResult(
            recommendation=Recommendation.BLOCKED,
            reason="No known route to the destination bank for this currency.",
            warnings=warnings,
            blocks=blocks,
        )

    # Layer 4: SSI readiness — do we have real account numbers to settle?
    if has_real_ssi_accounts:
        # Everything verified: valid details, name OK, route exists, accounts present
        if warnings:
            # We accumulated warnings (NOT_CHECKED or lenient CLOSE_MATCH) but
            # everything else is fine — proceed but flag the caveat.
            return RecommendationResult(
                recommendation=Recommendation.CAUTION
                if vop_outcome == "NOT_CHECKED"
                else Recommendation.PROCEED_WITH_CAUTION,
                reason="Payment is sendable, but review the warnings before confirming.",
                warnings=warnings,
                blocks=blocks,
            )
        return RecommendationResult(
            recommendation=Recommendation.PROCEED,
            reason="All checks passed. Safe to proceed.",
            warnings=warnings,
            blocks=blocks,
        )

    if has_placeholder_ssi_only:
        warnings.append(
            "SSI account numbers are placeholders — replace with real accounts before sending"
        )
        return RecommendationResult(
            recommendation=Recommendation.PROCEED_WITH_CAUTION,
            reason="Routing available but settlement accounts are unverified placeholders.",
            warnings=warnings,
            blocks=blocks,
        )

    # No SSI at all — routing exists but we don't have settlement instructions
    warnings.append("No settlement instructions (SSI) on file for this corridor")
    return RecommendationResult(
        recommendation=Recommendation.PROCEED_WITH_CAUTION,
        reason="Routing available but no settlement instructions on file.",
        warnings=warnings,
        blocks=blocks,
    )
