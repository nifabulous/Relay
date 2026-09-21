"""Regression checks for the Central Asia Shinhan Kazakhstan BIC-only ledger."""

import json
import re
from pathlib import Path

from app.services.seed import SSI_RECORDS

ROOT = Path(__file__).resolve().parents[1]
LEDGER_PATH = ROOT / "app/services/seed_ssi_consolidation_10_central_asia_shinhan.json"
EVIDENCE_PATH = ROOT / "scripts/ssi-autopilot/evidence/ssi-central-asia-shinhan-2026-09-20.json"
BIC_RE = re.compile(r"^[A-Z]{6}[A-Z0-9]{5}$")
SOURCE_URL = "https://www.shinhan.kz/en/about-bank/requisites/"


def test_shinhan_ledger_is_additive_canonical_and_non_routable():
    ledger = json.loads(LEDGER_PATH.read_text())
    evidence = json.loads(EVIDENCE_PATH.read_text())
    records = ledger["ssi_records"]
    keys = {(row[0], row[2], row[3]) for row in records}

    assert len(records) == len(keys) == 4
    assert evidence["scope"]["route_count"] == 4
    assert evidence["scope"]["excluded_route_count"] == 1
    assert set(keys) <= {(row[0], row[2], row[3]) for row in SSI_RECORDS}
    for row in records:
        assert len(row) == 15
        assert BIC_RE.fullmatch(row[0]) and BIC_RE.fullmatch(row[3])
        assert row[5:9] == [None, None, None, None]
        assert f"Source: {SOURCE_URL}" in row[9]
        assert row[11] == "unverified"
        assert row[13:] == [True, False]

    assert evidence["sources"][0]["url"] == SOURCE_URL
    assert evidence["sources"][0]["published_scope_count"] == 5
