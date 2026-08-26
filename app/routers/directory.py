"""Health check, IBAN/BIC validation, and bank directory lookup."""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import and_, func, not_, or_, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import SSI, Bank, CorridorRule, FedACHBank, FedwireBank
from ..schemas import BankSearchResponse, HealthResponse, LookupResponse, ValidateResponse
from ..services.routing import _normalize_bic_input, _settlement_for, lookup_bank
from ..services.validator import detect_type, validate_bic, validate_iban

router = APIRouter(prefix="/api", tags=["swift"])


def _is_swift_active(value: Optional[str]) -> bool:
    """Treat absent connectivity as SWIFT-capable; only N-like values are local."""
    return (value or "Y").upper() == "Y"


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


def _escape_like_token(value: str) -> str:
    """Escape SQL LIKE wildcards while preserving ordinary name search."""
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


@router.get("/banks/search", response_model=BankSearchResponse)
def search_banks(
    q: Optional[str] = Query(None, max_length=80, description="Bank name or partial BIC to search"),
    limit: int = Query(8, ge=1, le=100, description="Maximum number of matches"),
    offset: int = Query(0, ge=0, description="Number of matches to skip"),
    country: Optional[str] = Query(None, min_length=2, max_length=2, description="ISO country code"),
    capability: Optional[str] = Query(None, pattern="^(all|swift|local)$", description="Directory connectivity"),
    verified: Optional[bool] = Query(None, description="Only banks with at least one settlement instruction"),
    db: Session = Depends(get_db),
):
    """Browse or search the complete routing directory from one source."""
    normalized = " ".join((q or "").split())
    filters = []

    if normalized:
        name_filters = [
            Bank.bank_name.ilike(
                f"%{_escape_like_token(token)}%",
                escape="\\",
            )
            for token in normalized.split()
        ]
        bic_filters = [
            Bank.bic.ilike(
                f"%{_escape_like_token(token)}%",
                escape="\\",
            )
            for token in normalized.split()
        ]
        # A token may match either the name OR the BIC; multi-token queries still
        # require every token to appear somewhere in that identity.
        filters.append(and_(
            *(or_(name_filter, bic_filter) for name_filter, bic_filter in zip(name_filters, bic_filters))
        ))

    normalized_country = country.upper() if country else None
    if normalized_country:
        filters.append(Bank.country_code == normalized_country)

    normalized_capability = None if capability == "all" else capability
    swift_active = func.upper(func.coalesce(Bank.swift_active, "Y")) == "Y"
    if normalized_capability == "swift":
        filters.append(swift_active)
    elif normalized_capability == "local":
        filters.append(not_(swift_active))

    verified_exists = select(SSI.id).where(SSI.beneficiary_bic == Bank.bic).exists()
    if verified is True:
        filters.append(verified_exists)
    elif verified is False:
        filters.append(~verified_exists)

    has_ssi = select(SSI.id).where(SSI.beneficiary_bic == Bank.bic).exists()

    total = db.execute(select(func.count()).select_from(Bank).where(*filters)).scalar_one()
    banks = (
        db.execute(
            select(Bank)
            .add_columns(has_ssi.label("has_ssi"))
            .where(*filters)
            .order_by(Bank.bank_name.asc(), Bank.bic.asc())
            .offset(offset)
            .limit(limit)
        )
        .all()
    )

    return BankSearchResponse(
        query=normalized,
        results=[
            {
                "bic": bank.bic,
                "bank_name": bank.bank_name,
                "country_code": bank.country_code,
                "city": bank.city,
                "country_currency": bank.country_currency,
                "capability": "swift" if _is_swift_active(bank.swift_active) else "local",
                "verified": bool(bank_has_ssi),
            }
            for bank, bank_has_ssi in banks
        ],
        total=total,
    )
