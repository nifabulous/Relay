"""Admission and source-parity checks for BBVA Mexico correspondent metadata."""

import json
from pathlib import Path

from app.services.seed import SSI_RECORDS


ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "scripts" / "ssi-autopilot" / "regions.json"
EVIDENCE = ROOT / "scripts" / "ssi-autopilot" / "evidence" / "ssi-bbva-mexico-2026-09-20.json"
SOURCE = (
    "https://www.bbva.mx/empresas/productos/comercio-internacional/"
    "servicios-al-comercio-exterior/transferencias-internacionales.html"
)
EXPECTED_ROUTES = {
    ("CAD", "ROYCCAT2XXX"),
    ("CHF", "UBSWCHZH80A"),
    ("EUR", "BBVAESMMXXX"),
    ("GBP", "NWBKGB2LXXX"),
    ("JPY", "BOTKJPJTXXX"),
    ("SEK", "ESSESESSXXX"),
    ("USD", "CHASUS33XXX"),
}


def _admitted_bank():
    manifest = json.loads(MANIFEST.read_text())
    region = next(
        region for region in manifest["regions"] if region["name"] == "mexico-central-america"
    )
    return next(bank for bank in region["banks"] if bank["bic8"] == "BCMRMXMM")


def test_bbva_mexico_manifest_matches_the_evidence_scope():
    bank = _admitted_bank()
    evidence = json.loads(EVIDENCE.read_text())

    assert bank["seedable"] is True
    assert bank["source_domains"] == ["bbva.mx"]
    assert evidence["source_snapshot"]["route_count"] == len(EXPECTED_ROUTES)
    assert evidence["scope"]["included_route_count"] == len(EXPECTED_ROUTES)
    assert evidence["sources"] == [
        {
            "beneficiary_bic": "BCMRMXMMXXX",
            "beneficiary_name": "BBVA Mexico",
            "country": "MX",
            "url": SOURCE,
            "as_of": "2026-09-20",
            "status": "unverified",
            "route_count": len(EXPECTED_ROUTES),
        }
    ]


def test_bbva_mexico_routes_are_canonical_bic_only_and_seeded():
    bank = _admitted_bank()
    admitted = {
        (
            row["currency"],
            row["int_bic"] if len(row["int_bic"]) == 11 else row["int_bic"] + "XXX",
        )
        for row in bank["admitted_records"]
    }
    seeded = {
        (row[2], row[3])
        for row in SSI_RECORDS
        if row[0] == "BCMRMXMMXXX" and row[9].startswith(f"Source: {SOURCE}")
    }

    assert admitted == EXPECTED_ROUTES
    assert seeded == EXPECTED_ROUTES
    assert all(row["bic_only"] is True for row in bank["admitted_records"])
    assert all(row["source"] == SOURCE for row in bank["admitted_records"])
