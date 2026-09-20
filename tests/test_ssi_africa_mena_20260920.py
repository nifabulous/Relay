"""Regression coverage for the 2026-09-20 Africa/MENA SSI ledger."""

import json
from pathlib import Path

from app.services.seed import SSI_RECORDS

ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / "scripts/ssi-autopilot/evidence/ssi-africa-mena-2026-09-20.json"


def test_africa_mena_manifest_matches_bic_only_seed_rows():
    evidence = json.loads(EVIDENCE.read_text(encoding="utf-8"))
    expected = {
        (route["beneficiary_bic"], route["currency"], route["int_bic"])
        for route in evidence["routes"]
    }
    actual_rows = [
        row for row in SSI_RECORDS
        if row[10] == evidence["as_of"]
        and row[0] in {route["beneficiary_bic"] for route in evidence["routes"]}
    ]
    actual = {(row[0], row[2], row[3]) for row in actual_rows}

    assert len(expected) == evidence["source_snapshot"]["route_count"] == 36
    assert actual == expected
    assert len(actual_rows) == len(expected)
    assert all(
        row[5:9] == (None, None, None, None)
        and row[11] == "unverified"
        and row[13] is True
        for row in actual_rows
    )


def test_africa_mena_routes_are_unique_in_seed():
    rows = [row for row in SSI_RECORDS if row[10] == "2026-09-20"]
    keys = [(row[0], row[2], row[3]) for row in rows]
    assert len(rows) == 36
    assert len(keys) == len(set(keys))
