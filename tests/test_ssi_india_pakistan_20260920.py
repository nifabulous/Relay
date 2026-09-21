"""Contract tests for the 2026-09-20 India/Pakistan SSI expansion ledger."""

import json
import re
from pathlib import Path

from schwifty import BIC

ROOT = Path(__file__).resolve().parents[1]
LEDGER = ROOT / "app" / "services" / "seed_ssi_consolidation_11_india_pakistan.json"
EVIDENCE = ROOT / "docs" / "ssi-india-pakistan-2026-09-20.json"


def test_india_pakistan_ledger_matches_source_attestation():
    payload = json.loads(LEDGER.read_text(encoding="utf-8"))
    evidence = json.loads(EVIDENCE.read_text(encoding="utf-8"))
    rows = payload["ssi_records"]
    assert payload["source_prs"] == []
    assert payload["banks"] == []
    assert len(rows) == 25
    assert evidence["source_snapshot"]["candidate_route_count"] == 66
    assert evidence["source_snapshot"]["route_count"] == len(rows)
    assert evidence["normalization"]["cross_batch_duplicate_route_count"] == 23
    assert sum(source["route_count"] for source in evidence["sources"]) == len(rows)
    pnb_source = next(source for source in evidence["sources"] if "pnb.bank.in" in source["url"])
    assert pnb_source["route_count"] == 1
    assert pnb_source["excluded_cross_batch_route_count"] == 23
    assert {tuple(key) for key in evidence["route_keys"]} == {(row[0], row[2], row[3]) for row in rows}
    for source in evidence["sources"]:
        source_keys = {
            (row[0], row[2], row[3])
            for row in rows
            if row[9] == f"Source: {source['url']}"
        }
        assert len(source_keys) == source["route_count"]
        assert source["candidate_route_count"] >= source["route_count"]


def test_india_pakistan_routes_are_canonical_bic_only_and_safe():
    payload = json.loads(LEDGER.read_text(encoding="utf-8"))
    evidence = json.loads(EVIDENCE.read_text(encoding="utf-8"))
    canonical = re.compile(r"^[A-Z]{6}[A-Z0-9]{5}$")
    assert evidence["normalization"]["bic_aliases"]["PNBPUS3NNYC"] == "PNBPUS33XXX"
    assert evidence["normalization"]["bic_aliases"]["NBADAEAAX"] == "NBADAEAAXXX"
    assert len(evidence["normalization"]["invalid_source_rows"]) == 1
    assert [row for row in payload["ssi_records"] if row[0] == "PUNBINBBISB"] == [
        row for row in payload["ssi_records"] if row[0] == "PUNBINBBISB" and row[3] == "PNBPUS33XXX"
    ]
    for row in payload["ssi_records"]:
        assert len(row) == 15
        assert canonical.fullmatch(row[0])
        assert canonical.fullmatch(row[3])
        assert BIC(row[0]).is_valid
        assert BIC(row[3]).is_valid
        assert len(row[2]) == 3 and row[2].isalpha() and row[2] == row[2].upper()
        assert row[9].startswith("Source: https://")
        assert row[10] == "2026-09-20"
        assert row[11] == "unverified"
        assert row[12] is None
        assert row[13] is True and row[14] is False
        assert all(row[index] is None for index in (5, 6, 7, 8))
        assert row[3] not in {"PNBPUS3NNYC", "ANZBA43MXXX"}
