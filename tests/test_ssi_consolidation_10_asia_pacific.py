"""Regression coverage for the official Asia-Pacific SSI wave 10 ledger."""

import json
from pathlib import Path

from app.services.seed import SSI_RECORDS, _is_canonical_bic11

ROOT = Path(__file__).resolve().parents[1]
LEDGER = ROOT / "app" / "services" / "seed_ssi_consolidation_10_asia_pacific.json"

EXPECTED_COUNTS = {
    "BOSPPGPMXXX": 16,
    "NATAAU3303M": 5,
    "FCBKJPJTXXX": 2,
    "COMMHKHHXXX": 16,
    "SUNYTWTPXXX": 20,
    "UOVBHKHHXXX": 14,
}
EXPECTED_SOURCES = {
    "https://www.bsp.com.pg/help/rates-and-fees/swift-codes/",
    "https://www.nab.com.au/personal/international-banking/receive-money-from-overseas",
    "https://www.firstbank.com.tw/sites/fcb/en_US/1565683511170",
    "https://www.bankcomm.com.hk/hk/uploadhk/infos/201901/16/2609759/20190116092844_List_of_our_Principal_Correspondent_Banks_en.pdf",
    "https://www.sunnybank.com.tw/public/pdf/1040708-%E9%99%BD%E4%BF%A1%E5%95%86%E6%A5%AD%E9%8A%80%E8%A1%8C%E5%8C%AF%E5%85%A5%E6%AC%BE%E5%85%A5%E5%B8%B3%E6%8C%87%E7%A4%BA%28%E6%89%80%E6%9C%89%E5%B9%A3%E5%88%A5%29.pdf",
    "https://www.uob.com.sg/web-resources/hk/pdf/hk/application-forms/payments-factsheet-inward-to-uob.pdf",
}


def _payload():
    return json.loads(LEDGER.read_text())


def test_asia_pacific_ledger_has_expected_shape_and_counts():
    payload = _payload()
    assert set(payload) == {"source_prs", "banks", "ssi_records"}
    assert payload["source_prs"] == []
    assert len(payload["banks"]) == len(EXPECTED_COUNTS) == 6
    assert len(payload["ssi_records"]) == 73
    assert {bank[0] for bank in payload["banks"]} == set(EXPECTED_COUNTS)
    assert {row[0] for row in payload["ssi_records"]} == set(EXPECTED_COUNTS)

    counts = {bic: 0 for bic in EXPECTED_COUNTS}
    for row in payload["ssi_records"]:
        assert len(row) == 15
        assert _is_canonical_bic11(row[0])
        assert _is_canonical_bic11(row[3])
        counts[row[0]] += 1
    assert counts == EXPECTED_COUNTS


def test_asia_pacific_ledger_routes_are_unique_and_new_on_origin_main():
    rows = _payload()["ssi_records"]
    keys = {(row[0], row[2], row[3]) for row in rows}
    current_keys = {(row[0], row[2], row[3]) for row in SSI_RECORDS}
    assert len(keys) == len(rows)
    assert keys <= current_keys


def test_asia_pacific_ledger_is_source_backed_bic_only_metadata():
    rows = _payload()["ssi_records"]
    urls = set()
    for row in rows:
        note = row[9]
        urls.update(url for url in EXPECTED_SOURCES if url in note)
        assert row[5:9] == [None, None, None, None]
        assert row[10:] == ["2026-09-20", "unverified", None, True, False]
        assert "BIC-only metadata" in note
        assert "settlement account" in note
    assert urls == EXPECTED_SOURCES
