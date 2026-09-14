import json
import re
from pathlib import Path

from app.models import SSI
from app.services.routing import _is_routable_ssi, suggest_from_ssi
from app.services.seed import SSI_RECORDS

ROOT = Path(__file__).resolve().parents[1]


def _row_to_ssi(row):
    provenance = list(row[10:])
    return SSI(
        beneficiary_bic=row[0],
        beneficiary_bank_name=row[1],
        currency=row[2],
        intermediary_bic=row[3],
        intermediary_bank_name=row[4],
        intermediary_account=row[5],
        beneficiary_account=row[6],
        charge_code=row[7],
        value_date=row[8],
        notes=row[9],
        as_of=provenance[0] if provenance else None,
        status=provenance[1] if len(provenance) > 1 else "illustrative",
        verified_by=provenance[2] if len(provenance) > 2 else None,
        bic_only=provenance[3] if len(provenance) > 3 else False,
        terms_inferred=provenance[4] if len(provenance) > 4 else False,
    )


def _evidence():
    return json.loads(
        (ROOT / "scripts/ssi-autopilot/evidence/ssi-wave60-bnzwomrx-2024-08-01.json").read_text()
    )


def test_bank_nizwa_archived_routes_match_masked_evidence():
    evidence = _evidence()
    source = evidence["source_snapshot"]["source"]
    rows = [
        row for row in SSI_RECORDS
        if row[0] == evidence["beneficiary"]["bic"]
        and row[9].startswith(f"Source: {source} (as of 2024-08-01)")
    ]
    expected = {(route["currency"], route["int_bic"]) for route in evidence["routes"]}
    actual = {(row[2], row[3].removesuffix("XXX")) for row in rows}
    assert len(rows) == evidence["source_snapshot"]["route_count"] == 12
    assert actual == expected
    assert all(re.fullmatch(r"ACCT-910016(?:3[0-9]|4[0-9]|5[0-2])", row[5]) for row in rows)
    assert all(row[5] == row[6] for row in rows)
    assert all(row[13] is False and row[14] is True for row in rows)
    assert all(row[11] == "archived" for row in rows)
    assert all(not _is_routable_ssi(_row_to_ssi(row)) for row in rows)


def test_bank_nizwa_archived_routes_are_excluded_by_production_selector(db_session_clean):
    evidence = _evidence()
    source_prefix = f"Source: {evidence['source_snapshot']['source']} (as of 2024-08-01)%"
    rows = db_session_clean.query(SSI).filter(
        SSI.beneficiary_bic == evidence["beneficiary"]["bic"],
        SSI.notes.like(source_prefix),
    ).all()
    assert len(rows) == 12
    assert all(not _is_routable_ssi(row) for row in rows)
    assert all(
        suggest_from_ssi(db_session_clean, evidence["beneficiary"]["bic"], row.currency, "OM") == []
        for row in rows
    )
