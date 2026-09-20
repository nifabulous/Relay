"""Contract checks for Deutsche Bank Taipei's official SSI PDF."""

import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
LEDGER = ROOT / "app/services/seed_ssi_deutsche_taipei_20200720.json"
BIC = re.compile(r"^[A-Z]{6}[A-Z0-9]{5}$")
SOURCE = "https://corporates.db.com/files/documents/legal-resources/db-taiwan.pdf"


def test_taipei_snapshot_is_canonical_and_bic_only():
    payload = json.loads(LEDGER.read_text())
    rows = payload["ssi_records"]
    assert payload["source_prs"] == payload["banks"] == []
    assert len(rows) == 17
    assert len({(row[0], row[2], row[3]) for row in rows}) == 17
    assert {row[2] for row in rows} == {"AUD", "CAD", "CHF", "CNH", "CNY", "DKK", "EUR", "GBP", "HKD", "JPY", "NZD", "SEK", "SGD", "THB", "TWD", "USD"}
    for row in rows:
        assert len(row) == 15
        assert BIC.fullmatch(row[0]) and BIC.fullmatch(row[3])
        assert re.fullmatch(r"[A-Z]{3}", row[2])
        assert row[5:9] == [None, None, None, None]
        assert row[9].startswith(f"Source: {SOURCE}")
        assert row[10:15] == ["2020-07-20", "unverified", None, True, False]
