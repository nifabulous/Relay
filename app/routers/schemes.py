"""Payment schemes — domestic rails by currency, plus the international / SWIFT catalogue."""
from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from ..data.payment_schemes import (
    get_international_schemes,
    get_schemes_for_currency,
    list_currencies_with_schemes,
)
from ..schemas import InternationalSchemesResponse

router = APIRouter(prefix="/api", tags=["swift"])


@router.get("/schemes")
def get_payment_schemes(
    currency: Optional[str] = Query(
        None, description="3-letter currency code (e.g. GBP, CAD, USD). If omitted, lists all."
    ),
):
    """
    Return domestic payment schemes for a currency.

    Each currency has its own domestic rails with different speed, cost, and
    limits. For example, GBP has Faster Payments (instant), CHAPS (high-value),
    and Bacs (batch). CAD has Interac (instant), EFT (batch), and Lynx (RTGS).

    This is educational data — always check the operator's current rules.
    """
    if currency:
        data = get_schemes_for_currency(currency)
        if data is None:
            raise HTTPException(
                status_code=404,
                detail=f"No scheme data for currency '{currency}'. Supported: {', '.join(list_currencies_with_schemes())}",
            )
        return data

    # List all
    return {
        "currencies": list_currencies_with_schemes(),
        "count": len(list_currencies_with_schemes()),
    }


@router.get("/schemes/international", response_model=InternationalSchemesResponse)
def get_payment_schemes_international():
    """
    Return the International / SWIFT catalogue entry (SWIFT gpi).

    SWIFT gpi is the cross-border correspondent-payment overlay: same-day to
    1-3 business days depending on corridor and cut-off, bank/correspondent-set
    fees and limits, correspondent routing, UETR tracking, and MT103/pacs.008
    references. The roadmap section notes the CBPR+ / ISO 20022 direction of
    travel — explicitly roadmap, not current behaviour.

    This is educational data — always check the operator's current rules.
    """
    return get_international_schemes()
