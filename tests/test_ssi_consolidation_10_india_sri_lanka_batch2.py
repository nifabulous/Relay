"""Focused invariants for India/Sri Lanka SSI wave 10 batch 2."""

import json
from pathlib import Path

from schwifty import BIC

LEDGER = (
    Path(__file__).resolve().parents[1]
    / "app"
    / "services"
    / "seed_ssi_consolidation_10_india_sri_lanka_batch2.json"
)


def _rows():
    payload = json.loads(LEDGER.read_text())
    assert payload["source_prs"] == []
    assert payload["banks"] == []
    return payload["ssi_records"]


def test_batch2_has_expected_unique_route_keys():
    rows = _rows()
    assert len(rows) == 37
    keys = [(row[0], row[2], row[3]) for row in rows]
    assert len(keys) == len(set(keys))
    assert {row[0] for row in rows} == {"HNBKLKLXXXX", "SBININBBXXX"}


def test_batch2_rows_are_canonical_bic_only_metadata():
    for row in _rows():
        assert len(row) == 15
        assert len(row[0]) == 11 and BIC(row[0]).is_valid
        assert len(row[3]) == 11 and BIC(row[3]).is_valid
        assert row[3] not in {"SCBLDEFXXXX", "PNBPUS3NNYC"}
        assert row[2].isupper() and len(row[2]) == 3
        assert all(value is None for value in row[5:9])
        assert row[9].startswith("Source: https://")
        assert row[10] == "2026-09-20"
        assert row[11] == "unverified"
        assert row[12] is None
        assert row[13] is True
        assert row[14] is False
        assert "not a selectable settlement instruction" in row[9]


def test_batch2_uses_only_the_two_cited_bank_sources():
    sources = {row[9].split(" (as of ", 1)[0] for row in _rows()}
    assert sources == {
        "Source: https://www.hnb.lk/standard-settlement-instruction",
        "Source: https://sbi.bank.in/web/nri/remittances/correspondent-bank-accounts",
    }
