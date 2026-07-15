"""Standard Settlement Instructions (SSI) lookup."""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import SSI
from ..schemas import SSIRecord, SSIResponse
from ..services.routing import _normalize_bic_input
from ._shared import _SSI_DISCLAIMER

router = APIRouter(prefix="/api", tags=["swift"])


@router.get("/ssi", response_model=SSIResponse)
def get_ssi(
    bic: str = Query(..., description="Beneficiary bank BIC"),
    currency: Optional[str] = Query(
        None, description="Filter by currency (e.g. USD). If omitted, returns all."
    ),
    db: Session = Depends(get_db),
):
    """
    Return Standard Settlement Instructions for a beneficiary bank.

    Unlike /route (heuristic intermediary suggestions), SSI records carry the
    actual Nostro account numbers and charge codes that make a payment settle.
    """
    normalized, valid, errors, _ = _normalize_bic_input(bic)
    if not valid:
        raise HTTPException(status_code=400, detail={"errors": errors})

    ccy = currency.strip().upper() if currency else None

    # Match on the full 11-char BIC, then the 8-char prefix, then 6-char.
    candidates = [normalized, normalized[:8] + "XXX", normalized[:6] + "XXXXX"]
    rows = []
    for cand in candidates:
        q = select(SSI).where(SSI.beneficiary_bic == cand)
        if ccy:
            q = q.where(SSI.currency == ccy)
        rows = db.execute(q).scalars().all()
        if rows:
            break

    instructions = [
        SSIRecord(
            beneficiary_bic=r.beneficiary_bic,
            beneficiary_bank_name=r.beneficiary_bank_name,
            currency=r.currency,
            intermediary_bic=r.intermediary_bic,
            intermediary_bank_name=r.intermediary_bank_name,
            intermediary_account=r.intermediary_account,
            beneficiary_account=r.beneficiary_account,
            charge_code=r.charge_code,
            value_date=r.value_date,
            notes=r.notes,
        )
        for r in rows
    ]

    return SSIResponse(
        beneficiary_bic=normalized,
        currency=ccy or "ALL",
        instructions=instructions,
        disclaimer=_SSI_DISCLAIMER,
    )
