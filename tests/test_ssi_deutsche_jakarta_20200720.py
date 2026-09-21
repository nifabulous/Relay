"""Contract checks for Deutsche Bank Jakarta's official SSI amendment PDF."""

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LEDGER = ROOT / "app/services/seed_ssi_deutsche_jakarta_20200720.json"
BIC = re.compile(r"^[A-Z]{6}[A-Z0-9]{5}$")
SOURCE = "https://corporates.db.com/files/documents/legal-resources/Change_of_USD_Standard_Settlement_Instruction_for_FX_Money_Market.pdf"


def test_jakarta_snapshot_is_canonical_and_bic_only():
    payload = json.loads(LEDGER.read_text())
    rows = payload["ssi_records"]
    assert payload["source_prs"] == payload["banks"] == []
    assert len(rows) == 1
    assert len({(row[0], row[2], row[3]) for row in rows}) == 1
    assert {row[2] for row in rows} == {"USD"}
    for row in rows:
        assert len(row) == 15
        assert BIC.fullmatch(row[0]) and BIC.fullmatch(row[3])
        assert row[5:9] == [None, None, None, None]
        assert row[9].startswith(f"Source: {SOURCE}")
        assert row[10:15] == ["2020-07-20", "unverified", None, True, False]
