"""Contract checks for Deutsche Bank Tokyo's official derivatives SSI PDF."""

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LEDGER = ROOT / "app/services/seed_ssi_deutsche_tokyo_derivatives_20200817.json"
BIC = re.compile(r"^[A-Z]{6}[A-Z0-9]{5}$")
SOURCE = "https://corporates.db.com/files/documents/legal-resources/DB_Tokyo_SSI_Sully.pdf"


def test_tokyo_derivatives_snapshot_is_canonical_and_bic_only():
    payload = json.loads(LEDGER.read_text())
    rows = payload["ssi_records"]
    assert payload["source_prs"] == payload["banks"] == []
    assert len(rows) == 21
    assert len({(row[0], row[2], row[3]) for row in rows}) == 21
    assert {row[2] for row in rows} == {
        "AUD", "CAD", "CHF", "CZK", "DKK", "EUR", "GBP", "HKD", "IDR", "JPY",
        "MXN", "NOK", "NZD", "PHP", "PLN", "SEK", "SGD", "SKK", "THB", "USD", "ZAR",
    }
    for row in rows:
        assert len(row) == 15
        assert BIC.fullmatch(row[0]) and BIC.fullmatch(row[3])
        assert re.fullmatch(r"[A-Z]{3}", row[2])
        assert row[5:9] == [None, None, None, None]
        assert row[9].startswith(f"Source: {SOURCE}")
        assert row[10:15] == ["2020-08-17", "unverified", None, True, False]
