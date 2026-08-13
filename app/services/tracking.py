"""
SWIFT gpi payment tracking service.

Provides:
  - UETR generation (UUID v4, per SWIFT gpi spec)
  - Simulated status timeline generation for a payment
  - Timeline retrieval

LIMITATION — IMPORTANT:
  Real SWIFT gpi tracking requires querying the SWIFT gpi tracker database via
  SWIFT's API gateway (requires SWIFT membership + Alliance Cloud / service
  bureau). We cannot do that here. This service SIMULATES the timeline by
  generating realistic status events based on the payment's routing chain.

  The data model (PaymentEvent) and API contract match the real gpi spec,
  so swapping the simulator for a real SWIFT connection later requires only
  replacing the `generate_timeline` function with a gateway call.
"""

from __future__ import annotations

import logging

logger = logging.getLogger(__name__)


import uuid
from datetime import datetime, timedelta, timezone
from typing import List, Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import PaymentEvent
from .fee_calculator import get_lift_fee

# Status codes per SWIFT gpi conventions
STATUS_INITIATED = "INITIATED"
STATUS_ACCEPTED = "ACCEPTED"
STATUS_IN_PROGRESS = "IN_PROGRESS"
STATUS_FORWARDED = "FORWARDED"
STATUS_CREDITED = "CREDITED"
STATUS_REJECTED = "REJECTED"
STATUS_RETURNED = "RETURNED"

TERMINAL_STATUSES = {STATUS_CREDITED, STATUS_REJECTED, STATUS_RETURNED}


def generate_uetr() -> str:
    """Generate a UETR — a UUID v4 per SWIFT gpi spec (field 121 of MT103)."""
    return str(uuid.uuid4())


def _iso(dt: datetime) -> str:
    return dt.isoformat().replace("+00:00", "Z")


def _parse_iso(value: str) -> datetime:
    """Parse a stored ISO timestamp into an aware UTC datetime.

    Stored timestamps are produced by `_iso` (which emits a trailing "Z"),
    but legacy/naive strings may also be present, so both aware and naive
    inputs are normalized to aware UTC before comparison.
    """
    dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _event_is_visible(event: PaymentEvent, now: datetime) -> bool:
    """Visibility predicate: an event is visible when it is instant, its
    planned timestamp has arrived (at or before `now`), or it has been
    manually revealed (revealed_at set). Scheduled future rows stay hidden."""
    if event.schedule != "scheduled":
        return True
    if event.revealed_at is not None:
        return True
    return _parse_iso(event.timestamp) <= now


