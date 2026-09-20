"""Contract tests for the 2026-09-20 South Asia/global SSI ledger.

The central seed loader registers this object ledger separately.  These tests
keep the source snapshot reviewable before admission and make the safety
boundary explicit: every route is BIC-only metadata, never an executable SSI.
"""

import json
import re
from pathlib import Path

from schwifty import BIC

ROOT = Path(__file__).resolve().parents[1]
LEDGER = ROOT / "app" / "services" / "seed_ssi_consolidation_10_south_asia_global.json"
EVIDENCE = ROOT / "docs" / "ssi-south-asia-global-2026-09-20.json"


def test_south_asia_global_ledger_has_exact_source_parity_and_unique_routes():
    payload = json.loads(LEDGER.read_text(encoding="utf-8"))
    evidence = json.loads(EVIDENCE.read_text(encoding="utf-8"))
    rows = payload["ssi_records"]
    assert payload["source_prs"] == []
    assert payload["banks"] == []
    assert len(rows) == 93
    assert evidence["source_snapshot"]["route_count"] == len(rows)
    assert sum(source["route_count"] for source in evidence["sources"]) == len(rows)
    keys = {(row[0], row[2], row[3]) for row in rows}
    assert len(keys) == len(rows)
    evidence_keys = {tuple(key) for key in evidence["route_keys"]}
    assert evidence_keys == keys

    for source in evidence["sources"]:
        source_keys = {
            (row[0], row[2], row[3])
            for row in rows
            if row[0] == source["beneficiary_bic"]
            and row[9] == f"Source: {source['url']}"
        }
        assert len(source_keys) == source["route_count"]


def test_south_asia_global_routes_are_canonical_and_non_routable():
    payload = json.loads(LEDGER.read_text(encoding="utf-8"))
    rows = payload["ssi_records"]
    canonical = re.compile(r"^[A-Z]{6}[A-Z0-9]{5}$")
    for row in rows:
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
