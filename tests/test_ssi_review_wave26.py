import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def _load():
    manifest = json.loads((ROOT / "scripts/ssi-autopilot/regions.json").read_text())
    evidence = json.loads((ROOT / "scripts/ssi-autopilot/evidence/ssi-wave26-dnbagb2l-2026-02-02.json").read_text())
    bank = next(bank for region in manifest["regions"] for bank in region["banks"] if bank["bic8"] == "DNBAGB2L")
    return bank, evidence


def test_wave26_mask_preserves_route_account_identity():
    bank, evidence = _load()
    actual = {(record["currency"], record["int_bic"]): (record["nostro"], record["with_an"]) for record in bank["admitted_records"]}
    expected = {(route["currency"], route["int_bic"]): (route["nostro_mask"], route["with_an_mask"]) for route in evidence["routes"]}
    assert actual == expected
    assert len(set(actual.values())) > 1
    assert all(re.fullmatch(r"ACCT-\d{8}", value) for pair in actual.values() for value in pair)
    fingerprints = {(route["currency"], route["int_bic"]): (route["nostro_fingerprint"], route["with_an_fingerprint"]) for route in evidence["routes"]}
    assert len(set(actual.values())) == len(set(fingerprints.values()))
    for left_key, left_fp in fingerprints.items():
        for right_key, right_fp in fingerprints.items():
            assert (actual[left_key] == actual[right_key]) == (left_fp == right_fp)
    from app.services.seed import SSI_RECORDS
    seeded = {}
    for row in SSI_RECORDS:
        if row[0] == "DNBAGB2LXXX":
            seeded[(row[2], row[3])] = (row[5], row[6])
            seeded[(row[2], row[3][:8])] = (row[5], row[6])
    assert {key: seeded[key] for key in actual} == actual
    assert evidence["masking"]["raw_accounts_committed"] is False
    trusted = json.loads((ROOT / "scripts/ssi-autopilot/trusted_identities.json").read_text())
    assert trusted["DNBAUS33"]["settlement_terms_published"] is False
    assert trusted["DNBAGB2L"]["settlement_terms_published"] is False
