import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_wave20_source_terms_and_masks_are_consistent():
    manifest = json.loads((ROOT / "scripts/ssi-autopilot/regions.json").read_text())
    evidence = json.loads(
        (ROOT / "scripts/ssi-autopilot/evidence/ssi-wave20-uovbthbk-2026-09-08.json").read_text()
    )
    bank = next(
        bank
        for region in manifest["regions"]
        for bank in region["banks"]
        if bank["bic8"] == "UOVBTHBK"
    )
    actual = {
        (route["currency"], route["int_bic"]): (route["nostro"], route["with_an"])
        for route in bank["admitted_records"]
    }
    expected = {
        (route["currency"], route["int_bic"]): (route["nostro_mask"], route["with_an_mask"])
        for route in evidence["routes"]
    }
    assert actual == expected
    assert len(actual) == 22
    assert all(
        re.fullmatch(r"ACCT-\d{8}", value)
        for pair in actual.values()
        for value in pair
    )
    assert len(set(actual.values())) == len(actual)
    assert evidence["source_snapshot"]["source_sha256"] == evidence["source_sha256"]
    assert evidence["source_snapshot"]["raw_accounts_committed"] is False
    trusted = json.loads((ROOT / "scripts/ssi-autopilot/trusted_identities.json").read_text())
    assert trusted["UOVBTHBK"]["settlement_terms_published"] is False
