"""
Fee calculator service — simulates how fees are deducted at each hop
of a correspondent banking chain.

Given an amount, currency, charge code, and the intermediary chain,
computes the fee at each hop and the final amount the beneficiary receives.

Charge codes:
  OUR — sender pays all fees; beneficiary receives full amount
  SHA — fees deducted from amount at each hop (most common)
  BEN — beneficiary pays all fees (same as SHA deduction)
"""

from __future__ import annotations

import logging

logger = logging.getLogger(__name__)


from dataclasses import dataclass, field
from typing import List, Optional

from .seed import LIFT_FEES


@dataclass
class FeeHop:
    """A single hop in the fee chain."""
    bic: str
    bank_name: str
    fee: float
    amount_in: float
    amount_out: float
    cumulative_fees: float


@dataclass
class FeeResult:
    """The complete fee simulation result."""
    charge_code: str
    currency: str
    sent_amount: float
    received_amount: float
    total_fees: float
    hops: List[FeeHop] = field(default_factory=list)
    sender_pays_extra: float = 0.0  # for OUR: fees the sender pays on top


def _get_lift_fee(intermediary_bic: str, currency: str) -> float:
    """Look up the lift fee for a given intermediary + currency."""
    # Try exact match first
    for bic, name, ccy, fee, fee_type in LIFT_FEES:
        if bic == intermediary_bic and ccy == currency:
            return fee
    # Fall back to generic
    for bic, name, ccy, fee, fee_type in LIFT_FEES:
        if bic == "GENERIC" and ccy == currency:
            return fee
    # Ultimate fallback
    return 15.00


def simulate_fees(
    amount: float,
    currency: str,
    charge_code: str,
    intermediary_bics: List[str],
    intermediary_names: Optional[List[str]] = None,
) -> FeeResult:
    """
    Simulate the fee chain for a payment.

    Args:
        amount: the original send amount
        currency: 3-letter currency code
        charge_code: OUR, SHA, or BEN
        intermediary_bics: list of intermediary BICs in order
        intermediary_names: optional names (defaults to BIC)

    Returns a FeeResult with per-hop breakdown.
    """
    charge_code = charge_code.strip().upper()
    if charge_code not in ("OUR", "SHA", "BEN"):
        charge_code = "SHA"

    if intermediary_names is None:
        intermediary_names = []

    hops: List[FeeHop] = []
    current_amount = amount
    cumulative = 0.0

    # BEN: the sender's own bank fee is also deducted from the amount
    # (unlike SHA where the sender pays their bank separately).
    # This models a realistic sender-bank outgoing fee.
    SENDER_BANK_FEE = 25.0  # typical outgoing cross-border fee
    if charge_code == "BEN":
        current_amount = round(current_amount - SENDER_BANK_FEE, 2)
        cumulative = SENDER_BANK_FEE
        hops.append(FeeHop(
            bic="SENDER_BANK",
            bank_name="Sender's Bank (outgoing fee)",
            fee=SENDER_BANK_FEE,
            amount_in=amount,
            amount_out=current_amount,
            cumulative_fees=cumulative,
        ))

    for i, bic in enumerate(intermediary_bics):
        name = (
            intermediary_names[i]
            if i < len(intermediary_names)
            else bic
        )
        fee = _get_lift_fee(bic, currency)

        if charge_code == "OUR":
            # Sender pays all fees — amount doesn't decrease at hops
            amount_in = amount
            amount_out = amount
            cumulative += fee
        else:
            # SHA/BEN — fee deducted from amount at each hop
            amount_in = current_amount
            current_amount = round(current_amount - fee, 2)
            amount_out = current_amount
            cumulative = round(cumulative + fee, 2)

        hops.append(FeeHop(
            bic=bic,
            bank_name=name,
            fee=fee,
            amount_in=amount_in,
            amount_out=amount_out,
            cumulative_fees=cumulative,
        ))

    if charge_code == "OUR":
        received = amount
        sender_extra = cumulative
    else:
        received = current_amount
        sender_extra = 0.0

    return FeeResult(
        charge_code=charge_code,
        currency=currency,
        sent_amount=amount,
        received_amount=round(received, 2),
        total_fees=round(cumulative, 2),
        hops=hops,
        sender_pays_extra=round(sender_extra, 2),
    )
