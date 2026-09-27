"""Contract tests for the 2026-09-27 official-bank SSI wave."""

import json
import re
from collections import Counter
from pathlib import Path

from app.services.seed import _SSI_CONSOLIDATION_DATA_FILES, SSI_RECORDS

ROOT = Path(__file__).resolve().parents[1]
LEDGER_PATH = ROOT / "app" / "services" / "seed_ssi_continuous_20260927_wave2.json"
EVIDENCE_PATH = (
    ROOT
    / "scripts"
    / "ssi-autopilot"
    / "evidence"
    / "ssi-continuous-20260927-wave2.json"
)
BIC11 = re.compile(r"^[A-Z0-9]{11}$")


def _load():
    return json.loads(LEDGER_PATH.read_text()), json.loads(EVIDENCE_PATH.read_text())


def test_wave2_is_registered_and_source_complete():
    ledger, evidence = _load()
    rows = ledger["ssi_records"]

    assert LEDGER_PATH.name in _SSI_CONSOLIDATION_DATA_FILES
    assert ledger["source_prs"] == []
    assert ledger["banks"] == []
    assert len(rows) == evidence["scope"]["included_route_count"] == 63
    assert evidence["source_snapshot"]["route_count"] == len(rows)
    assert sum(source["route_count"] for source in evidence["sources"]) == len(rows)

    expected_counts = {
        source["beneficiary_bic"]: source["route_count"]
        for source in evidence["sources"]
    }
    assert Counter(row[0] for row in rows) == Counter(expected_counts)


def test_wave2_rows_are_canonical_unique_bic_only_and_non_routable():
    ledger, evidence = _load()
    rows = ledger["ssi_records"]
    source_urls = {source["url"] for source in evidence["sources"]}
    keys = {(row[0], row[2], row[3]) for row in rows}

    assert len(keys) == len(rows)
    for row in rows:
        assert len(row) == 15
        assert BIC11.fullmatch(row[0])
        assert BIC11.fullmatch(row[3])
        assert row[5:9] == [None, None, None, None]
        assert row[11:] == ["unverified", None, True, False]
        assert any(url in row[9] for url in source_urls)
        assert "BIC-only route" in row[9]
        assert not any(char.isdigit() for char in row[9].split("Source:", 1)[-1].split("(", 1)[0])


def test_wave2_routes_are_loaded_into_the_consolidated_corpus():
    ledger, _ = _load()
    expected = {(row[0], row[2], row[3]) for row in ledger["ssi_records"]}
    actual = {(row[0], row[2], row[3]) for row in SSI_RECORDS}

    assert expected <= actual