def generate_timeline(
    session: Session,
    uetr: str,
    originator_bic: str,
    originator_name: str,
    beneficiary_bic: str,
    beneficiary_name: str,
    intermediary_bics: List[str],
    intermediary_names: List[str],
    currency: str,
    amount: float,
    charge_code: str = "SHA",
    outcome: str = "credited",
    start_time: Optional[datetime] = None,
    schedule: str = "instant",
) -> List[PaymentEvent]:
    """
    Generate a simulated gpi status timeline for a payment.

    The chain: originator → [intermediaries...] → beneficiary.
    Each hop gets ACCEPTED + FORWARDED events; the final gets CREDITED.

    Args:
        outcome: "credited" (success) | "rejected". A rejection fires at the
            first intermediary when there is one; with no intermediaries the
            beneficiary's own bank refuses it, since that is the only bank in
            the chain that can.
        schedule: "instant" (default, today's behavior) or "scheduled". A
            scheduled timeline persists the full planned chain but only
            exposes events whose planned timestamp has arrived (or that have
            been manually revealed via revealed_at). No reveal state is set
            here: the INITIATED event's planned timestamp equals `start`, so
            the visibility predicate exposes it at read time.
    """
    start = start_time or datetime.now(timezone.utc)
    events: List[PaymentEvent] = []
    current_amount = amount
    t = start
    hop = 0

    # Build the full chain: originator, intermediaries, beneficiary
    chain = [(originator_bic, originator_name)]
    for bic, name in zip(intermediary_bics, intermediary_names):
        chain.append((bic, name))
    chain.append((beneficiary_bic, beneficiary_name))

    # Hop 0: originator initiates
    events.append(PaymentEvent(
        uetr=uetr, status=STATUS_INITIATED, bank_bic=originator_bic,
        bank_name=originator_name, hop=hop, timestamp=_iso(t),
        amount=f"{current_amount:.2f}", currency=currency,
        charge_code=charge_code, schedule=schedule,
        message=f"Payment initiated by {originator_name}",
        instructing_bic=None, instructed_bic=chain[1][0] if len(chain) > 1 else None,
    ))
    hop += 1

    # Walk the intermediary hops
    for i, (bic, name) in enumerate(chain[1:-1], start=1):
        # Intermediary accepts
        t += timedelta(seconds=30 + i * 20)
        events.append(PaymentEvent(
            uetr=uetr, status=STATUS_ACCEPTED, bank_bic=bic, bank_name=name,
            hop=hop, timestamp=_iso(t),
            amount=f"{current_amount:.2f}", currency=currency,
            charge_code=charge_code, schedule=schedule,
            message=f"Accepted by {name} for processing",
            instructing_bic=chain[i - 1][0], instructed_bic=bic,
        ))
        hop += 1

        # If rejection outcome, reject at the first intermediary
        if outcome == "rejected" and i == 1:
            t += timedelta(seconds=90)
            events.append(PaymentEvent(
                uetr=uetr, status=STATUS_REJECTED, bank_bic=bic, bank_name=name,
                hop=hop, timestamp=_iso(t),
                amount=f"{current_amount:.2f}", currency=currency,
                charge_code=charge_code, schedule=schedule,
                message=f"Rejected by {name}: compliance screening failed",
                instructing_bic=chain[i - 1][0], instructed_bic=None,
            ))
            session.add_all(events)
            session.commit()
            return events

        # In progress
        t += timedelta(seconds=60)
        events.append(PaymentEvent(
            uetr=uetr, status=STATUS_IN_PROGRESS, bank_bic=bic, bank_name=name,
            hop=hop, timestamp=_iso(t),
            amount=f"{current_amount:.2f}", currency=currency,
            charge_code=charge_code, schedule=schedule,
            message=f"Processing at {name}",
            instructing_bic=chain[i - 1][0], instructed_bic=bic,
        ))
        hop += 1

        # Forwarded (Nostro debited). Apply a fee deduction for SHA/BEN using
        # the SAME lift-fee table as /api/fees/simulate — the tracker and the
        # fee simulator must tell one story about what a hop costs.
        t += timedelta(seconds=45)
        if charge_code != "OUR":
            current_amount = round(current_amount - get_lift_fee(bic, currency), 2)
        events.append(PaymentEvent(
            uetr=uetr, status=STATUS_FORWARDED, bank_bic=bic, bank_name=name,
            hop=hop, timestamp=_iso(t),
            amount=f"{current_amount:.2f}", currency=currency,
            charge_code=charge_code, schedule=schedule,
            message=f"Forwarded by {name} to next bank in chain",
            instructing_bic=bic, instructed_bic=chain[i + 1][0],
        ))
        hop += 1

    # Final hop: beneficiary bank credits the account
    ben_bic, ben_name = chain[-1]
    t += timedelta(seconds=60)
    events.append(PaymentEvent(
        uetr=uetr, status=STATUS_ACCEPTED, bank_bic=ben_bic, bank_name=ben_name,
        hop=hop, timestamp=_iso(t),
        amount=f"{current_amount:.2f}", currency=currency,
        charge_code=charge_code, schedule=schedule,
        message=f"Received by {ben_name}",
        instructing_bic=chain[-2][0], instructed_bic=ben_bic,
    ))
    hop += 1
    t += timedelta(seconds=90)

    # A rejection with at least one intermediary already returned early above, at
    # i == 1. So reaching here with outcome="rejected" means there was no
    # correspondent in the chain, and the only bank that can refuse the payment
    # is the beneficiary's own. Without this branch the caller's requested
    # outcome was silently discarded and every direct payment ended CREDITED.
    if outcome == "rejected":
        events.append(PaymentEvent(
            uetr=uetr, status=STATUS_REJECTED, bank_bic=ben_bic, bank_name=ben_name,
            hop=hop, timestamp=_iso(t),
            amount=f"{current_amount:.2f}", currency=currency,
            charge_code=charge_code, schedule=schedule,
            message=f"Rejected by {ben_name}: compliance screening failed",
            instructing_bic=chain[-2][0], instructed_bic=None,
        ))
    else:
        events.append(PaymentEvent(
            uetr=uetr, status=STATUS_CREDITED, bank_bic=ben_bic, bank_name=ben_name,
            hop=hop, timestamp=_iso(t),
            amount=f"{current_amount:.2f}", currency=currency,
            charge_code=charge_code, schedule=schedule,
            message=f"Credited to beneficiary account by {ben_name}",
            instructing_bic=chain[-2][0], instructed_bic=ben_bic,
        ))

    session.add_all(events)
    session.commit()
    return events


