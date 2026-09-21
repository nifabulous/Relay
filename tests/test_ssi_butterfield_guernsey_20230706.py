"""Contract checks for Butterfield Bank (Guernsey)'s official SSI PDF."""

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LEDGER = ROOT / "app/services/seed_ssi_butterfield_guernsey_20230706.json"
BIC = re.compile(r"^[A-Z]{6}[A-Z0-9]{5}$")
SOURCE = "https://www.butterfieldgroup.com/sites/butterfield-corp/files/butterfield/banking/intermediary-banking/bbgl-standard-settlement-instructions-v1.pdf"


def test_butterfield_guernsey_snapshot_is_canonical_and_bic_only():
    payload = json.loads(LEDGER.read_text())
    rows = payload["ssi_records"]
    assert payload["source_prs"] == payload["banks"] == []
    assert len(rows) == 15
    assert len({(row[0], row[2], row[3]) for row in rows}) == 15
    assert {row[2] for row in rows} == {"AUD", "CAD", "CHF", "DKK", "EUR", "GBP", "HKD", "JPY", "NOK", "NZD", "SEK", "SGD", "USD", "ZAR"}
    for row in rows:
        assert len(row) == 15
        assert BIC.fullmatch(row[0]) and BIC.fullmatch(row[3])
        assert re.fullmatch(r"[A-Z]{3}", row[2])
        assert row[5:9] == [None, None, None, None]
        assert row[9].startswith(f"Source: {SOURCE}")
        assert row[10:15] == ["2023-07-06", "unverified", None, True, False]
