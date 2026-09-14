import json
from pathlib import Path

from app.services.seed import SSI_RECORDS

ROOT = Path(__file__).resolve().parents[1]


def _load():
    manifest = json.loads((ROOT / "scripts/ssi-autopilot/regions.json").read_text())
    evidence = json.loads(
        (ROOT / "scripts/ssi-autopilot/evidence/ssi-ncbaaltx-2018-07-01.json").read_text()
    )
    bank = next(
        bank
        for region in manifest["regions"]
        for bank in region["banks"]
        if bank["bic8"] == "NCBAALTX"
    )
    return bank, evidence


def test_bkt_albania_bic_only_routes_match_evidence():
    bank, evidence = _load()
    actual = {
        (record["currency"], record["int_bic"]): record["correspondent"]
        for record in bank["admitted_records"]
    }
    expected = {
        (route["currency"], route["int_bic"]): route["correspondent"]
        for route in evidence["routes"]
    }
    assert actual == expected
    assert evidence["masking"]["raw_accounts_committed"] is False
    assert all(record["bic_only"] for record in bank["admitted_records"])
    assert all(record["nostro"] is None and record["with_an"] is None for record in bank["admitted_records"])


def test_bkt_albania_seed_rows_are_explicitly_non_routable():
    rows = [row for row in SSI_RECORDS if row[0] == "NCBAALTXXXX"]
    assert len(rows) == 10
    assert {row[2] for row in rows} == {"AUD", "CAD", "CHF", "EUR", "GBP", "USD"}
    assert all(row[5:9] == (None, None, None, None) for row in rows)
    assert all(row[10:13] == ("2018-07-01", "unverified", None) for row in rows)
    assert all(row[13] is True and row[14] is False for row in rows)
