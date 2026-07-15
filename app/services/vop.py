"""
Verification of Payee (VoP) service.

Implements the EPC103-24 VoP scheme contract: given an IBAN + a payer-submitted
name, check the name against the account-holder name on record and return
MATCH / CLOSE_MATCH / NO_MATCH / NOT_CHECKED.

ARCHITECTURE:
  - VoPVerifier is the entry point. It resolves the account, runs the name
    matcher, and returns the result.
  - A real deployment would call out to the scheme's VoP gateway (SurePay,
    Tink, TrueLayer) or the receiving bank's core banking system. Here we
    resolve against the local Account table (seeded synthetic records).
  - The VoPBackend protocol defines the adapter interface so a real gateway
    can be dropped in without changing the endpoint.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional, Protocol

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import Account
from .name_matcher import MatchOutcome, NameMatchResult, match_names


@dataclass
class VoPResult:
    """The full result of a VoP check."""
    iban: str
    submitted_name: str
    outcome: str  # MATCH | CLOSE_MATCH | NO_MATCH | NOT_CHECKED
    score: Optional[float]  # None when NOT_CHECKED
    account_holder_name: Optional[str]  # returned on CLOSE_MATCH only (privacy)
    account_type: Optional[str]  # personal | business

    @classmethod
    def not_checked(cls, iban: str, submitted_name: str, reason: str = "Account not found") -> "VoPResult":
        return cls(
            iban=iban,
            submitted_name=submitted_name,
            outcome="NOT_CHECKED",
            score=None,
            account_holder_name=None,
            account_type=None,
        )


class VoPBackend(Protocol):
    """
    Adapter interface for account-name resolution.

    The local backend queries the Account table. A production backend would
    call the EPC VoP gateway or the receiving bank's CIF.
    """

    def resolve_account(self, session: Session, iban: str) -> Optional[Account]:
        ...


class LocalAccountBackend:
    """Resolves accounts from the local (seeded) Account table."""

    def resolve_account(self, session: Session, iban: str) -> Optional[Account]:
        return session.execute(
            select(Account).where(Account.iban == iban)
        ).scalar_one_or_none()


def verify_payee(
    session: Session,
    iban: str,
    submitted_name: str,
    backend: Optional[VoPBackend] = None,
) -> VoPResult:
    """
    Verify that the submitted name matches the account holder for the given IBAN.

    Args:
        session: DB session
        iban: the beneficiary account IBAN
        submitted_name: the name the payer entered
        backend: optional account resolver (defaults to LocalAccountBackend)

    Returns a VoPResult with the outcome + (for CLOSE_MATCH) the real name.
    """
    iban = iban.strip().upper().replace(" ", "")
    backend = backend or LocalAccountBackend()

    account = backend.resolve_account(session, iban)
    if account is None:
        return VoPResult.not_checked(iban, submitted_name)

    match = match_names(submitted_name, account.account_holder_name)

    # Per EPC: account holder name is only revealed on CLOSE_MATCH (so the
    # payer can confirm). On NO_MATCH it's withheld for privacy. On MATCH
    # it's implicit (no need to return).
    return VoPResult(
        iban=iban,
        submitted_name=submitted_name,
        outcome=match.outcome.value,
        score=round(match.score, 4),
        account_holder_name=account.account_holder_name if match.outcome == MatchOutcome.CLOSE_MATCH else None,
        account_type=account.account_type,
    )
