"""
STP (Straight-Through Processing) checker for MT103 messages.

A pure function `check_stp(message: dict) -> STPResult` running a 12-rule STP
PRIMER (production engines apply 40–80+ rules). It decides whether an MT103
could flow through the chain without manual repair.

Note: MT103 was retired for cross-border payment instructions on 22 Nov 2025
when SWIFT's CBPR+ coexistence period ended; the message is now pacs.008 in
ISO 20022. See `iso20022.py` and the Learn "Message Standards" lab for the
mapping. This checker is retained to teach the field-level structure.

Verdict semantics:
  CLEAN     — no errors and no warnings (info-only still counts as clean)
  REPAIRABLE — no errors, but at least one warning (sendable, but fix advised)
  REJECTED  — at least one error (will be kicked out for manual repair)

`stp_passes` is True iff there are no error-severity findings; warnings and
info findings do not block straight-through processing.

The function takes a plain dict (shaped like STPCheckRequest) so it can be
exercised directly from tests/CLI without the HTTP layer. BIC validity reuses
`validate_bic` from validator.py.
"""

from __future__ import annotations

import logging

logger = logging.getLogger(__name__)


from dataclasses import dataclass, field
from datetime import date, datetime
from typing import List, Optional

from .validator import validate_bic

# Charge codes recognised by MT field 71A.
_VALID_CHARGE_CODES = ("OUR", "SHA", "BEN")

# MT field 23B (Bank Operation Code) production values.
_VALID_BANK_OP_CODES = ("CRED", "SPAY", "SPRI", "SSTD")

# MT field 20 (Sender's Reference) max length per SWIFT spec.
_TX_REF_MAX_LEN = 16

# Optional keys in the message dict that carry the field 33B instructed
# currency, used by the currency-consistency rule. Any of these, when present,
# is compared against the field 32A settlement currency.
_33B_CURRENCY_KEYS = ("instructed_currency", "currency_33b", "original_currency")


@dataclass
class Finding:
    """A single STP finding attached to a SWIFT field tag."""
    field: str          # SWIFT tag, e.g. "20", "32A", "50K", "59", "71A", "121"
    field_name: str     # human-readable field label
    severity: str       # error | warning | info
    code: str           # stable machine code, e.g. STP-UETR-MISSING
    message: str
    repair: Optional[str] = None


@dataclass
class FieldSummary:
    """Per-field rollup shown in the response."""
    field: str
    field_name: str
    present: bool
    valid: bool
    findings: int


@dataclass
class STPResult:
    """The complete STP check result."""
    verdict: str  # CLEAN | REPAIRABLE | REJECTED
    stp_passes: bool
    findings: List[Finding] = field(default_factory=list)
    field_summary: List[FieldSummary] = field(default_factory=list)


# Human-readable names for the SWIFT fields we inspect.
_FIELD_NAMES = {
    "20": "Sender's Reference",
    "23B": "Bank Operation Code",
    "32A": "Value Date / Currency / Settled Amount",
    "33B": "Currency / Original Ordered Amount",
    "50K": "Ordering Customer",
    "59": "Beneficiary Customer",
    "71A": "Details of Charges",
    "121": "UETR",
}


def _truthy(v) -> bool:
    """A field is present if it's a non-empty string / non-None / positive."""
    if v is None:
        return False
    if isinstance(v, str):
        return v.strip() != ""
    return True


def _get(d: Optional[dict], key: str):
    """Safely fetch a key from a dict that might be None."""
    if not isinstance(d, dict):
        return None
    return d.get(key)


def _parse_value_date(raw) -> Optional[date]:
    """
    Parse a value date accepting YYYYMMDD (native MT103 field 32A) or the
    ISO YYYY-MM-DD form used in normalised payloads. Returns None if invalid.
    """
    if not isinstance(raw, str):
        return None
    s = raw.strip()
    for fmt in ("%Y%m%d", "%Y-%m-%d"):
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    return None


