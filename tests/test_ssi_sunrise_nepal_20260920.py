"""Contract tests for the official Sunrise Bank Nepal SSI ledger."""

import json
import re
from pathlib import Path

from schwifty import BIC

ROOT = Path(__file__).resolve().parents[1]
LEDGER = ROOT / "app" / "services" / "seed_ssi_consolidation_15_sunrise_nepal.json"
EVIDENCE = ROOT / "docs" / "ssi-sunrise-nepal-2026-09-20.json"
SOURCE = "https://www.sunrisebank.com.np/wp-content/uploads/2023/08/sb-2077-78-english.pdf"


def test_sunrise_source_parity_and_unique_keys():
    payload = json.loads(LEDGER.read_text(encoding="utf-8"))
    evidence = json.loads(EVIDENCE.read_text(encoding="utf-8"))
    rows = payload["ssi_records"]
    assert payload["source_prs"] == []
    assert payload["banks"] == []
    assert len(rows) == 19
    assert evidence["source_snapshot"]["candidate_route_count"] == 19
    assert evidence["source_snapshot"]["route_count"] == len(rows)
    assert evidence["source_snapshot"]["excluded_existing_route_count"] == 0
    keys = {(row[0], row[2], row[3]) for row in rows}
    assert len(keys) == len(rows)
    assert {tuple(key) for key in evidence["route_keys"]} == keys
    source = evidence["sources"][0]
    assert source["url"] == SOURCE
    assert source["candidate_route_count"] == 19
    assert source["route_count"] == len(rows)
    assert source["excluded_existing_route_count"] == 0
    assert sum(item["route_count"] for item in evidence["sources"]) == len(rows)
    for row in rows:
        assert row[9].startswith(f"Source: {SOURCE}")


def test_sunrise_routes_are_canonical_bic_only_and_non_routable():
    payload = json.loads(LEDGER.read_text(encoding="utf-8"))
    evidence = json.loads(EVIDENCE.read_text(encoding="utf-8"))
    canonical = re.compile(r"^[A-Z]{6}[A-Z0-9]{5}$")
    assert evidence["normalization"]["currency_aliases"] == {}
    assert evidence["normalization"]["invalid_source_rows"] == []
    assert evidence["normalization"]["beneficiary_bic"] == "SRBLNPKAXXX"
    for row in payload["ssi_records"]:
        assert len(row) == 15
        assert row[0] == "SRBLNPKAXXX"
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
