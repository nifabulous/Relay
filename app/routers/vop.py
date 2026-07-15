"""Verification of Payee (VoP) — EPC103-24 compliant name verification."""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..db import get_db
from ..schemas import VoPRequest, VoPResponse
from ..services.vop import verify_payee
from ._shared import _VOP_ADVICE

router = APIRouter(prefix="/api", tags=["swift"])


@router.post("/verify-payee", response_model=VoPResponse)
def verify_payee_endpoint(request: VoPRequest, db: Session = Depends(get_db)):
    """
    Verify that a beneficiary name matches the account holder for the given IBAN.

    Returns MATCH / CLOSE_MATCH / NO_MATCH / NOT_CHECKED per the EPC VoP scheme.
    On CLOSE_MATCH, the actual account holder name is returned for payer review.
    On NO_MATCH, the name is withheld for privacy.

    NOTE: This uses a local synthetic account registry. In production, this
    would call the EPC VoP gateway (SurePay, Tink, TrueLayer) or the receiving
    bank's core banking system.
    """
    result = verify_payee(db, request.iban, request.name)
    return VoPResponse(
        iban=result.iban,
        submitted_name=result.submitted_name,
        outcome=result.outcome,
        score=result.score,
        account_holder_name=result.account_holder_name,
        account_type=result.account_type,
        advice=_VOP_ADVICE.get(result.outcome, "Unknown outcome."),
    )
