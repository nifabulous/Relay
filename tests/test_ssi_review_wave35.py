import json
from pathlib import Path

from app.services.routing import suggest_from_ssi
from app.services.seed import SSI_RECORDS

ROOT = Path(__file__).resolve().parents[1]


def test_axis_additions_match_evidence_and_are_excluded_from_live_selection(db_session_clean):
    evidence = json.loads(
        (ROOT / "scripts/ssi-autopilot/evidence/ssi-axis-2026-09-13.json").read_text()
    )
    rows = [
        row
        for row in SSI_RECORDS
        if row[0] == "AXISINBBXXX" and "as of 2026-09-13" in row[9]
    ]
    assert [{"currency": row[2], "int_bic": row[3]} for row in rows] == evidence["routes"]
    assert evidence["source_snapshot"]["raw_accounts_committed"] is False
    assert all(row[10] is None and row[11] == "unverified" for row in rows)
    assert all(
        suggest_from_ssi(db_session_clean, "AXISINBBXXX", row[2], "IN") == []
        for row in rows
    )
