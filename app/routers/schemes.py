"""Payment schemes — domestic rails by currency."""
from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from ..data.payment_schemes import get_schemes_for_currency, list_currencies_with_schemes

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
