"""Intermediary routing and US bank directory (Fedwire/FedACH)."""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import FedACHBank, FedwireBank
from ..schemas import RouteResponse, USBankInfo, USBankLookupResponse
from ..services.routing import (
    _normalize_bic_input,
    infer_destination_currency,
    is_us_routing_number,
    lookup_bank,
    lookup_us_bank,
    suggest_intermediaries,
)

router = APIRouter(prefix="/api", tags=["swift"])


@router.get("/route", response_model=RouteResponse)
def route(
    bic: str = Query(..., description="Beneficiary bank BIC or IBAN"),
    currency: str = Query(..., description="Destination currency, e.g. USD, NGN"),
    db: Session = Depends(get_db),
):
    """
    Return a likely intermediary bank chain for a payment.

    Routing is heuristic — real correspondent relationships are private and
    depend on the originator bank's Nostro network. Confidence levels are advisory.

    Accepts either a BIC/IBAN (international) or a 9-digit ABA routing number
    (US domestic, resolved via the imported Fedwire/FedACH directory).
    """
    currency = currency.strip().upper()

    # US routing-number path
    if is_us_routing_number(bic):
        bank = lookup_us_bank(db, bic)
        dest_country = "US"
        normalized = bic.strip().replace("-", "").replace(" ", "")
        # Domestic USD wire: no intermediary needed if both legs are US.
        if currency == "USD":
            return RouteResponse(
                bic=normalized,
                bank=bank,
                beneficiary_country=dest_country,
                currency=currency,
                valid=True,
                suggested_intermediaries=[],
                notes=(
                    "Domestic USD wire via Fedwire Funds — no SWIFT intermediary "
                    "required. Use the beneficiary's ABA routing number directly."
                ),
                source="fedwire-directory",
            )
        # Non-USD from a US bank: fall through to corridor suggestions below.

    else:
        normalized, valid, errors, detected_country = _normalize_bic_input(bic)
        if not valid:
            raise HTTPException(status_code=400, detail={"errors": errors})
        bank = lookup_bank(db, normalized)
        dest_country = bank.country_code if bank else detected_country

    # Infer destination currency: if the caller passed a funding currency
    # (e.g. USD) for a destination that uses a different local currency,
    # translate to the local currency so corridor rules match.
    dest_currency = infer_destination_currency(currency, bank, dest_country)

    suggestions = suggest_intermediaries(db, dest_currency, dest_country)

    notes = (
        "Routing is heuristic. Exact chain depends on originator bank's "
        "Nostro relationships and may differ from these suggestions."
    )
    if not suggestions:
        notes = (
            f"No curated corridor rule for currency={dest_currency} "
            f"country={dest_country}. Contact originator bank for exact chain."
        )

    return RouteResponse(
        bic=normalized,
        bank=bank,
        beneficiary_country=dest_country,
        currency=dest_currency,
        valid=True,
        suggested_intermediaries=suggestions,
        notes=notes,
        source="curated-corridor-table",
    )


# ---------------------------------------------------------------------------
# US bank directory (Fedwire / FedACH) — legitimate public FRB data
# ---------------------------------------------------------------------------


@router.get("/us-bank", response_model=USBankLookupResponse)
def us_bank_lookup(
    routing_number: str = Query(..., description="9-digit ABA routing number"),
    db: Session = Depends(get_db),
):
    """Look up a US bank by ABA routing number in the Fedwire/FedACH directory."""
    rtn = routing_number.strip().replace("-", "").replace(" ", "")
    if not (len(rtn) == 9 and rtn.isdigit()):
        raise HTTPException(
            status_code=400, detail="routing_number must be 9 digits"
        )

    # Prefer Fedwire (funds-transfer eligible) then FedACH.
    row = db.execute(
        select(FedwireBank).where(FedwireBank.routing_number == rtn)
    ).scalar_one_or_none()
    if row:
        return USBankLookupResponse(
            routing_number=rtn,
            bank=USBankInfo(
                routing_number=row.routing_number,
                customer_name=row.customer_name,
                telegraphic_name=row.telegraphic_name,
                city=row.city,
                state_code=row.state_code,
                funds_transfer=row.funds_transfer,
                source="fedwire",
            ),
            found=True,
        )

    row = db.execute(
        select(FedACHBank).where(FedACHBank.routing_number == rtn)
    ).scalar_one_or_none()
    if row:
        return USBankLookupResponse(
            routing_number=rtn,
            bank=USBankInfo(
                routing_number=row.routing_number,
                customer_name=row.customer_name,
                city=row.city,
                state_code=row.state_code,
                source="fedach",
            ),
            found=True,
        )

    return USBankLookupResponse(routing_number=rtn, bank=None, found=False)
