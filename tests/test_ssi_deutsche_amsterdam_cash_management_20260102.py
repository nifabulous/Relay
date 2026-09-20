"""Contract checks for Deutsche Bank Amsterdam's official SSI PDF."""

import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
LEDGER = ROOT / "app/services/seed_ssi_deutsche_amsterdam_cash_management_20260102.json"
BIC = re.compile(r"^[A-Z]{6}[A-Z0-9]{5}$")
SOURCE = "https://corporates.db.com/files/documents/legal-resources/ssi/2026/SSI-DEUTNL2A-incl-link-FFT-Jan-2026.pdf"


def test_amsterdam_cash_management_snapshot_is_canonical_and_bic_only():
    payload = json.loads(LEDGER.read_text())
    rows = payload["ssi_records"]
    assert payload["source_prs"] == payload["banks"] == []
    assert len(rows) == 29
    assert len({(row[0], row[2], row[3]) for row in rows}) == 29
    assert {row[2] for row in rows} == {
        "AED", "AUD", "CAD", "CHF", "CNY", "CZK", "DKK", "EUR", "GBP", "HKD",
        "HUF", "ILS", "JPY", "KWD", "MAD", "MXN", "NOK", "NZD", "PLN", "QAR",
        "RON", "RUB", "SAR", "SEK", "SGD", "THB", "TRY", "USD", "ZAR",
    }
    for row in rows:
        assert len(row) == 15
        assert BIC.fullmatch(row[0]) and BIC.fullmatch(row[3])
        assert re.fullmatch(r"[A-Z]{3}", row[2])
        assert row[5:9] == [None, None, None, None]
        assert row[9].startswith(f"Source: {SOURCE}")
        assert row[10:15] == ["2026-01-02", "unverified", None, True, False]
