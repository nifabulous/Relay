import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_wave19_terms_and_source_snapshot_are_consistent():
    manifest = json.loads((ROOT / "scripts/ssi-autopilot/regions.json").read_text())
    evidence = json.loads(
        (ROOT / "scripts/ssi-autopilot/evidence/ssi-wave19-eacbvnvx-2026-06-30.json").read_text()
    )
    bank = next(
        bank
        for region in manifest["regions"]
        for bank in region["banks"]
        if bank["bic8"] == "EACBVNVX"
    )
    manifest_routes = {
        (route["currency"], route["int_bic"]): route
        for route in bank["admitted_records"]
    }
    evidence_routes = {
        (route["currency"], route["int_bic"]): route
        for route in evidence["routes"]
    }
    assert manifest_routes.keys() == evidence_routes.keys()
    for key, route in manifest_routes.items():
        assert route["terms_inferred"] is True
        assert route["nostro"] == evidence_routes[key]["nostro_mask"]
        assert route["with_an"] == evidence_routes[key]["with_an_mask"]
    assert evidence["source_snapshot"]["source_sha256"] == evidence["source_sha256"]
    assert evidence["source_snapshot"]["raw_accounts_committed"] is False
    trusted = json.loads((ROOT / "scripts/ssi-autopilot/trusted_identities.json").read_text())
    assert trusted["EACBVNVX"]["settlement_terms_published"] is False
