import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_wave15_wells_fargo_alias_is_explicit_and_non_routable():
    manifest = json.loads((ROOT / "scripts/ssi-autopilot/regions.json").read_text())
    evidence = json.loads(
        (ROOT / "scripts/ssi-autopilot/evidence/ssi-wave15-kasithbk-2026-09-08.json").read_text()
    )
    bank = next(
        bank
        for region in manifest["regions"]
        for bank in region["banks"]
        if bank["bic8"] == "KASITHBK"
    )
    usd = [record for record in bank["admitted_records"] if record["currency"] == "USD"]
    wells = next(record for record in usd if "Wells Fargo" in record["correspondent"])
    assert wells["int_bic"] == "PNBPUS33"
    assert wells["bic_only"] is True
    assert wells["nostro"] is None and wells["with_an"] is None
    assert "PNBPUS3NNYC" not in {record["int_bic"] for record in usd}
    assert evidence["source_snapshot"]["bic_aliases"] == {"PNBPUS3NNYC": "PNBPUS33"}
    assert evidence["source_snapshot"]["raw_accounts_committed"] is False
    assert evidence["routes"] == [
        {
            "currency": "USD",
            "int_bic": "PNBPUS33",
            "source_bic": "PNBPUS3NNYC",
            "correspondent": "Wells Fargo Bank N.A. (printed PNBPUS3NNYC, normalized)",
            "bic_only": True,
            "terms_inferred": False,
        }
    ]
