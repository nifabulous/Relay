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


def test_translate_includes_instd_amt_and_omits_pmt_typ_inf_for_cred():
    """
    Regression test: InstdAmt must be emitted when instructed_ccy is present.

    This test previously also pinned CRED -> PmtTpInf/LclInstrm/Prtry. That
    mapping was wrong twice over — CRED has no pacs.008 target, and a
    cross-border service level is not a local clearing instrument — so the
    PmtTpInf half now asserts absence. See the 23B tests below.
    """
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

    # CRED carries no pacs.008 element (see the 23B tests below); InstdAmt does.
    paths = {e.iso_path: e.value for e in result.mapping}
    assert paths.get("PmtTpInf") is None
    assert paths.get("InstdAmt/@Ccy") == "EUR"

    # Parse and navigate the XML tree to verify elements are present
    ns = {"p": PACS008_NAMESPACE}
    assert root.find(".//p:PmtTpInf", ns) is None, "CRED must not produce PmtTpInf"

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


def test_invalid_agent_bic_is_rejected():
    doc = dict(_VALID_DOC)
    doc["creditor_agent_bic"] = "NOTABIC"  # malformed, not just missing
    r = validate_pacs008(doc)
    assert r.verdict == "REJECTED"
    assert r.passes is False
    assert any(f.code == "PACS-BIC-INVALID" for f in r.findings)


def test_missing_settlement_currency_is_rejected():
    doc = dict(_VALID_DOC)
    doc["settlement_currency"] = ""
    r = validate_pacs008(doc)
    assert r.verdict == "REJECTED"
    assert any(f.code == "PACS-CCY-MISSING" for f in r.findings)


def test_translate_endpoint(client):
    resp = client.post("/api/message/translate", json={
        "transaction_reference": "REF123456",
        "value_date": "2026-07-20",
        "currency": "USD",
        "interbank_amount": 100000.0,
        "charge_code": "OUR",
        "ordering": {"name": "Acme Corp", "bic": "CHASUS33"},
        "beneficiary": {"name": "Beta Ltd", "bic": "BARCGB22"},
    })
    assert resp.status_code == 200
    data = resp.json()
    assert any(m["iso_path"] == "Cdtr/Nm" and m["value"] == "Beta Ltd" for m in data["mapping"])
    assert "FIToFICstmrCdtTrf" in data["xml"]
    assert data["disclaimer"]


