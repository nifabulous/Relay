import json
from pathlib import Path

from app.services.seed import SSI_RECORDS

ROOT = Path(__file__).resolve().parents[1]
LEDGER_FILES = tuple(
    ROOT / "app" / "services" / filename
    for filename in (
        "seed_ssi_consolidation_9_europe_americas_swedbank.json",
        "seed_ssi_consolidation_9_europe_americas_procredit_md.json",
        "seed_ssi_consolidation_9_europe_americas_ttk.json",
        "seed_ssi_consolidation_9_europe_americas_techventures.json",
        "seed_ssi_consolidation_9_europe_americas_bnp_poland.json",
        "seed_ssi_consolidation_9_europe_americas_dsk.json",
    )
)
MANIFEST = ROOT / "scripts" / "ssi-autopilot" / "evidence" / "ssi-europe-americas-2026-09-20.json"


def test_europe_americas_wave_has_exact_non_routable_parity():
    payloads = [json.loads(path.read_text()) for path in LEDGER_FILES]
    manifest = json.loads(MANIFEST.read_text())
    rows = [row for payload in payloads for row in payload["ssi_records"]]
    assert len(rows) == 95
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
    for source in manifest["sources"]:
        assert source["route_count"] == len(
            manifest["routes_by_beneficiary"][source["beneficiary_bic"]]
        )
    assert all(row[13] is True and row[14] is False for row in rows)
    assert all(row[index] is None for row in rows for index in (5, 6, 7, 8, 12))
    assert all(row[11] == "unverified" for row in rows)
