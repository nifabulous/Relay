"""
Validation service.

Uses `schwifty` for IBAN/BIC checksum + format validation, and derives
the BIC from an IBAN where the national registry provides it. This is the
free, deterministic layer — name/account-existence verification still needs
a scheme service (VoP/CoP) or vendor API.
"""

from __future__ import annotations

import logging

logger = logging.getLogger(__name__)


from dataclasses import dataclass
from typing import Optional, Tuple

from schwifty import BIC, IBAN


def validate_currency_code(currency: str) -> str:
    """
    Validate and normalize a 3-letter ISO 4217 currency code.
    Returns the uppercase code if valid, raises ValueError if not.
    """
    c = (currency or "").strip().upper()
    if len(c) != 3 or not c.isalpha():
        raise ValueError(
            f"Invalid currency code: {currency!r} — must be exactly 3 letters (e.g. USD, EUR, GBP)"
        )
    return c


@dataclass
class ValidationResult:
    input_value: str
    input_type: str  # 'iban' | 'bic'
    valid: bool
    bic: Optional[str] = None
    errors: list[str] = None
    country_code: Optional[str] = None

    def __post_init__(self):
        if self.errors is None:
            self.errors = []


def detect_type(value: str) -> str:
    """
    Heuristic: starts with 2 letters + 2 digits -> IBAN, else assume BIC.
    Requires minimum 15 chars for IBAN (shortest valid IBAN is Norway at 15).
    Shorter strings that match the pattern are treated as BIC.
    """
    v = value.strip().upper().replace(" ", "")
    if len(v) >= 15 and v[:2].isalpha() and v[2:4].isdigit():
        return "iban"
    return "bic"


def validate_iban(iban_str: str) -> ValidationResult:
    """Validate an IBAN and return the derived BIC + country code."""
    errors: list[str] = []
    bic: Optional[str] = None
    country: Optional[str] = None
    valid = False

    try:
        iban = IBAN(iban_str, validate_bban=True)
        valid = True
        country = iban.country_code
        # schwifty can derive BIC for many countries from the registry.
        try:
            bic = str(iban.bic)
        except Exception:
            # BIC can't be derived for this national scheme — IBAN still valid.
            bic = None
    except ValueError as e:
        errors.append(f"IBAN invalid: {e}")
    except Exception as e:
        errors.append(f"IBAN validation error: {e}")

    return ValidationResult(
        input_value=iban_str,
        input_type="iban",
        valid=valid,
        bic=bic,
        errors=errors,
        country_code=country,
    )


def validate_bic(bic_str: str) -> Tuple[bool, Optional[str], Optional[str], list[str]]:
    """
    Validate a BIC. Returns (valid, normalized_bic, country_code, errors).
    Accepts 8- or 11-char forms; pads to 11 with 'XXX' for branch "primary office".

    Some real BICs use non-standard pseudo-country codes (e.g. EDBBEB22 uses
    'EB' for "European Bank") that schwifty's ISO registry doesn't recognize
    but SWIFT accepts. For these known codes, we do structural validation
    (length + alphanumeric) as a fallback.
    """
    # Non-standard country codes used by real BICs but not in ISO 3166.
    KNOWN_NONSTANDARD_COUNTRIES = {"EB"}

    errors: list[str] = []
    country: Optional[str] = None
    normalized: Optional[str] = None

    try:
        bic = BIC(bic_str)
        valid = bic.is_valid
        country = bic.country_code
        # Pad to 11 chars so directory lookups match consistently.
        normalized = str(bic).ljust(11, "X") if len(str(bic)) == 8 else str(bic)
    except Exception:
        # Fallback for known non-standard country codes only (e.g. EB).
        cleaned = bic_str.strip().upper().replace(" ", "")
        cc = cleaned[4:6] if len(cleaned) >= 6 else ""
        if (
            len(cleaned) in (8, 11)
            and cleaned[:4].isalpha()
            and cc in KNOWN_NONSTANDARD_COUNTRIES
        ):
            valid = True
            country = cc
            normalized = cleaned.ljust(11, "X") if len(cleaned) == 8 else cleaned
        else:
            valid = False
            if len(cleaned) not in (8, 11):
                errors.append(
                    f"Enter a valid SWIFT BIC — it must be 8 or 11 characters "
                    f"(you entered {len(cleaned)})."
                )
            else:
                errors.append(
                    "Enter a valid SWIFT BIC (for example CITIUS33 or "
                    "GTBINGLAXXX)."
                )

    return valid, normalized, country, errors