def test_pacs008_check_endpoint_flags_country_only_address(client):
    resp = client.post("/api/message/pacs008-check", json={
        "debtor_name": "Acme Corp",
        "debtor_agent_bic": "CHASUS33",
        "creditor_name": "Beta Ltd",
        "creditor_agent_bic": "BARCGB22",
        "creditor_postal_address": {"street_name": "", "town_name": "", "country": "USA"},
        "settlement_amount": 100000.0,
        "settlement_currency": "USD",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["verdict"] == "REPAIRABLE"
    assert data["passes"] is True
    assert any(f["code"] == "PACS-ADDR-UNSTRUCTURED" for f in data["findings"])
    assert data["disclaimer"]


def test_grphdr_carries_the_mandatory_pacs008_elements():
    """
    pacs.008 GrpHdr requires MsgId, CreDtTm, NbOfTxs and SttlmInf. The
    primer emitted only MsgId and NbOfTxs, so a learner comparing it to a
    real pacs.008 saw a GrpHdr that no production validator would accept.
    """
    result = translate_mt103_to_pacs008(_SAMPLE_MT103)
    root = ET.fromstring(result.xml)
    ns = {"p": PACS008_NAMESPACE}

    grp = root.find(".//p:GrpHdr", ns)
    assert grp is not None

    children = [child.tag.split("}")[-1] for child in grp]
    assert children == ["MsgId", "CreDtTm", "NbOfTxs", "SttlmInf"], children

    # CreDtTm must be an ISO-8601 instant, not a date.
    cre_dt_tm = grp.find("p:CreDtTm", ns)
    assert cre_dt_tm is not None and cre_dt_tm.text
    from datetime import datetime

    datetime.fromisoformat(cre_dt_tm.text)  # raises if malformed
    assert "T" in cre_dt_tm.text

    # SttlmInf/SttlmMtd is itself mandatory and code-constrained.
    sttlm_mtd = grp.find("p:SttlmInf/p:SttlmMtd", ns)
    assert sttlm_mtd is not None
    assert sttlm_mtd.text in {"INDA", "INGA", "COVE", "CLRG"}


def test_grphdr_element_order_matches_the_schema_sequence():
    """
    GrpHdr is an xs:sequence, so order is part of validity. An emitter that
    produces the right elements in the wrong order still fails a real XSD,
    and this primer exists to show the real shape.
    """
    result = translate_mt103_to_pacs008(_SAMPLE_MT103)
    root = ET.fromstring(result.xml)
    grp = root.find(".//p:GrpHdr", {"p": PACS008_NAMESPACE})
    children = [child.tag.split("}")[-1] for child in grp]

    assert children.index("MsgId") < children.index("CreDtTm")
    assert children.index("CreDtTm") < children.index("NbOfTxs")
    assert children.index("NbOfTxs") < children.index("SttlmInf")


# ── MT 23B (Bank Operation Code) -> pacs.008 ──────────────────────────────
#
# 23B takes CRED, SPAY, SPRI or SSTD. Only three of those carry information
# a pacs.008 can hold: CRED says "this is a normal credit transfer", which
# FIToFICstmrCdtTrf already says by existing.


def _message_with_op_code(op_code: str) -> dict:
    return {**_SAMPLE_MT103, "bank_op_code": op_code}


def test_cred_is_shown_as_carrying_no_pacs008_element():
    """
    Emitting CRED into the message invents a field a real sender would not
    populate. The crosswalk still lists 23B, because "this one has no
    target, and here is why" is the lesson.
    """
    result = translate_mt103_to_pacs008(_message_with_op_code("CRED"))

    row = next(e for e in result.mapping if e.mt_tag == "23B")
    assert row.value == "CRED"
    assert "no" in row.iso_label.lower() and "pacs.008" in row.iso_label.lower()
    assert row.iso_path in {"", "—"}

    root = ET.fromstring(result.xml)
    assert root.find(f".//{{{PACS008_NAMESPACE}}}PmtTpInf") is None


def test_service_level_codes_map_to_svclvl_prtry():
    """SPRI/SSTD/SPAY are service levels, not local instruments."""
    for code in ("SPRI", "SSTD", "SPAY"):
        result = translate_mt103_to_pacs008(_message_with_op_code(code))

        row = next(e for e in result.mapping if e.mt_tag == "23B")
        assert row.iso_path == "PmtTpInf/SvcLvl/Prtry", code
        assert row.value == code

        root = ET.fromstring(result.xml)
        prtry = root.find(
            f".//{{{PACS008_NAMESPACE}}}PmtTpInf"
            f"/{{{PACS008_NAMESPACE}}}SvcLvl"
            f"/{{{PACS008_NAMESPACE}}}Prtry"
        )
        assert prtry is not None and prtry.text == code, code


def test_lclinstrm_is_never_emitted_for_23b():
    """
    LclInstrm is a local clearing instrument. A cross-border service level
    is not one, and the previous crosswalk put it there.
    """
    for code in ("CRED", "SPRI", "SSTD", "SPAY"):
        result = translate_mt103_to_pacs008(_message_with_op_code(code))
        root = ET.fromstring(result.xml)
        assert root.find(f".//{{{PACS008_NAMESPACE}}}LclInstrm") is None, code


def test_unrecognised_op_code_is_not_promoted_to_a_service_level():
    """An unknown code is reported, not silently given a valid-looking home."""
    result = translate_mt103_to_pacs008(_message_with_op_code("ZZZZ"))

    row = next(e for e in result.mapping if e.mt_tag == "23B")
    assert row.iso_path != "PmtTpInf/SvcLvl/Prtry"

    root = ET.fromstring(result.xml)
    assert root.find(f".//{{{PACS008_NAMESPACE}}}PmtTpInf") is None