def get_timeline(session: Session, uetr: str) -> List[PaymentEvent]:
    """Retrieve the full status timeline for a UETR, ordered by hop."""
    return list(
        session.execute(
            select(PaymentEvent)
            .where(PaymentEvent.uetr == uetr)
            .order_by(PaymentEvent.hop, PaymentEvent.id)
        ).scalars().all()
    )


def get_visible_timeline(
    session: Session,
    uetr: str,
    now: Optional[datetime] = None,
) -> List[PaymentEvent]:
    """Retrieve the events visible at `now` (UTC), ordered by hop.

    Instant events are always visible; scheduled events are visible once
    their planned timestamp is at or before `now`, or once they have been
    manually revealed (revealed_at set). Hidden plan rows are persisted and
    untouched — visibility is computed at read time only. `now` defaults to
    the current UTC time.
    """
    now = now or datetime.now(timezone.utc)
    if now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)
    return [e for e in get_timeline(session, uetr) if _event_is_visible(e, now)]


def get_payment_status(
    session: Session,
    uetr: str,
    now: Optional[datetime] = None,
) -> Optional[dict]:
    """
    Get the current status of a payment: its visible timeline + terminal
    status (if any). Only visible events contribute: a scheduled payment
    with a single visible INITIATED event is non-terminal and exposes no
    final amount or fees (no future status leakage). Returns None if the
    UETR has no events.
    """
    all_events = get_timeline(session, uetr)
    if not all_events:
        return None

    events = get_visible_timeline(session, uetr, now=now)
    if not events:
        # The plan exists but no event is due yet (e.g. a clock read before
        # the initiation timestamp). Report a non-terminal, cash-less state
        # rather than leaking the first planned status.
        return {
            "uetr": uetr,
            "current_status": STATUS_INITIATED,
            "is_terminal": False,
            "event_count": 0,
            "sent_amount": all_events[0].amount,
            "final_amount": None,
            "total_fees": None,
            "last_updated": None,
            "timeline": [],
        }

    latest = events[-1]
    sent_amount = events[0].amount
    final_amount = latest.amount

    return {
        "uetr": uetr,
        "current_status": latest.status,
        "is_terminal": latest.status in TERMINAL_STATUSES,
        "event_count": len(events),
        "sent_amount": sent_amount,
        "final_amount": final_amount if latest.status == STATUS_CREDITED else None,
        "total_fees": (
            round(float(sent_amount) - float(final_amount), 2)
            if latest.status == STATUS_CREDITED and sent_amount and final_amount
            else None
        ),
        "last_updated": latest.timestamp,
        "timeline": events,
    }