def check_stp(message: dict) -> STPResult:
    """
    Run the 12-rule STP primer against an MT103-shaped message dict.

    The dict mirrors STPCheckRequest: transaction_reference, bank_op_code,
    value_date, currency, interbank_amount, charge_code, ordering {account,
    name, bic}, beneficiary {account, name, bic}, uetr, and optionally an
    instructed currency for field 33B.
    """
    message = message or {}
    findings: List[Finding] = []

    ordering = message.get("ordering") or {}
    beneficiary = message.get("beneficiary") or {}

    o_name = _get(ordering, "name")
    o_bic = _get(ordering, "bic")
    b_account = _get(beneficiary, "account")
    b_name = _get(beneficiary, "name")
    b_bic = _get(beneficiary, "bic")

    tx_ref = message.get("transaction_reference")
    value_date_raw = message.get("value_date")
    currency = message.get("currency")
    amount = message.get("interbank_amount")
    charge_code = message.get("charge_code")
    uetr = message.get("uetr")

    # ---- Rule 1: mandatory field presence (20, 32A, 50, 59, 71A) -----------
    if not _truthy(tx_ref):
        findings.append(Finding(
            field="20", field_name=_FIELD_NAMES["20"],
            severity="error", code="STP-MISSING-FIELD",
            message="Mandatory field 20 (Sender's Reference) is missing.",
            repair="Supply a transaction reference.",
        ))
    if not _truthy(value_date_raw) or not _truthy(currency) or amount is None:
        findings.append(Finding(
            field="32A", field_name=_FIELD_NAMES["32A"],
            severity="error", code="STP-MISSING-FIELD",
            message="Mandatory field 32A (value date / currency / amount) is incomplete.",
            repair="Supply value_date, currency and interbank_amount.",
        ))
    if not isinstance(ordering, dict) or not ordering:
        findings.append(Finding(
            field="50K", field_name=_FIELD_NAMES["50K"],
            severity="error", code="STP-MISSING-FIELD",
            message="Mandatory field 50 (Ordering Customer) is missing.",
            repair="Supply the ordering party details.",
        ))
    if not isinstance(beneficiary, dict) or not beneficiary:
        findings.append(Finding(
            field="59", field_name=_FIELD_NAMES["59"],
            severity="error", code="STP-MISSING-FIELD",
            message="Mandatory field 59 (Beneficiary Customer) is missing.",
            repair="Supply the beneficiary party details.",
        ))
    if not _truthy(charge_code):
        findings.append(Finding(
            field="71A", field_name=_FIELD_NAMES["71A"],
            severity="error", code="STP-MISSING-FIELD",
            message="Mandatory field 71A (Details of Charges) is missing.",
            repair="Supply a charge code (OUR, SHA or BEN).",
        ))

    # ---- Rule 2: value-date format (YYYYMMDD or ISO, valid calendar date) --
    parsed_date = _parse_value_date(value_date_raw)
    if _truthy(value_date_raw) and parsed_date is None:
        findings.append(Finding(
            field="32A", field_name=_FIELD_NAMES["32A"],
            severity="error", code="STP-VALUE-DATE-FORMAT",
            message=(
                f"Value date {value_date_raw!r} is not a valid date "
                "(expected YYYYMMDD or YYYY-MM-DD)."
            ),
            repair="Correct the value date to a valid calendar date.",
        ))

    # ---- Rule 3: currency consistency (32A vs 33B if present) --------------
    instructed_ccy = next(
        (message.get(k) for k in _33B_CURRENCY_KEYS if message.get(k) is not None),
        None,
    )
    if _truthy(instructed_ccy) and _truthy(currency):
        if instructed_ccy.strip().upper() != str(currency).strip().upper():
            findings.append(Finding(
                field="33B", field_name=_FIELD_NAMES["33B"],
                severity="error", code="STP-CURRENCY-MISMATCH",
                message=(
                    f"Field 33B currency {instructed_ccy!r} does not match "
                    f"field 32A currency {currency!r}."
                ),
                repair="Align the instructed and settlement currencies.",
            ))

    # ---- Rule 4: BIC format validity (ordering + beneficiary) -------------
    for bic, tag, label in (
        (o_bic, "50K", "Ordering"),
        (b_bic, "59", "Beneficiary"),
    ):
        if _truthy(bic):
            valid, _normalized, _country, errors = validate_bic(bic)
            if not valid:
                findings.append(Finding(
                    field=tag, field_name=_FIELD_NAMES[tag],
                    severity="error", code="STP-BIC-INVALID",
                    message=f"{label} BIC {bic!r} is not a valid BIC ({errors or 'format error'}).",
                    repair="Correct the BIC to an 8- or 11-character SWIFT code.",
                ))

    # ---- Rule 5: ordering customer name present ---------------------------
    if isinstance(ordering, dict) and ordering and not _truthy(o_name):
        findings.append(Finding(
            field="50K", field_name=_FIELD_NAMES["50K"],
            severity="error", code="STP-ORDERING-NAME-MISSING",
            message="Ordering customer name (field 50K) is missing.",
            repair="Supply the ordering customer's name.",
        ))

    # ---- Rule 6: beneficiary name + account present -----------------------
    if isinstance(beneficiary, dict) and beneficiary and (
        not _truthy(b_name) or not _truthy(b_account)
    ):
        missing = []
        if not _truthy(b_name):
            missing.append("name")
        if not _truthy(b_account):
            missing.append("account")
        findings.append(Finding(
            field="59", field_name=_FIELD_NAMES["59"],
            severity="error", code="STP-BENEFICIARY-MISSING",
            message=(
                "Beneficiary " + " and ".join(missing) +
                " (field 59) is missing."
            ),
            repair="Supply both the beneficiary name and account.",
        ))

    # ---- Rule 7: amount > 0 -----------------------------------------------
    if amount is not None and not (isinstance(amount, (int, float)) and amount > 0):
        findings.append(Finding(
            field="32A", field_name=_FIELD_NAMES["32A"],
            severity="error", code="STP-AMOUNT-INVALID",
            message=f"Interbank amount must be greater than zero (got {amount!r}).",
            repair="Supply a positive amount.",
        ))

    # ---- Rule 8: charge code valid (OUR/SHA/BEN) --------------------------
    # The API schema already normalises/validates this, but the pure function
    # must defend against raw dict input.
    if _truthy(charge_code) and charge_code.strip().upper() not in _VALID_CHARGE_CODES:
        findings.append(Finding(
            field="71A", field_name=_FIELD_NAMES["71A"],
            severity="error", code="STP-CHARGE-CODE-INVALID",
            message=(
                f"Charge code {charge_code!r} is not one of OUR, SHA, BEN."
            ),
            repair="Use OUR, SHA or BEN.",
        ))

    # ---- Rule 9: UETR presence (info if missing — auto-generated) ---------
    if not _truthy(uetr):
        findings.append(Finding(
            field="121", field_name=_FIELD_NAMES["121"],
            severity="info", code="STP-UETR-MISSING",
            message="No UETR (field 121) supplied.",
            repair="A UETR will be auto-generated at initiation.",
        ))

    # ---- Rule 10: transaction reference max 16 chars ----------------------
    if _truthy(tx_ref) and len(str(tx_ref)) > _TX_REF_MAX_LEN:
        findings.append(Finding(
            field="20", field_name=_FIELD_NAMES["20"],
            severity="warning", code="STP-REF-TOO-LONG",
            message=(
                f"Sender's reference is {len(str(tx_ref))} chars; "
                f"field 20 allows {_TX_REF_MAX_LEN}."
            ),
            repair="Shorten the reference to 16 characters or fewer.",
        ))

    # ---- Rule 11: value date not in the past ------------------------------
    if parsed_date is not None and parsed_date < date.today():
        findings.append(Finding(
            field="32A", field_name=_FIELD_NAMES["32A"],
            severity="warning", code="STP-VALUE-DATE-STALE",
            message=f"Value date {parsed_date.isoformat()} is in the past.",
            repair="Confirm the value date is intended.",
        ))

    # ---- Rule 12: duplicate BIC in chain ----------------------------------
    if _truthy(o_bic) and _truthy(b_bic):
        if o_bic.strip().upper() == b_bic.strip().upper():
            findings.append(Finding(
                field="50K/59", field_name="BIC Chain (Ordering \u2194 Beneficiary)",
                severity="warning", code="STP-DUPLICATE-BIC",
                message=(
                    f"Ordering and beneficiary share the same BIC {o_bic!r}; "
                    "possible circular routing."
                ),
                repair="Verify the ordering and beneficiary BICs are distinct.",
            ))

    # ---- Rule 13: bank operation code valid (23B) -------------------------
    bank_op_code = message.get("bank_op_code")
    if _truthy(bank_op_code) and str(bank_op_code).strip().upper() not in _VALID_BANK_OP_CODES:
        findings.append(Finding(
            field="23B", field_name=_FIELD_NAMES["23B"],
            severity="error", code="STP-BANK-OP-CODE-INVALID",
            message=(
                f"Bank operation code {bank_op_code!r} is not one of "
                f"{', '.join(_VALID_BANK_OP_CODES)}."
            ),
            repair="Use CRED (normal credit transfer) or another valid 23B code.",
        ))

    # ---- Rule 14: instructed (33B) vs settled (32A) amount divergence -----
    instructed_amount = message.get("instructed_amount")
    if (
        isinstance(instructed_amount, (int, float))
        and isinstance(amount, (int, float))
        and instructed_amount > 0
        and amount != instructed_amount
    ):
        findings.append(Finding(
            field="33B", field_name=_FIELD_NAMES["33B"],
            severity="warning", code="STP-AMOUNT-DIVERGENCE",
            message=(
                f"Settled amount (32A) {amount} differs from instructed amount "
                f"(33B) {instructed_amount}; the beneficiary receives a different "
                "sum than instructed — typically charges deducted along the chain."
            ),
            repair="Confirm the difference matches disclosed 71F/71G charges.",
        ))

    # ---- Build the per-field summary --------------------------------------
    known_tags = [
        "20", "23B", "32A", "33B", "50K", "59", "71A", "121",
    ]
    # Count findings per tag (compound tags like "50K/59" are not in the row
    # set and therefore don't inflate a single field's count).
    counts: dict[str, int] = {}
    for f in findings:
        counts[f.field] = counts.get(f.field, 0) + 1

    summary: List[FieldSummary] = []
    for tag in known_tags:
        if tag == "20":
            present, valid = _truthy(tx_ref), _truthy(tx_ref) and len(str(tx_ref)) <= _TX_REF_MAX_LEN
        elif tag == "23B":
            present = _truthy(message.get("bank_op_code"))
            valid = present and str(message.get("bank_op_code")).strip().upper() in _VALID_BANK_OP_CODES
        elif tag == "32A":
            present = _truthy(value_date_raw) and _truthy(currency) and amount is not None
            valid = present and parsed_date is not None and (
                isinstance(amount, (int, float)) and amount > 0
            )
        elif tag == "33B":
            present = instructed_ccy is not None
            valid = not present or (
                _truthy(currency) and
                str(instructed_ccy).strip().upper() == str(currency).strip().upper()
            )
        elif tag == "50K":
            present = isinstance(ordering, dict) and ordering and _truthy(o_name)
            valid = present and (not _truthy(o_bic) or validate_bic(o_bic)[0])
        elif tag == "59":
            present = isinstance(beneficiary, dict) and beneficiary and _truthy(b_name) and _truthy(b_account)
            valid = present and (not _truthy(b_bic) or validate_bic(b_bic)[0])
        elif tag == "71A":
            present = _truthy(charge_code)
            valid = present and charge_code.strip().upper() in _VALID_CHARGE_CODES
        elif tag == "121":
            present, valid = _truthy(uetr), _truthy(uetr)
        else:
            present, valid = False, False

        summary.append(FieldSummary(
            field=tag,
            field_name=_FIELD_NAMES[tag],
            present=bool(present),
            valid=bool(valid),
            findings=counts.get(tag, 0),
        ))

    # ---- Verdict -----------------------------------------------------------
    has_error = any(f.severity == "error" for f in findings)
    has_warning = any(f.severity == "warning" for f in findings)
    stp_passes = not has_error

    if has_error:
        verdict = "REJECTED"
    elif has_warning:
        verdict = "REPAIRABLE"
    else:
        verdict = "CLEAN"

    return STPResult(
        verdict=verdict,
        stp_passes=stp_passes,
        findings=findings,
        field_summary=summary,
    )
