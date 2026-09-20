"""Contract checks for Deutsche Bank Seoul's official local-nostro SSI PDF."""

import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
LEDGER = ROOT / "app/services/seed_ssi_deutsche_seoul_local_20251014.json"
BIC = re.compile(r"^[A-Z]{6}[A-Z0-9]{5}$")
SOURCE = "https://corporates.db.com/files/documents/legal-resources/ssi/2025/DB-SL-SSI-Local-Nostro-14OCT2025.pdf"


def test_seoul_local_snapshot_is_canonical_and_bic_only():
    payload = json.loads(LEDGER.read_text())
    rows = payload["ssi_records"]
    assert payload["source_prs"] == payload["banks"] == []
    assert len(rows) == 20
    assert len({(row[0], row[2], row[3]) for row in rows}) == 20
    assert {row[2] for row in rows} == {
        "AED", "AUD", "CAD", "CHF", "CNH", "DKK", "EUR", "GBP", "HKD", "JPY",
        "KWD", "MXN", "NOK", "NZD", "PLN", "SEK", "SGD", "THB", "TRY", "USD",
    }
    for row in rows:
        assert len(row) == 15
        assert BIC.fullmatch(row[0]) and BIC.fullmatch(row[3])
        assert re.fullmatch(r"[A-Z]{3}", row[2])
        assert row[5:9] == [None, None, None, None]
        assert row[9].startswith(f"Source: {SOURCE}")
        assert row[10:15] == ["2025-10-14", "unverified", None, True, False]
