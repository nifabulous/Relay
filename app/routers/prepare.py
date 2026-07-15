"""Combined prepare-payment endpoint — orchestrates all pre-send checks."""
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.orm import Session

from ..db import get_db
from ..schemas import PreparePaymentRequest, PreparePaymentResponse
from ..services.prepare import prepare_payment

router = APIRouter(prefix="/api", tags=["swift"])


@router.post("/prepare-payment", response_model=PreparePaymentResponse)
def prepare_payment_endpoint(
    request: PreparePaymentRequest,
    db: Session = Depends(get_db),
    idempotency_key: Optional[str] = Header(default=None, alias="Idempotency-Key"),
):
    """
    Run all pre-send checks in one call and return a single recommendation.

    Orchestrates: validation → VoP (name verification) → routing (intermediaries)
    → SSI (settlement instructions), then runs a recommendation engine that
    combines the four signals into one of:

    - **PROCEED** — all checks passed, safe to send
    - **PROCEED_WITH_CAUTION** — sendable, but SSI accounts unverified or name close
    - **REVIEW** — name is a close match; payer must confirm (standard strictness)
    - **CAUTION** — payee couldn't be verified; proceed at own risk
    - **STOP** — name doesn't match (likely wrong account / fraud) or strict mode blocked
    - **BLOCKED** — no route to destination for this currency
    - **REJECT** — beneficiary details failed validation

    The `recommendation` field is the single go/no-go signal for a UI. A UETR
    is generated to bridge to the tracking endpoint if the payment is sent.
    """
    if request.strictness not in ("lenient", "standard", "strict"):
        raise HTTPException(
            status_code=400,
            detail="strictness must be 'lenient', 'standard', or 'strict'",
        )

    from ..services.idempotency import resolve_uetr
    from ..services.tracking import generate_uetr

    resolved_uetr = resolve_uetr(db, idempotency_key, "prepare-payment", generate_uetr)

    result = prepare_payment(
        session=db,
        beneficiary_iban=request.beneficiary_iban,
        beneficiary_name=request.beneficiary_name,
        currency=request.currency,
        beneficiary_bic=request.beneficiary_bic,
        amount=request.amount,
        strictness=request.strictness,
        uetr=resolved_uetr,
    )

    return PreparePaymentResponse(
        recommendation=result.recommendation.recommendation.value,
        reason=result.recommendation.reason,
        is_blocking=result.recommendation.is_blocking,
        uetr=result.uetr,
        validation=result.validation,
        vop=result.vop,
        routing=result.routing,
        ssi=result.ssi,
        warnings=result.recommendation.warnings,
        blocks=result.recommendation.blocks,
    )
