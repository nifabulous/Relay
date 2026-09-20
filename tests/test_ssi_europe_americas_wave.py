import json
from pathlib import Path

from app.services.seed import SSI_RECORDS

ROOT = Path(__file__).resolve().parents[1]
LEDGER = ROOT / "app" / "services" / "seed_ssi_consolidation_9_europe_americas.json"
MANIFEST = ROOT / "scripts" / "ssi-autopilot" / "evidence" / "ssi-europe-americas-2026-09-20.json"


def test_europe_americas_wave_has_exact_non_routable_parity():
    payload = json.loads(LEDGER.read_text())
    manifest = json.loads(MANIFEST.read_text())
    rows = payload["ssi_records"]
    assert len(rows) == 192
    keys = {(row[0], row[2], row[3]) for row in rows}
    seeded = {(row[0], row[2], row[3]) for row in SSI_RECORDS}
    assert len(keys) == len(rows)
    assert keys <= seeded
    assert manifest["source_snapshot"]["route_count"] == len(rows)
    assert manifest["scope"]["included_route_count"] == len(rows)
    manifest_keys = {
        (beneficiary, route["currency"], route["int_bic"])
        for beneficiary, routes in manifest["routes_by_beneficiary"].items()
        for route in routes
    }
    assert manifest_keys == keys
    assert all(row[13] is True and row[14] is False for row in rows)
    assert all(row[index] is None for row in rows for index in (5, 6, 7, 8, 12))
    assert all(row[11] in {"unverified", "archived"} for row in rows)
