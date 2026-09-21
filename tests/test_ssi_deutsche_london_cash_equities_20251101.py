"""Contract checks for Deutsche Bank London's official Cash Equities SSI PDF."""

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LEDGER = ROOT / "app/services/seed_ssi_deutsche_london_cash_equities_20251101.json"
BIC = re.compile(r"^[A-Z]{6}[A-Z0-9]{5}$")
SOURCE = "https://corporates.db.com/files/documents/legal-resources/ssi/2025/Deutsche-Bank-AG-London-Cash-SSIs.pdf"


def test_london_cash_equities_snapshot_is_canonical_and_bic_only():
    payload = json.loads(LEDGER.read_text())
    rows = payload["ssi_records"]
    assert payload["source_prs"] == payload["banks"] == []
    assert len(rows) == 40
    assert len({(row[0], row[2], row[3]) for row in rows}) == 40
    assert {row[2] for row in rows} == {
        "AUD", "BDT", "BHD", "BRL", "CAD", "CHF", "CNH", "CZK", "DKK", "EGP", "HKD",
        "EUR", "GBP", "HUF", "IDR", "ILS", "ISK", "JPY", "KES", "KRW", "KWD",
        "MAD", "MXN", "MYR", "NGN", "NOK", "NZD", "PKR", "PHP", "PLN", "QAR",
        "RON", "RUB", "SEK", "SGD", "THB", "TRY", "TWD", "USD", "ZAR",
    }
    for row in rows:
        assert len(row) == 15
        assert BIC.fullmatch(row[0]) and BIC.fullmatch(row[3])
        assert re.fullmatch(r"[A-Z]{3}", row[2])
        assert row[5:9] == [None, None, None, None]
        assert row[9].startswith(f"Source: {SOURCE}")
        assert row[10:15] == ["2025-11-01", "unverified", None, True, False]
