"""
MT103 -> ISO 20022 (pacs.008) translator and structured-field validator.

EDUCATIONAL PRIMER. The generated XML is illustrative: it shows the real
pacs.008 element hierarchy and namespace but is NOT validated against the
official ISO 20022 XSD, and omits many mandatory production elements
(GrpHdr detail, SttlmInf, ChrgsInf breakdowns). Production ISO 20022
validation engines run far more rules than the four here.

Context: SWIFT's CBPR+ cross-border coexistence period ended 22 November
2025. MT103 / MT202(COV) were retired for cross-border payment instructions
and replaced by pacs.008 / pacs.009 on FINplus. This module teaches the
mapping between the two, not a production converter.
"""
from __future__ import annotations

import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from typing import List, Optional

from .validator import validate_bic

PACS008_NAMESPACE = "urn:iso:std:iso:20022:tech:xsd:pacs.008.001.08"

# MT field 71A charge code -> ISO 20022 ChargeBearerType1Code.
CHARGE_MAP = {"OUR": "DEBT", "BEN": "CRED", "SHA": "SHAR"}

# Keys that may carry the MT field 33B instructed currency.
_33B_CURRENCY_KEYS = ("instructed_currency", "currency_33b", "original_currency")


@dataclass
class Pacs008MappingEntry:
    """One MT103-field -> pacs.008-element mapping row."""
    mt_tag: str
    mt_label: str
    iso_path: str
    iso_label: str
    value: str


@dataclass
class Pacs008TranslateResult:
    mapping: List[Pacs008MappingEntry] = field(default_factory=list)
    xml: str = ""


def _s(v) -> str:
    """Coerce a value to a trimmed string; None -> ''."""
    if v is None:
        return ""
    return str(v).strip()


def _instructed_ccy(message: dict) -> str:
    for k in _33B_CURRENCY_KEYS:
        if message.get(k) is not None:
            return _s(message.get(k))
    return ""


def translate_mt103_to_pacs008(message: dict) -> Pacs008TranslateResult:
    """Map an MT103-shaped dict to pacs.008 mapping rows + illustrative XML."""
    message = message or {}
    ordering = message.get("ordering") or {}
    beneficiary = message.get("beneficiary") or {}

    tx_ref = _s(message.get("transaction_reference"))
    uetr = _s(message.get("uetr"))
    op_code = _s(message.get("bank_op_code"))
    value_date = _s(message.get("value_date"))
    currency = _s(message.get("currency"))
    amount = message.get("interbank_amount")
    amount_str = "" if amount is None else str(amount)
    charge_code = _s(message.get("charge_code")).upper()
    charge_iso = CHARGE_MAP.get(charge_code, "")
    instructed_ccy = _instructed_ccy(message)
    remittance = _s(message.get("remittance"))

    o_name = _s(ordering.get("name") if isinstance(ordering, dict) else None)
    o_bic = _s(ordering.get("bic") if isinstance(ordering, dict) else None)
    o_acct = _s(ordering.get("account") if isinstance(ordering, dict) else None)
    b_name = _s(beneficiary.get("name") if isinstance(beneficiary, dict) else None)
    b_bic = _s(beneficiary.get("bic") if isinstance(beneficiary, dict) else None)
    b_acct = _s(beneficiary.get("account") if isinstance(beneficiary, dict) else None)

    # Ordered mapping rows. (mt_tag, mt_label, iso_path, iso_label, value)
    rows = [
        ("20", "Sender's Reference", "PmtId/InstrId", "Instruction Identification", tx_ref),
        ("20", "Sender's Reference", "PmtId/EndToEndId", "End-to-End Identification", tx_ref),
        ("121", "UETR", "PmtId/UETR", "UETR", uetr),
        ("23B", "Bank Operation Code", "PmtTpInf", "Payment Type Information", op_code),
        ("32A", "Value Date", "IntrBkSttlmDt", "Interbank Settlement Date", value_date),
        ("32A", "Settled Amount", "IntrBkSttlmAmt", "Interbank Settlement Amount", amount_str),
        ("32A", "Settlement Currency", "IntrBkSttlmAmt/@Ccy", "Settlement Currency", currency),
        ("33B", "Instructed Currency", "InstdAmt/@Ccy", "Instructed Currency", instructed_ccy),
        ("71A", "Details of Charges", "ChrgBr", "Charge Bearer", charge_iso),
        ("50K", "Ordering Customer", "Dbtr/Nm", "Debtor Name", o_name),
        ("52A", "Ordering Institution", "DbtrAgt/FinInstnId/BICFI", "Debtor Agent BIC", o_bic),
        ("50K", "Ordering Account", "DbtrAcct/Id", "Debtor Account", o_acct),
        ("59", "Beneficiary Customer", "Cdtr/Nm", "Creditor Name", b_name),
        ("57A", "Account With Institution", "CdtrAgt/FinInstnId/BICFI", "Creditor Agent BIC", b_bic),
        ("59", "Beneficiary Account", "CdtrAcct/Id", "Creditor Account", b_acct),
        ("70", "Remittance Information", "RmtInf/Ustrd", "Unstructured Remittance", remittance),
    ]
    mapping = [
        Pacs008MappingEntry(mt_tag=t, mt_label=lbl, iso_path=path, iso_label=iso_lbl, value=val)
        for (t, lbl, path, iso_lbl, val) in rows
    ]

    xml = _build_xml(
        tx_ref=tx_ref, uetr=uetr, op_code=op_code, value_date=value_date, currency=currency,
        amount_str=amount_str, instructed_ccy=instructed_ccy, charge_iso=charge_iso,
        o_name=o_name, o_bic=o_bic, o_acct=o_acct,
        b_name=b_name, b_bic=b_bic, b_acct=b_acct, remittance=remittance,
    )
    return Pacs008TranslateResult(mapping=mapping, xml=xml)


