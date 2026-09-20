"""Regression checks for the Kenya correspondent-bank follow-up ledger."""

import json
import re
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
LEDGER_PATH = (
    ROOT / "app/services/seed_ssi_consolidation_10_africa_mena_followup_kenya.json"
)
EVIDENCE_PATH = ROOT / (
    "scripts/ssi-autopilot/evidence/"
    "ssi-africa-mena-wave-10k-followup-kenya-2026-09-20.json"
)
BIC_RE = re.compile(r"^[A-Z]{6}[A-Z0-9]{5}$")
SOURCE_RE = re.compile(r"Source: (https?://\S+)")


def _load():
    return json.loads(LEDGER_PATH.read_text()), json.loads(EVIDENCE_PATH.read_text())


def test_ledger_shape_and_exact_route_count():
    ledger, evidence = _load()
    assert set(ledger) == {"source_prs", "banks", "ssi_records"}
    assert ledger["source_prs"] == []
    assert ledger["banks"] == []
    assert len(ledger["ssi_records"]) == 53
    assert evidence["scope"]["route_count"] == 53
    assert evidence["scope"]["beneficiary_count"] == 3


def test_routes_are_unique_canonical_and_bic_only():
    ledger, _ = _load()
    records = ledger["ssi_records"]
    keys = [(row[0], row[2], row[3]) for row in records]
    assert len(keys) == len(set(keys)) == 53

    for row in records:
        assert len(row) == 15
        assert BIC_RE.fullmatch(row[0])
        assert BIC_RE.fullmatch(row[3])
        assert re.fullmatch(r"[A-Z]{3}", row[2])
        assert row[5:9] == [None, None, None, None]
        assert row[11] == "unverified"
        assert row[13] is True
        assert row[14] is False
        source_match = SOURCE_RE.search(row[9])
        assert source_match
        assert source_match.group(1).startswith("https://")


def test_every_official_source_matches_ledger_counts():
    ledger, evidence = _load()
    source_counts = Counter()
    beneficiary_counts = Counter()
    for row in ledger["ssi_records"]:
        source_counts[SOURCE_RE.search(row[9]).group(1)] += 1
        beneficiary_counts[row[0]] += 1

    sources = evidence["sources"]
    assert len(sources) == 3
    assert sum(source["route_count"] for source in sources) == 53
    assert {source["url"] for source in sources} == set(source_counts)
    assert {source["beneficiary_bic"] for source in sources} == set(beneficiary_counts)
    for source in sources:
        assert source_counts[source["url"]] == source["route_count"]
        assert beneficiary_counts[source["beneficiary_bic"]] == source["route_count"]

