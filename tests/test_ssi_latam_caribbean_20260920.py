"""Source-parity coverage for the Latin America and Caribbean SSI wave."""

import json
import re
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LEDGER = ROOT / "app" / "services" / "seed_ssi_consolidation_10_latam_caribbean.json"
MANIFEST = ROOT / "scripts" / "ssi-autopilot" / "evidence" / "ssi-latam-caribbean-wave-2026-09-20.json"

SOURCE_URLS = {
    "https://interbank.pe/bancos-corresponsales",
    "https://www.bancolombia.com/wcm/connect/www.bancolombia.com-26918/ed609370-c6a1-4ba0-9f1d-808b1dd841fc/Instrucciones%2Bde%2BGiro%2BBancolombia%2BSucursal%2BPanam%C3%A1%2B23032018.pdf",
}
BIC11 = re.compile(r"^[A-Z0-9]{11}$")


def _load():
    return json.loads(LEDGER.read_text()), json.loads(MANIFEST.read_text())


def test_latam_caribbean_wave_has_exact_auditable_shape():
    ledger, manifest = _load()
    rows = ledger["ssi_records"]

    assert set(ledger) == {"source_prs", "banks", "ssi_records"}
    assert ledger["source_prs"] == []
    assert len(ledger["banks"]) == 2
    assert len(rows) == 22
    assert manifest["source_snapshot"]["route_count"] == len(rows)
    assert manifest["scope"]["included_route_count"] == len(rows)
    assert sum(source["route_count"] for source in manifest["sources"]) == len(rows)


def test_latam_caribbean_wave_is_canonical_unique_and_bic_only():
    ledger, _ = _load()
    rows = ledger["ssi_records"]
    keys = {(row[0], row[2], row[3]) for row in rows}

    assert len(keys) == len(rows)
    for row in rows:
        assert len(row) == 15
        assert BIC11.fullmatch(row[0])
        assert BIC11.fullmatch(row[3])
        assert row[5:9] == [None, None, None, None]
        assert row[11:] == ["unverified", None, True, False]
        assert "BIC-only metadata" in row[9]
        assert "settlement instruction" in row[9]


def test_latam_caribbean_wave_matches_the_source_manifest():
    ledger, manifest = _load()
    rows = ledger["ssi_records"]
    by_beneficiary = Counter(row[0] for row in rows)

    assert by_beneficiary == {"IBNKPEPLXXX": 19, "COLOPAPSXXX": 3}
    assert {source["url"] for source in manifest["sources"]} == SOURCE_URLS
    assert {
        source["beneficiary_bic"]: source["route_count"]
        for source in manifest["sources"]
    } == by_beneficiary
