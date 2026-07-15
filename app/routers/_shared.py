"""Shared constants used by multiple domain router modules.

Kept here so that each router imports only the constants it needs without
duplicating definitions across files.
"""
from ..data.sanctions_watchlist import DISCLAIMER as SCREENING_DISCLAIMER_TEXT

_SSI_DISCLAIMER = (
    "Account numbers in seed data are ILLUSTRATIVE placeholders. "
    "Replace with values from the beneficiary bank's published SSI list "
    "or a licensed feed (Accuity, SWIFTRef) before use."
)

_VOP_ADVICE = {
    "MATCH": "Name matches the account holder. Safe to proceed.",
    "CLOSE_MATCH": (
        "Name is similar but not exact. The account holder name is provided "
        "for review. Confirm with the payer before proceeding."
    ),
    "NO_MATCH": (
        "Name does not match the account holder. Do NOT proceed — "
        "verify the beneficiary details with the payer."
    ),
    "NOT_CHECKED": (
        "Could not verify — account not found or the beneficiary bank does "
        "not participate in VoP. Proceed with caution."
    ),
}

_TRACKING_DISCLAIMER = (
    "SIMULATED timeline. Real SWIFT gpi tracking requires SWIFT membership "
    "and a connection to the gpi tracker gateway. This simulation generates "
    "realistic status events for development and demonstration."
)

_VALUE_DATE_DISCLAIMER = (
    "Educational calculator. Real settlement uses the operator's holiday feed "
    "and cut-off schedule; times shown are local to the currency's settlement system."
)

_STP_DISCLAIMER = (
    "Educational STP check against a static rule set. A real correspondent "
    "bank applies its own repair policy, reference data, and sanctions/AML "
    "screening on top of these structural checks."
)

__all__ = [
    "SCREENING_DISCLAIMER_TEXT",
    "_SSI_DISCLAIMER",
    "_VOP_ADVICE",
    "_TRACKING_DISCLAIMER",
    "_VALUE_DATE_DISCLAIMER",
    "_STP_DISCLAIMER",
]