def _sub(parent: ET.Element, tag: str, text: str = "") -> ET.Element:
    el = ET.SubElement(parent, tag)
    if text:
        el.text = text
    return el


def _build_xml(**f) -> str:
    ns = PACS008_NAMESPACE
    ET.register_namespace("", ns)
    doc = ET.Element(f"{{{ns}}}Document")
    cdt = _sub(doc, f"{{{ns}}}FIToFICstmrCdtTrf")

    grp = _sub(cdt, f"{{{ns}}}GrpHdr")
    _sub(grp, f"{{{ns}}}MsgId", f["tx_ref"])
    _sub(grp, f"{{{ns}}}NbOfTxs", "1")

    tx = _sub(cdt, f"{{{ns}}}CdtTrfTxInf")
    pmtid = _sub(tx, f"{{{ns}}}PmtId")
    _sub(pmtid, f"{{{ns}}}InstrId", f["tx_ref"])
    _sub(pmtid, f"{{{ns}}}EndToEndId", f["tx_ref"])
    if f["uetr"]:
        _sub(pmtid, f"{{{ns}}}UETR", f["uetr"])

    if f["op_code"]:
        pmttypinf = _sub(tx, f"{{{ns}}}PmtTpInf")
        lclinstrm = _sub(pmttypinf, f"{{{ns}}}LclInstrm")
        _sub(lclinstrm, f"{{{ns}}}Prtry", f["op_code"])

    if f["instructed_ccy"]:
        instd = _sub(tx, f"{{{ns}}}InstdAmt", f["amount_str"])
        instd.set("Ccy", f["instructed_ccy"])

    amt = _sub(tx, f"{{{ns}}}IntrBkSttlmAmt", f["amount_str"])
    if f["currency"]:
        amt.set("Ccy", f["currency"])
    if f["value_date"]:
        _sub(tx, f"{{{ns}}}IntrBkSttlmDt", f["value_date"])
    if f["charge_iso"]:
        _sub(tx, f"{{{ns}}}ChrgBr", f["charge_iso"])

    dbtr = _sub(tx, f"{{{ns}}}Dbtr")
    _sub(dbtr, f"{{{ns}}}Nm", f["o_name"])
    if f["o_acct"]:
        dacct = _sub(tx, f"{{{ns}}}DbtrAcct")
        _sub(_sub(dacct, f"{{{ns}}}Id"), f"{{{ns}}}Othr", f["o_acct"])
    if f["o_bic"]:
        dagt = _sub(tx, f"{{{ns}}}DbtrAgt")
        _sub(_sub(dagt, f"{{{ns}}}FinInstnId"), f"{{{ns}}}BICFI", f["o_bic"])

    cdtr = _sub(tx, f"{{{ns}}}Cdtr")
    _sub(cdtr, f"{{{ns}}}Nm", f["b_name"])
    if f["b_acct"]:
        cacct = _sub(tx, f"{{{ns}}}CdtrAcct")
        _sub(_sub(cacct, f"{{{ns}}}Id"), f"{{{ns}}}Othr", f["b_acct"])
    if f["b_bic"]:
        cagt = _sub(tx, f"{{{ns}}}CdtrAgt")
        _sub(_sub(cagt, f"{{{ns}}}FinInstnId"), f"{{{ns}}}BICFI", f["b_bic"])

    if f["remittance"]:
        _sub(_sub(tx, f"{{{ns}}}RmtInf"), f"{{{ns}}}Ustrd", f["remittance"])

    return ET.tostring(doc, encoding="unicode")


@dataclass
class Pacs008Finding:
    field: str
    field_name: str
    severity: str  # error | warning | info
    code: str
    message: str
    repair: Optional[str] = None


@dataclass
class Pacs008ValidateResult:
    verdict: str  # CLEAN | REPAIRABLE | REJECTED
    passes: bool
    findings: List[Pacs008Finding] = field(default_factory=list)


