"""Contract checks for Deutsche Bank Hong Kong's official Money Markets SSI PDF."""

import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
LEDGER = ROOT / "app/services/seed_ssi_deutsche_hong_kong_money_markets_20250203.json"
BIC = re.compile(r"^[A-Z]{6}[A-Z0-9]{5}$")
SOURCE = "https://corporates.db.com/files/documents/legal-resources/ssi/2025/DB-HK-MM-SSI-20250203-signed.pdf"


def test_hong_kong_money_markets_snapshot_is_canonical_and_bic_only():
    payload = json.loads(LEDGER.read_text())
    rows = payload["ssi_records"]
    assert payload["source_prs"] == payload["banks"] == []
    assert len(rows) == 19
    assert len({(row[0], row[2], row[3]) for row in rows}) == 19
    assert {row[2] for row in rows} == {
        "AUD", "CAD", "CHF", "CNY", "CZK", "DKK", "EUR", "HKD", "IDR", "INR",
        "JPY", "MYR", "NOK", "NZD", "SEK", "SGD", "THB", "TRY", "USD",
    }
    for row in rows:
        assert len(row) == 15
        assert BIC.fullmatch(row[0]) and BIC.fullmatch(row[3])
        assert re.fullmatch(r"[A-Z]{3}", row[2])
        assert row[5:9] == [None, None, None, None]
        assert row[9].startswith(f"Source: {SOURCE}")
        assert row[10:15] == ["2025-02-03", "unverified", None, True, False]
