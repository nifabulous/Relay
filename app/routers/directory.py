"""Health check, IBAN/BIC validation, and bank directory lookup."""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import SSI, Bank, CorridorRule, FedACHBank, FedwireBank
from ..schemas import HealthResponse, LookupResponse, ValidateResponse
from ..services.routing import _normalize_bic_input, _settlement_for, lookup_bank
from ..services.validator import detect_type, validate_bic, validate_iban

router = APIRouter(prefix="/api", tags=["swift"])


@router.get("/health", response_model=HealthResponse)
def health(request: Request, db: Session = Depends(get_db)):
    # If seeding failed on startup, report degraded so monitoring catches it
    # (previously the error was swallowed to stderr and /health said "ok").
    seed_failed = getattr(request.app.state, "seed_failed", False)
    bank_count = db.query(Bank).count()
    status = "degraded" if (seed_failed or bank_count == 0) else "ok"
    return HealthResponse(
        status=status,
        banks=bank_count,
        corridor_rules=db.query(CorridorRule).count(),
        fedwire_banks=db.query(FedwireBank).count(),
        fedach_banks=db.query(FedACHBank).count(),
        ssi_records=db.query(SSI).count(),
    )


def _resolve_bank(db: Session, bic: Optional[str]):
    """Resolve the directory entry behind a validated BIC, or None.

    ValidateResponse has always declared `bank: Optional[BankInfo]`, but the
    router never populated it, so the field could not be non-null for any input
    — the declared contract and the OpenAPI docs both promised something the
    endpoint never delivered, and callers reading `validation.bank` fell back
    forever without any signal. Absent from the directory is not an error here;
    it is simply a null bank.
    """
    if not bic:
        return None
    normalized, valid, _errors, _ = _normalize_bic_input(bic)
    if not valid:
        return None
    return lookup_bank(db, normalized)


@router.get("/validate", response_model=ValidateResponse)
def validate(
    value: str = Query(..., description="IBAN or BIC to validate"),
    db: Session = Depends(get_db),
):
    """Validate an IBAN or BIC. Type is auto-detected.

    When the input resolves to a BIC that is in the directory, the bank is
    returned alongside it, so a caller does not need a second /lookup round
    trip to name the institution.
    """
    raw = value.strip()
    input_type = detect_type(raw)

    if input_type == "iban":
        result = validate_iban(raw)
        return ValidateResponse(
            input=raw,
            input_type="iban",
            valid=result.valid,
            bic=result.bic,
            bank=_resolve_bank(db, result.bic) if result.valid else None,
            errors=result.errors,
        )

    # BIC
    valid, normalized, country, errors = validate_bic(raw)
    return ValidateResponse(
        input=raw,
        input_type="bic",
        valid=valid,
        bic=normalized,
        bank=_resolve_bank(db, normalized) if valid else None,
        errors=errors,
    )


@router.get("/lookup", response_model=LookupResponse)
def lookup(
    bic: str = Query(..., description="BIC of the bank to look up"),
    db: Session = Depends(get_db),
):
    """Look up a bank in the directory by BIC."""
    normalized, valid, errors, _ = _normalize_bic_input(bic)
    if not valid:
        raise HTTPException(status_code=400, detail={"errors": errors})

    bank = lookup_bank(db, normalized)
    return LookupResponse(
        bic=normalized,
        bank=bank,
        found=bank is not None,
        settlement=_settlement_for(normalized),
    )
