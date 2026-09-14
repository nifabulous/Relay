import json
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
        (ROOT / "scripts/ssi-autopilot/evidence/ssi-wave59-mashaeaad-2026-09-14.json").read_text()
    )


def test_mashreq_bic_only_routes_match_official_snapshot():
    evidence = _evidence()
    source = evidence["source_snapshot"]["source"]
    rows = [
        row for row in SSI_RECORDS
        if row[0] == evidence["beneficiary"]["bic"]
        and row[9].startswith(f"Source: {source} (as of 2026-09-14)")
    ]
    expected = {(route["currency"], route["int_bic"]) for route in evidence["routes"]}
    assert len(rows) == evidence["source_snapshot"]["route_count"] == 29
    assert {(row[2], row[3]) for row in rows} == expected
    assert all(row[5] is None and row[6] is None for row in rows)
    assert all(row[7] is None and row[8] is None for row in rows)
    assert all(row[13] is True and row[14] is False for row in rows)
    assert all(not _is_routable_ssi(_row_to_ssi(row)) for row in rows)


def test_mashreq_bic_only_routes_are_excluded_by_production_selector(db_session_clean):
    evidence = _evidence()
    source_prefix = f"Source: {evidence['source_snapshot']['source']} (as of 2026-09-14)%"
    rows = db_session_clean.query(SSI).filter(
        SSI.beneficiary_bic == evidence["beneficiary"]["bic"],
        SSI.notes.like(source_prefix),
    ).all()
    assert len(rows) == 29
    assert all(not _is_routable_ssi(row) for row in rows)
    assert all(
        suggest_from_ssi(db_session_clean, evidence["beneficiary"]["bic"], row.currency, "AE") == []
        for row in rows
    )
