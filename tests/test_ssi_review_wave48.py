import json
import re
from pathlib import Path

from app.services.seed import SSI_RECORDS

ROOT = Path(__file__).resolve().parents[1]


def _load():
    manifest = json.loads((ROOT / "scripts/ssi-autopilot/regions.json").read_text())
    evidence = json.loads(
        (ROOT / "scripts/ssi-autopilot/evidence/ssi-rzooat2l-2026-04-01.json").read_text()
    )
    bank = next(
        bank
        for region in manifest["regions"]
        for bank in region["banks"]
        if bank["bic8"] == "RZOOAT2L"
    )
    return bank, evidence


def test_rzoo_current_routes_match_independent_evidence():
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
    assert evidence["scope"]["included_route_count"] == 14
    assert evidence["masking"]["raw_accounts_committed"] is False
    assert all(re.fullmatch(r"ACCT-910034\d{2}", value) for pair in actual.values() for value in pair)


def test_rzoo_current_rows_are_distinct_from_archived_seed_keys():
    rows = [row for row in SSI_RECORDS if row[0] == "RZOOAT2LXXX"]
    current = {(row[2], row[3]) for row in rows if row[10] == "2026-04-01"}
    assert len(current) == 14
    assert len(rows) == 42
    assert all(row[5] == row[6] and row[5].startswith("ACCT-910034") for row in rows if row[10] == "2026-04-01")
    assert all(row[13] is False and row[14] is True for row in rows if row[10] == "2026-04-01")
