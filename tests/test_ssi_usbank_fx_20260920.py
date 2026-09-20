"""Contract tests for the official U.S. Bank FX SSI expansion ledger."""

import json
import re
from pathlib import Path

from schwifty import BIC

ROOT = Path(__file__).resolve().parents[1]
LEDGER = ROOT / "app" / "services" / "seed_ssi_consolidation_13_usbank_fx.json"
EVIDENCE = ROOT / "docs" / "ssi-usbank-fx-2026-09-20.json"
SOURCE = "https://it03.usbank.com/dam/documents/pdf/commercial-banking/SSI-List-Detailed-Instructions.pdf"


def test_usbank_source_parity_and_unique_keys():
    payload = json.loads(LEDGER.read_text(encoding="utf-8"))
    evidence = json.loads(EVIDENCE.read_text(encoding="utf-8"))
    rows = payload["ssi_records"]
    assert payload["source_prs"] == []
    assert payload["banks"] == []
    assert len(rows) == 29
    assert evidence["source_snapshot"]["candidate_route_count"] == 31
    assert evidence["source_snapshot"]["route_count"] == len(rows)
    assert evidence["source_snapshot"]["excluded_existing_route_count"] == 2
    keys = {(row[0], row[2], row[3]) for row in rows}
    assert len(keys) == len(rows)
    assert {tuple(key) for key in evidence["route_keys"]} == keys
    source = evidence["sources"][0]
    assert source["url"] == SOURCE
    assert source["candidate_route_count"] == 31
    assert source["route_count"] == len(rows)
    assert source["excluded_existing_route_count"] == 2
    assert sum(item["route_count"] for item in evidence["sources"]) == len(rows)
    for row in rows:
        assert row[9].startswith(f"Source: {SOURCE}")


def test_usbank_routes_are_canonical_bic_only_and_non_routable():
    payload = json.loads(LEDGER.read_text(encoding="utf-8"))
    evidence = json.loads(EVIDENCE.read_text(encoding="utf-8"))
    canonical = re.compile(r"^[A-Z]{6}[A-Z0-9]{5}$")
    assert evidence["normalization"]["currency_aliases"] == {}
    assert evidence["normalization"]["invalid_source_rows"] == []
    assert evidence["normalization"]["beneficiary_bic"] == "USBKUS44XXX"
    for row in payload["ssi_records"]:
        assert len(row) == 15
        assert row[0] == "USBKUS44XXX"
        assert canonical.fullmatch(row[0])
        assert canonical.fullmatch(row[3])
        assert BIC(row[0]).is_valid and BIC(row[3]).is_valid
        assert len(row[2]) == 3 and row[2].isalpha() and row[2] == row[2].upper()
        assert row[9].startswith("Source: https://")
        assert row[10] == "2026-09-20"
        assert row[11] == "unverified"
        assert row[12] is None
        assert row[13] is True and row[14] is False
        assert all(row[index] is None for index in (5, 6, 7, 8))
