"""SWIFT gpi payment tracking (UETR)."""
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import admin_required
from ..db import get_db
from ..models import PaymentEvent
from ..schemas import PaymentEventInfo, TrackPaymentRequest, TrackPaymentResponse
from ..services.idempotency import resolve_uetr
from ..services.tracking import (
    advance_payment,
    complete_payment,
    generate_timeline,
    generate_uetr,
    get_payment_status,
)
from ._shared import _TRACKING_DISCLAIMER

router = APIRouter(prefix="/api", tags=["swift"])


@router.post("/track/create", response_model=TrackPaymentResponse, dependencies=[Depends(admin_required)])
def create_tracked_payment(
    request: TrackPaymentRequest,
    db: Session = Depends(get_db),
    idempotency_key: Optional[str] = Header(default=None, alias="Idempotency-Key"),
):
    """
    Create a payment with UETR tracking and generate a simulated gpi timeline.

    This is the admin/demo path: the timeline is created "instant" — every
    event of the chain is visible immediately and the response is terminal
    (CREDITED or REJECTED). Prepared payments (POST /api/prepare-payment)
    are the only scheduled flow; they reveal their timeline gradually and
    are advanced via POST /api/track/{uetr}/skip|complete.

    Generates a UETR (UUID v4 per SWIFT gpi spec), then creates status events
    for each hop in the correspondent chain: INITIATED → ACCEPTED →
    IN_PROGRESS → FORWARDED → ... → CREDITED.

    Set `outcome: "rejected"` to simulate a compliance rejection at the
    first intermediary.
    """
    if request.outcome not in ("credited", "rejected"):
        raise HTTPException(
            status_code=400,
            detail="outcome must be 'credited' or 'rejected'",
        )
    if len(request.intermediary_bics) != len(request.intermediary_names):
        raise HTTPException(
            status_code=400,
            detail="intermediary_bics and intermediary_names must have equal length",
        )

    uetr = resolve_uetr(db, idempotency_key, "track/create", generate_uetr)

    # If this UETR already has a timeline (replay of same idempotency key),
    # return the existing timeline instead of duplicating it.
    existing = db.execute(
        select(PaymentEvent).where(PaymentEvent.uetr == uetr).limit(1)
    ).scalar_one_or_none()
    if existing:
        return _build_track_response(uetr, get_payment_status(db, uetr))

    generate_timeline(
        session=db,
        uetr=uetr,
        originator_bic=request.originator_bic,
        originator_name=request.originator_name,
        beneficiary_bic=request.beneficiary_bic,
        beneficiary_name=request.beneficiary_name,
        intermediary_bics=request.intermediary_bics,
        intermediary_names=request.intermediary_names,
        currency=request.currency,
        amount=request.amount,
        charge_code=request.charge_code,
        outcome=request.outcome,
        schedule="instant",
    )

    status = get_payment_status(db, uetr)
    return _build_track_response(uetr, status)


@router.get("/track/{uetr}", response_model=TrackPaymentResponse)
def get_tracked_payment(uetr: str, db: Session = Depends(get_db)):
    """
    Retrieve the tracking timeline for a payment by its UETR.

    The UETR is the 36-character UUID assigned at initiation, embedded in
    MT103 field 121 / pacs.008. This returns the status summary of the
    events *visible now*: instant admin/demo payments are fully visible,
    while scheduled prepared payments reveal events as their planned
    timestamps arrive (or as they are advanced via
    POST /api/track/{uetr}/skip|complete). Hidden plan rows are never
    exposed here.
    """
    status = get_payment_status(db, uetr)
    if status is None:
        raise HTTPException(status_code=404, detail=f"No payment found for UETR {uetr}")
    return _build_track_response(uetr, status)


@router.post("/track/{uetr}/skip", response_model=TrackPaymentResponse)
def skip_tracked_payment(uetr: str, db: Session = Depends(get_db)):
    """
    Advance a scheduled payment by exactly one event (learner control).

    Reveals the next hidden event of a prepared payment's planned chain, in
    hop order, and returns the updated tracking snapshot. Unlike the instant
    admin/demo creation endpoint, prepared payments start with only
    INITIATED visible; this control lets a learner step through the journey.
    Safe to repeat: each call reveals one more event until the plan is
    terminal, then becomes a no-op. No-op for instant timelines (already
    fully visible). Hidden plan rows are never exposed beyond what this
    single step reveals. Unknown UETRs return 404.
    """
    status = advance_payment(db, uetr)
    if status is None:
        raise HTTPException(status_code=404, detail=f"No payment found for UETR {uetr}")
    return _build_track_response(uetr, status)


@router.post("/track/{uetr}/complete", response_model=TrackPaymentResponse)
def complete_tracked_payment(uetr: str, db: Session = Depends(get_db)):
    """
    Reveal a scheduled payment's entire remaining plan (learner control).

    Makes every hidden event of a prepared payment visible at once and
    returns the terminal tracking snapshot — the counterpart to skip's
    one-step reveal. Safe to repeat: once the plan is fully revealed the
    call is a no-op and returns the current terminal state. No-op for
    instant timelines (already fully visible). Hidden plan rows are only
    exposed through this explicit reveal. Unknown UETRs return 404.
    """
    status = complete_payment(db, uetr)
    if status is None:
        raise HTTPException(status_code=404, detail=f"No payment found for UETR {uetr}")
    return _build_track_response(uetr, status)


def _build_track_response(uetr: str, status: dict) -> TrackPaymentResponse:
    """Convert the status dict + events into the API response."""
    return TrackPaymentResponse(
        uetr=uetr,
        current_status=status["current_status"],
        is_terminal=status["is_terminal"],
        event_count=status["event_count"],
        sent_amount=status["sent_amount"],
        final_amount=status["final_amount"],
        total_fees=status["total_fees"],
        last_updated=status["last_updated"],
        timeline=[
            PaymentEventInfo(
                status=e.status,
                bank_bic=e.bank_bic,
                bank_name=e.bank_name,
                hop=e.hop,
                timestamp=e.timestamp,
                amount=e.amount,
                currency=e.currency,
                message=e.message,
                instructing_bic=e.instructing_bic,
                instructed_bic=e.instructed_bic,
            )
            for e in status["timeline"]
        ],
        disclaimer=_TRACKING_DISCLAIMER,
    )