def validate_pacs008(document: dict) -> Pacs008ValidateResult:
    """
    PRIMER validator for a handful of structured pacs.008 fields.

    Rules (production engines run far more):
      1. Structured PstlAdr completeness — a country-only creditor address is
         REPAIRABLE (the Nov-2026 SWIFT structured-address mandate; also the
         Travel-Rule data-completeness intent).
      2. Debtor/creditor agent BICFI present and valid.
      3. Settlement amount > 0 and currency present; instructed vs settled
         currency mismatch is a warning.
      4. Debtor and creditor names present.
    """
    document = document or {}
    findings: List[Pacs008Finding] = []

    addr = document.get("creditor_postal_address") or {}
    street = _s(addr.get("street_name") if isinstance(addr, dict) else None)
    town = _s(addr.get("town_name") if isinstance(addr, dict) else None)
    country = _s(addr.get("country") if isinstance(addr, dict) else None)

    # Rule 1: structured address completeness.
    if country and not (street and town):
        findings.append(Pacs008Finding(
            field="Cdtr/PstlAdr", field_name="Creditor Postal Address",
            severity="warning", code="PACS-ADDR-UNSTRUCTURED",
            message=(
                "Creditor address has a country but no street/town. From "
                "November 2026 SWIFT accepts only structured or hybrid postal "
                "addresses; a country-only address fails the data-completeness "
                "intent even though the field is non-empty."
            ),
            repair=(
                "Supply structured StrtNm and TwnNm. A country-only address "
                "triggers a request-for-information back to the sending bank."
            ),
        ))

    # Rule 2: agent BICFI present + valid.
    for bic, tag, label in (
        (_s(document.get("debtor_agent_bic")), "DbtrAgt/FinInstnId/BICFI", "Debtor Agent"),
        (_s(document.get("creditor_agent_bic")), "CdtrAgt/FinInstnId/BICFI", "Creditor Agent"),
    ):
        if not bic:
            findings.append(Pacs008Finding(
                field=tag, field_name=f"{label} BIC",
                severity="error", code="PACS-BIC-MISSING",
                message=f"{label} BICFI is missing.",
                repair="Supply the agent's BIC (BICFI).",
            ))
        else:
            valid, _n, _c, errs = validate_bic(bic)
            if not valid:
                findings.append(Pacs008Finding(
                    field=tag, field_name=f"{label} BIC",
                    severity="error", code="PACS-BIC-INVALID",
                    message=f"{label} BICFI {bic!r} is invalid ({errs or 'format error'}).",
                    repair="Correct the BIC to an 8- or 11-character SWIFT code.",
                ))

    # Rule 3: settlement amount + currency.
    amount = document.get("settlement_amount")
    currency = _s(document.get("settlement_currency"))
    if not (isinstance(amount, (int, float)) and amount > 0):
        findings.append(Pacs008Finding(
            field="IntrBkSttlmAmt", field_name="Interbank Settlement Amount",
            severity="error", code="PACS-AMOUNT-INVALID",
            message=f"Settlement amount must be greater than zero (got {amount!r}).",
            repair="Supply a positive settlement amount.",
        ))
    if not currency:
        findings.append(Pacs008Finding(
            field="IntrBkSttlmAmt/@Ccy", field_name="Settlement Currency",
            severity="error", code="PACS-CCY-MISSING",
            message="Settlement currency is missing.",
            repair="Supply the settlement currency (ISO 4217).",
        ))
    instructed = _s(document.get("instructed_currency"))
    if instructed and currency and instructed.upper() != currency.upper():
        findings.append(Pacs008Finding(
            field="InstdAmt/@Ccy", field_name="Instructed Currency",
            severity="warning", code="PACS-CCY-MISMATCH",
            message=(
                f"Instructed currency {instructed!r} differs from settled "
                f"currency {currency!r}; an FX conversion is implied."
            ),
            repair="Confirm the FX leg is intended and disclosed.",
        ))

    # Rule 4: party names.
    for name_val, tag, label in (
        (_s(document.get("debtor_name")), "Dbtr/Nm", "Debtor"),
        (_s(document.get("creditor_name")), "Cdtr/Nm", "Creditor"),
    ):
        if not name_val:
            findings.append(Pacs008Finding(
                field=tag, field_name=f"{label} Name",
                severity="error", code="PACS-NAME-MISSING",
                message=f"{label} name is missing.",
                repair=f"Supply the {label.lower()} name.",
            ))

    has_error = any(f.severity == "error" for f in findings)
    has_warning = any(f.severity == "warning" for f in findings)
    if has_error:
        verdict = "REJECTED"
    elif has_warning:
        verdict = "REPAIRABLE"
    else:
        verdict = "CLEAN"
    return Pacs008ValidateResult(verdict=verdict, passes=not has_error, findings=findings)
