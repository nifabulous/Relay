"""Tests for the MT103 -> ISO 20022 pacs.008 translator and validator."""
from __future__ import annotations

import xml.etree.ElementTree as ET

from app.services.iso20022 import (
    CHARGE_MAP,
    PACS008_NAMESPACE,
    translate_mt103_to_pacs008,
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
