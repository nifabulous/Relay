"""Regression checks for the Africa/MENA 10k expansion ledger.

The ledger is intentionally standalone: integration into the central seed
catalog happens in a separate change.  These checks protect source coverage,
route uniqueness, and the BIC-only/non-routable safety contract.
"""

import json
import re
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
LEDGER_PATH = ROOT / "app/services/seed_ssi_consolidation_10_africa_mena.json"
EVIDENCE_PATH = (
    ROOT / "scripts/ssi-autopilot/evidence/ssi-africa-mena-wave-10k-2026-09-20.json"
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
    assert len(ledger["ssi_records"]) == 63
    assert evidence["scope"]["route_count"] == 63
    assert evidence["scope"]["beneficiary_count"] == 9


def test_routes_are_unique_canonical_and_bic_only():
    ledger, _ = _load()
    records = ledger["ssi_records"]
    keys = [(row[0], row[2], row[3]) for row in records]
    assert len(keys) == len(set(keys)) == 63

    for row in records:
        assert len(row) == 15
        beneficiary_bic, _, currency, intermediary_bic = row[:4]
        assert BIC_RE.fullmatch(beneficiary_bic)
        assert BIC_RE.fullmatch(intermediary_bic)
        assert re.fullmatch(r"[A-Z]{3}", currency)
        assert row[5:9] == [None, None, None, None]
        assert row[11] == "unverified"
        assert row[13] is True
        assert row[14] is False
        source_match = SOURCE_RE.search(row[9])
        assert source_match, row[9]
        assert source_match.group(1).startswith("https://")


def test_every_official_source_matches_ledger_counts():
    ledger, evidence = _load()
    records = ledger["ssi_records"]
    source_counts = Counter()
    beneficiary_counts = Counter()
    for row in records:
        source_url = SOURCE_RE.search(row[9]).group(1)
        source_counts[source_url] += 1
        beneficiary_counts[row[0]] += 1

    evidence_sources = evidence["sources"]
    assert len(evidence_sources) == 9
    assert sum(source["route_count"] for source in evidence_sources) == 63
    assert {source["url"] for source in evidence_sources} == set(source_counts)
    assert {source["beneficiary_bic"] for source in evidence_sources} == set(
        beneficiary_counts
    )
    for source in evidence_sources:
        assert source_counts[source["url"]] == source["route_count"]
        assert beneficiary_counts[source["beneficiary_bic"]] == source["route_count"]
