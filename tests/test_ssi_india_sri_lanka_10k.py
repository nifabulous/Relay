"""Focused invariants for the India/Sri Lanka 10k SSI ledger batch."""

import json
from pathlib import Path

from schwifty import BIC

LEDGER = (
    Path(__file__).resolve().parents[1]
    / "app"
    / "services"
    / "seed_ssi_consolidation_10_india_sri_lanka.json"
)


def _rows():
    payload = json.loads(LEDGER.read_text())
    assert payload["source_prs"] == []
    assert payload["banks"] == []
    return payload["ssi_records"]


def test_india_sri_lanka_batch_has_expected_unique_routes():
    rows = _rows()
    assert len(rows) == 94
    keys = [(row[0], row[2], row[3]) for row in rows]
    assert len(keys) == len(set(keys))
    assert {row[0] for row in rows} == {
        "PUNBINBBISB",
        "SOININ55XXX",
        "KARBINBBXXX",
        "CIUBINBBXXX",
        "KALUINBBXXX",
        "COMBLKLXXXX",
    }


def test_india_sri_lanka_rows_are_canonical_bic_only_metadata():
    rows = _rows()
    for row in rows:
        assert len(row) == 15
        beneficiary, _, currency, intermediary = row[:4]
        assert len(beneficiary) == 11 and BIC(beneficiary).is_valid
        assert len(intermediary) == 11 and BIC(intermediary).is_valid
        assert intermediary not in {"SCBLDEFXXXX", "PNBPUS3NNYC"}
        assert currency.isupper() and len(currency) == 3
        assert all(value is None for value in row[5:9])
        assert row[9].startswith("Source: https://")
        assert row[10] in {"2023-12-01", "2024-10-04", "2025-04-05", "2026-09-20"}
        assert row[11] == "unverified"
        assert row[12] is None
        assert row[13] is True
        assert row[14] is False
        assert "not a selectable settlement instruction" in row[9]


def test_india_sri_lanka_sources_are_bank_owned():
    rows = _rows()
    sources = {row[9].split(" (as of ", 1)[0] for row in rows}
    assert sources == {
        "Source: https://pnb.bank.in/Remittance-Money-to-India.html",
        "Source: https://www.southindianbank.bank.in/UserFiles/NriNewsLetter/nri_news_letter_december_2023.pdf",
        "Source: https://d3sdkw7nvdnqts.cloudfront.net/s3fs-public/2024-10/nostro-account-latest-%283%29.pdf",
        "Source: https://www.cityunionbank.com/cub-correspondent-banks-for-currency-exchange",
        "Source: https://kalupur.bank.in/services/foreign-exchange/",
        "Source: https://www.combank.lk/info/12.",
    }
