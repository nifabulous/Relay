"""Regression checks for the official Al Baraka Egypt SSI ledger."""

import json
import re
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
LEDGER_PATH = ROOT / "app/services/seed_ssi_consolidation_10_africa_mena_albaraka_egypt.json"
EVIDENCE_PATH = ROOT / "scripts/ssi-autopilot/evidence/ssi-africa-mena-albaraka-egypt-2026-09-20.json"
BIC_RE = re.compile(r"^[A-Z]{6}[A-Z0-9]{5}$")
SOURCE_RE = re.compile(r"Source: (https?://\S+)")


def test_ledger_is_canonical_and_evidence_backed():
    ledger = json.loads(LEDGER_PATH.read_text())
    evidence = json.loads(EVIDENCE_PATH.read_text())
    rows = ledger["ssi_records"]
    keys = [(r[0], r[2], r[3]) for r in rows]
    assert set(ledger) == {"source_prs", "banks", "ssi_records"}
    assert ledger["source_prs"] == ledger["banks"] == []
    assert len(rows) == len(keys) == len(set(keys)) == 14
    assert evidence["scope"]["route_count"] == evidence["sources"][0]["route_count"] == 14
    assert evidence["sources"][0]["url"] == SOURCE_RE.search(rows[0][9]).group(1)
    assert Counter(SOURCE_RE.search(r[9]).group(1) for r in rows) == {evidence["sources"][0]["url"]: 14}
    for row in rows:
        assert len(row) == 15 and BIC_RE.fullmatch(row[0]) and BIC_RE.fullmatch(row[3])
        assert re.fullmatch(r"[A-Z]{3}", row[2])
        assert row[5:9] == [None, None, None, None]
        assert row[11:15] == ["unverified", None, True, False]
