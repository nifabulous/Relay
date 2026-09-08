import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_wave17_redacted_source_extract_and_terms_are_consistent():
    manifest = json.loads((ROOT / "scripts/ssi-autopilot/regions.json").read_text())
    evidence = json.loads(
        (ROOT / "scripts/ssi-autopilot/evidence/ssi-wave17-btrlro22-2026-09-08.json").read_text()
    )
    bank = next(
        bank
        for region in manifest["regions"]
        for bank in region["banks"]
        if bank["bic8"] == "BTRLRO22"
    )
    route_fields = [
        {
            "currency": route["currency"],
            "int_bic": route["int_bic"],
            "correspondent": route["correspondent"],
            "nostro_mask": route["nostro"],
            "with_an_mask": route["with_an"],
            "terms_inferred": route["terms_inferred"],
        }
        for route in bank["admitted_records"]
    ]
    payload = json.dumps(route_fields, sort_keys=True, separators=(",", ":"))
    assert hashlib.sha256(payload.encode()).hexdigest() == evidence["source_route_digest"]
    assert route_fields == evidence["routes"]
    assert all(route["terms_inferred"] is True for route in route_fields)
    assert evidence["source_snapshot"]["raw_accounts_committed"] is False
    trusted = json.loads((ROOT / "scripts/ssi-autopilot/trusted_identities.json").read_text())
    assert trusted["BTRLRO22"]["settlement_terms_published"] is False
