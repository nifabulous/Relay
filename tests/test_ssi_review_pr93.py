"""Exact-head consistency checks for the four DNB routes added by PR #93.

The evidence JSON, admission manifest, and runtime seed are maintained as
separate artifacts.  Keep their route keys and masked account values tied
together so a partial review cannot hide a drift in one of the three copies.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

import pytest

from app.services.seed import SSI_RECORDS

ROOT = Path(__file__).resolve().parents[1]
MANIFEST_PATH = ROOT / "scripts" / "ssi-autopilot" / "regions.json"
TRUSTED_PATH = ROOT / "scripts" / "ssi-autopilot" / "trusted_identities.json"

DNB_WAVES = (
    ("ssi-wave23-dnbanokk-2026-02-02.json", "DNBANOKK"),
    ("ssi-wave24-dnbasesx-2026-02-02.json", "DNBASESX"),
    ("ssi-wave26-dnbagb2l-2026-02-02.json", "DNBAGB2L"),
    ("ssi-wave27-dnbafihx-2026-02-02.json", "DNBAFIHX"),
)


def _bic11(value: str) -> str:
    value = value.strip().upper()
    return value if len(value) == 11 else value + "XXX"


def _load_wave(evidence_name: str, bic8: str):
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    evidence = json.loads(
        (ROOT / "scripts" / "ssi-autopilot" / "evidence" / evidence_name).read_text(
            encoding="utf-8"
        )
    )
    banks = [
        bank
        for region in manifest["regions"]
        for bank in region["banks"]
        if bank["bic8"] == bic8
    ]
    assert len(banks) == 1, f"manifest must contain exactly one {bic8} bank"
    bank = banks[0]
    regions = [region for region in manifest["regions"] if bank in region["banks"]]
    assert len(regions) == 1, f"manifest must contain exactly one region for {bic8}"
    return manifest, regions[0], bank, evidence


def _route_key(route: dict[str, str]) -> tuple[str, str]:
    return route["currency"].strip().upper(), _bic11(route["int_bic"])


def _seed_key(row) -> tuple[str, str]:
    return row[2].strip().upper(), _bic11(row[3])


@pytest.mark.parametrize("evidence_name,bic8", DNB_WAVES)
def test_dnb_wave_route_sets_match_manifest_and_seed(evidence_name, bic8):
    _manifest, _region, bank, evidence = _load_wave(evidence_name, bic8)
    evidence_keys = {_route_key(route) for route in evidence["routes"]}
    manifest_keys = {
        _route_key(route) for route in bank.get("admitted_records", [])
    }
    seed_keys = {_seed_key(row) for row in SSI_RECORDS if row[0] == f"{bic8}XXX"}

    assert evidence_keys == manifest_keys == seed_keys
    assert evidence["beneficiary_bic"] == bic8
    assert evidence["masking"]["raw_accounts_committed"] is False


def _all_dnb_route_cases():
    cases = []
    for evidence_name, bic8 in DNB_WAVES:
        evidence = json.loads(
            (ROOT / "scripts" / "ssi-autopilot" / "evidence" / evidence_name).read_text(
                encoding="utf-8"
            )
        )
        for route in evidence["routes"]:
            currency, int_bic = _route_key(route)
            cases.append(
                pytest.param(
                    evidence_name,
                    bic8,
                    currency,
                    int_bic,
                    id=f"{bic8}-{currency}-{int_bic}",
                )
            )
    return cases


@pytest.mark.parametrize(
    "evidence_name,bic8,currency,int_bic", _all_dnb_route_cases()
)
def test_each_dnb_route_matches_manifest_seed_and_trust(
    evidence_name, bic8, currency, int_bic
):
    _manifest, region, bank, evidence = _load_wave(evidence_name, bic8)
    route = next(
        route
        for route in evidence["routes"]
        if _route_key(route) == (currency, int_bic)
    )
    manifest_record = next(
        record
        for record in bank["admitted_records"]
        if _route_key(record) == (currency, int_bic)
    )
    seed_rows = [
        row
        for row in SSI_RECORDS
        if row[0] == f"{bic8}XXX" and _seed_key(row) == (currency, int_bic)
    ]
    assert len(seed_rows) == 1
    seed_row = seed_rows[0]

    assert region["masked_block"] == evidence["region_masked_block"]
    assert bank["bic8"] == bic8
    assert manifest_record["nostro"] == route["nostro_mask"]
    assert manifest_record["with_an"] == route["with_an_mask"]
    assert (seed_row[5], seed_row[6]) == (
        route["nostro_mask"],
        route["with_an_mask"],
    )
    assert seed_row[1] == bank["name"]
    assert seed_row[2] == currency
    assert _bic11(seed_row[3]) == int_bic
    assert seed_row[4] == manifest_record["correspondent"]
    assert seed_row[7] == manifest_record["charge_code"]
    assert seed_row[8] == manifest_record["value_date"]
    assert seed_row[10] == manifest_record["as_of"] == evidence["as_of"]
    assert seed_row[11] == manifest_record["status"] == "unverified"
    assert seed_row[13] is False
    assert manifest_record["bic_only"] is False
    assert re.fullmatch(r"ACCT-\d{8}", route["nostro_mask"])
    assert re.fullmatch(r"ACCT-\d{8}", route["with_an_mask"])

    trusted = json.loads(TRUSTED_PATH.read_text(encoding="utf-8"))
    assert trusted[bic8]["settlement_terms_published"] is False
