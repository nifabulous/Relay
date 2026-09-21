"""Regression checks for the Central Asia Eurasian Bank BIC-only ledger."""

import json
import re
from collections import Counter
from pathlib import Path

from app.services.seed import SSI_RECORDS

ROOT = Path(__file__).resolve().parents[1]
LEDGER_PATH = ROOT / "app/services/seed_ssi_consolidation_10_central_asia_eurasian.json"
EVIDENCE_PATH = ROOT / "scripts/ssi-autopilot/evidence/ssi-central-asia-eurasian-2026-09-20.json"
BIC_RE = re.compile(r"^[A-Z]{6}[A-Z0-9]{5}$")
SOURCE_URL = "https://eubank.kz/en/correspondent-accounts"


def _load():
    return json.loads(LEDGER_PATH.read_text()), json.loads(EVIDENCE_PATH.read_text())


def test_eurasian_ledger_is_additive_canonical_and_non_routable():
    ledger, evidence = _load()
    records = ledger["ssi_records"]
    keys = [(row[0], row[2], row[3]) for row in records]

    assert len(records) == len(keys) == len(set(keys)) == 24
    assert evidence["scope"]["route_count"] == 24
    assert evidence["scope"]["excluded_route_count"] == 3
    assert ledger["banks"] == [["EURIKZKAXXX", "Eurasian Bank JSC", "KZ", "Almaty", "KZT"]]
    assert set(keys) <= {(row[0], row[2], row[3]) for row in SSI_RECORDS}

    for row in records:
        assert len(row) == 15
        assert BIC_RE.fullmatch(row[0])
        assert BIC_RE.fullmatch(row[3])
        assert re.fullmatch(r"[A-Z]{3}", row[2])
        assert row[5:9] == [None, None, None, None]
        assert f"Source: {SOURCE_URL}" in row[9]
        assert row[11] == "unverified"
        assert row[13:] == [True, False]


def test_eurasian_evidence_matches_source_and_excludes_russian_routes():
    ledger, evidence = _load()
    records = ledger["ssi_records"]
    source_counts = Counter(row[9].split(" (official", 1)[0].removeprefix("Source: ") for row in records)

    assert source_counts == {SOURCE_URL: 24}
    assert evidence["sources"] == [
        {
            "url": SOURCE_URL,
            "beneficiary_bic": "EURIKZKAXXX",
            "beneficiary_name": "Eurasian Bank JSC",
            "route_count": 24,
            "published_scope_count": 27,
            "excluded_route_count": 3,
        }
    ]
    assert all(not row[3].endswith("RUMMXXX") and not row[3].endswith("RU8XXXX") for row in records)
