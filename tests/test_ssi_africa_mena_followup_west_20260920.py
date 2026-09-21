import json
import re
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LEDGER = ROOT / "app/services/seed_ssi_consolidation_10_africa_mena_followup_west_20260920.json"
EVIDENCE = ROOT / "scripts/ssi-autopilot/evidence/ssi-africa-mena-followup-west-20260920.json"
BIC_RE = re.compile(r"^[A-Z]{6}[A-Z0-9]{5}$")
SOURCE_RE = re.compile(r"Source: (https?://\S+)")


def test_shape_counts_and_metadata():
    data = json.loads(LEDGER.read_text())
    evidence = json.loads(EVIDENCE.read_text())
    assert set(data) == {"source_prs", "banks", "ssi_records"}
    assert data["source_prs"] == [] and data["banks"] == []
    assert len(data["ssi_records"]) == 24
    assert evidence["scope"] == {"route_count": 24, "beneficiary_count": 2, "region": "West/Central Africa"}


def test_unique_canonical_bic_only_routes():
    rows = json.loads(LEDGER.read_text())["ssi_records"]
    keys = [(r[0], r[2], r[3]) for r in rows]
    assert len(keys) == len(set(keys)) == 24
    for row in rows:
        assert len(row) == 15
        assert BIC_RE.fullmatch(row[0]) and BIC_RE.fullmatch(row[3])
        assert re.fullmatch(r"[A-Z]{3}", row[2])
        assert row[5:9] == [None, None, None, None]
        assert row[11:15] == ["unverified", None, True, False]
        assert SOURCE_RE.search(row[9]).group(1).startswith("https://")


def test_evidence_source_counts_match_rows():
    rows = json.loads(LEDGER.read_text())["ssi_records"]
    evidence = json.loads(EVIDENCE.read_text())
    counts = Counter(SOURCE_RE.search(r[9]).group(1) for r in rows)
    assert sum(s["route_count"] for s in evidence["sources"]) == 24
    assert {s["url"] for s in evidence["sources"]} == set(counts)
    for source in evidence["sources"]:
        assert counts[source["url"]] == source["route_count"]
