"""Contract checks for Guangdong Nanyue Bank's official SSI page."""

import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
LEDGER = ROOT / "app/services/seed_ssi_guangdong_nanyue_20260921.json"
BIC = re.compile(r"^[A-Z]{6}[A-Z0-9]{5}$")
SOURCE = "https://www.gdnybank.com/IntDpContactUs/20140610/1565.html"


def test_guangdong_nanyue_snapshot_is_canonical_and_bic_only():
    payload = json.loads(LEDGER.read_text())
    rows = payload["ssi_records"]
    assert payload["source_prs"] == payload["banks"] == []
    assert len(rows) == 13
    assert len({(row[0], row[2], row[3]) for row in rows}) == 13
    assert {row[2] for row in rows} == {"CAD", "EUR", "GBP", "HKD", "JPY", "USD"}
    for row in rows:
        assert len(row) == 15
        assert BIC.fullmatch(row[0]) and BIC.fullmatch(row[3])
        assert re.fullmatch(r"[A-Z]{3}", row[2])
        assert row[5:9] == [None, None, None, None]
        assert row[9].startswith(f"Source: {SOURCE}")
        assert row[10:15] == ["2026-09-20", "unverified", None, True, False]
