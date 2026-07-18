"""Tests for the MT103 -> ISO 20022 pacs.008 translator and validator."""
from __future__ import annotations

import xml.etree.ElementTree as ET

from app.services.iso20022 import (
    CHARGE_MAP,
    PACS008_NAMESPACE,
    translate_mt103_to_pacs008,
    validate_pacs008,
)

_SAMPLE_MT103 = {
    "transaction_reference": "REF123456",
    "bank_op_code": "CRED",
    "value_date": "2026-07-20",
    "currency": "USD",
    "interbank_amount": 100000.0,
    "charge_code": "OUR",
    "ordering": {"name": "Acme Corp", "bic": "CHASUS33", "account": "ACCT-0001"},
    "beneficiary": {"name": "Beta Ltd", "bic": "BARCGB22", "account": "ACCT-0002"},
    "uetr": "97ed4827-7b6f-4491-a06f-b548d5a7512d",
    "remittance": "Invoice 42",
}


def test_translate_maps_core_fields():
    result = translate_mt103_to_pacs008(_SAMPLE_MT103)
    paths = {e.iso_path: e.value for e in result.mapping}
    # Beneficiary (59) -> Cdtr; ordering (50K) -> Dbtr
    assert paths["Cdtr/Nm"] == "Beta Ltd"
    assert paths["Dbtr/Nm"] == "Acme Corp"
    # 32A amount -> IntrBkSttlmAmt
    assert paths["IntrBkSttlmAmt"] == "100000.0"
    # 71A OUR -> ChrgBr DEBT
    assert paths["ChrgBr"] == "DEBT"
    # UETR carried unchanged
    assert paths["PmtId/UETR"] == "97ed4827-7b6f-4491-a06f-b548d5a7512d"
    # Remittance -> RmtInf/Ustrd
    assert paths["RmtInf/Ustrd"] == "Invoice 42"


def test_charge_map_translation():
    assert CHARGE_MAP == {"OUR": "DEBT", "BEN": "CRED", "SHA": "SHAR"}


def test_translate_emits_wellformed_namespaced_xml():
    result = translate_mt103_to_pacs008(_SAMPLE_MT103)
    root = ET.fromstring(result.xml)  # raises if not well-formed
    assert root.tag == f"{{{PACS008_NAMESPACE}}}Document"
    # Creditor name present somewhere in the tree
    assert "Beta Ltd" in result.xml
    # Values are escaped (no raw stray ampersand breaking the doc)
    assert "&" not in result.xml.replace("&amp;", "").replace("&lt;", "").replace("&gt;", "")


def test_translate_includes_pmt_typ_inf_and_instd_amt_when_present():
    """Regression test: PmtTpInf and InstdAmt must be emitted when op_code and instructed_ccy are present."""
    message = {
        "transaction_reference": "TEST789",
        "bank_op_code": "CRED",
        "instructed_currency": "EUR",
        "value_date": "2026-07-20",
        "currency": "USD",
        "interbank_amount": 100000.0,
        "charge_code": "OUR",
        "ordering": {"name": "Acme Corp", "bic": "CHASUS33", "account": "ACCT-0001"},
        "beneficiary": {"name": "Beta Ltd", "bic": "BARCGB22", "account": "ACCT-0002"},
    }
    result = translate_mt103_to_pacs008(message)

    # Verify XML is well-formed
    root = ET.fromstring(result.xml)
    assert root.tag == f"{{{PACS008_NAMESPACE}}}Document"

    # Check mapping rows include the expected entries
    paths = {e.iso_path: e.value for e in result.mapping}
    assert paths.get("PmtTpInf") == "CRED"
    assert paths.get("InstdAmt/@Ccy") == "EUR"

    # Parse and navigate the XML tree to verify elements are present
    ns = {"p": PACS008_NAMESPACE}
    pmt_typ_inf = root.find(".//p:PmtTpInf", ns)
    assert pmt_typ_inf is not None, "PmtTpInf element not found"
    prtry = pmt_typ_inf.find(".//p:Prtry", ns)
    assert prtry is not None and prtry.text == "CRED", "Prtry element should contain CRED"

    instd_amt = root.find(".//p:InstdAmt", ns)
    assert instd_amt is not None, "InstdAmt element not found"
    assert instd_amt.get("Ccy") == "EUR", "InstdAmt should have Ccy='EUR'"
    assert instd_amt.text == "100000.0", "InstdAmt should contain settlement amount"


_VALID_DOC = {
    "debtor_name": "Acme Corp",
    "debtor_agent_bic": "CHASUS33",
    "creditor_name": "Beta Ltd",
    "creditor_agent_bic": "BARCGB22",
    "creditor_postal_address": {
        "street_name": "1 High St", "town_name": "London", "country": "GB",
    },
    "settlement_amount": 100000.0,
    "settlement_currency": "USD",
}


def test_validate_clean_document_passes():
    r = validate_pacs008(_VALID_DOC)
    assert r.verdict == "CLEAN"
    assert r.passes is True
    assert r.findings == []


def test_country_only_address_is_repairable():
    doc = dict(_VALID_DOC)
    doc["creditor_postal_address"] = {"street_name": "", "town_name": "", "country": "USA"}
    r = validate_pacs008(doc)
    assert r.verdict == "REPAIRABLE"
    assert r.passes is True  # warning only, still sendable
    codes = {f.code for f in r.findings}
    assert "PACS-ADDR-UNSTRUCTURED" in codes
    addr = next(f for f in r.findings if f.code == "PACS-ADDR-UNSTRUCTURED")
    assert addr.repair  # explains the request-for-information


def test_missing_agent_bic_is_rejected():
    doc = dict(_VALID_DOC)
    doc["creditor_agent_bic"] = ""
    r = validate_pacs008(doc)
    assert r.verdict == "REJECTED"
    assert r.passes is False
    assert any(f.code == "PACS-BIC-MISSING" for f in r.findings)


def test_zero_amount_is_rejected():
    doc = dict(_VALID_DOC)
    doc["settlement_amount"] = 0
    r = validate_pacs008(doc)
    assert r.verdict == "REJECTED"
    assert any(f.code == "PACS-AMOUNT-INVALID" for f in r.findings)


def test_instructed_settled_currency_mismatch_is_warning():
    doc = dict(_VALID_DOC)
    doc["instructed_currency"] = "EUR"
    r = validate_pacs008(doc)
    assert r.verdict == "REPAIRABLE"
    assert any(f.code == "PACS-CCY-MISMATCH" for f in r.findings)


def test_missing_creditor_name_is_rejected():
    doc = dict(_VALID_DOC)
    doc["creditor_name"] = ""
    r = validate_pacs008(doc)
    assert r.verdict == "REJECTED"
    assert any(f.code == "PACS-NAME-MISSING" for f in r.findings)
