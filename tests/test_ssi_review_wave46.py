import json
import re
from pathlib import Path

from app.services.seed import SSI_RECORDS

ROOT = Path(__file__).resolve().parents[1]


def _load():
    manifest = json.loads((ROOT / "scripts/ssi-autopilot/regions.json").read_text())
    evidence = json.loads(
        (ROOT / "scripts/ssi-autopilot/evidence/ssi-asacuz22-2026-09-14.json").read_text()
    )
    bank = next(
        bank
        for region in manifest["regions"]
        for bank in region["banks"]
        if bank["bic8"] == "ASACUZ22"
    )
    return bank, evidence


def test_asia_alliance_routes_match_independent_evidence_and_are_masked():
    bank, evidence = _load()
    actual = {
        (record["currency"], record["int_bic"]): (record["nostro"], record["with_an"])
        for record in bank["admitted_records"]
    }
    expected = {
        (route["currency"], route["int_bic"]): (
            route["nostro_mask"],
            route["with_an_mask"],
        )
        for route in evidence["routes"]
    }
    assert actual == expected
    assert evidence["scope"]["included_route_count"] == 28
    assert evidence["masking"]["raw_accounts_committed"] is False
    assert all(re.fullmatch(r"ACCT-910048\d{2}", value) for pair in actual.values() for value in pair)


def test_asia_alliance_seed_rows_are_unverified_and_non_routable():
    rows = [row for row in SSI_RECORDS if row[0] == "ASACUZ22XXX"]
    assert len(rows) == 28
    assert {row[2] for row in rows} == {
        "AMD", "CNY", "CHF", "EUR", "GBP", "JPY", "KZT", "RUB", "TRY", "USD"
    }
    assert all(row[5] == row[6] and row[5].startswith("ACCT-910048") for row in rows)
    assert all(row[10:13] == ("2026-08-13", "unverified", None) for row in rows)
    assert all(row[13] is False and row[14] is True for row in rows)
