import json
from pathlib import Path

from app.models import SSI
from app.services.routing import _is_routable_ssi
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


def test_wave18_source_snapshot_and_selection_guard_cover_all_routes():
    manifest = json.loads((ROOT / "scripts/ssi-autopilot/regions.json").read_text())
    evidence = json.loads(
        (ROOT / "scripts/ssi-autopilot/evidence/ssi-wave18-bbdebrsp-2026-09-08.json").read_text()
    )
    bank = next(
        bank
        for region in manifest["regions"]
        for bank in region["banks"]
        if bank["bic8"] == "BBDEBRSP"
    )
    records = [row for row in SSI_RECORDS if row[0] == "BBDEBRSPXXX"]
    assert len(bank["admitted_records"]) == evidence["source_snapshot"]["route_count"] == len(records)
    assert evidence["source_snapshot"]["source_sha256"] == evidence["source_sha256"]
    assert evidence["source_snapshot"]["raw_accounts_committed"] is False
    assert evidence["source_snapshot"]["routes"] == [
        {
            "currency": record["currency"],
            "int_bic": record["int_bic"],
            "correspondent": record["correspondent"],
            "bic_only": record["bic_only"],
            "has_account_data": record["nostro"] is not None,
            **({"terms_inferred": True} if record.get("terms_inferred") else {}),
        }
        for record in bank["admitted_records"]
    ]
    bic_only = [row for row in records if row[13] is True]
    assert len(bic_only) == evidence["source_snapshot"]["bic_only_route_count"]
    assert all(not _is_routable_ssi(_row_to_ssi(row)) for row in bic_only)
    jpy = next(row for row in records if row[2] == "JPY")
    assert len(jpy) == 15
    assert jpy[13] is False and jpy[14] is True
    assert _is_routable_ssi(_row_to_ssi(jpy)) is False


def test_wave18_seeded_rows_are_excluded_by_the_production_selector(db_session_clean):
    from app.services.routing import suggest_from_ssi

    rows = db_session_clean.query(SSI).filter(
        SSI.beneficiary_bic == "BBDEBRSPXXX"
    ).all()
    assert len(rows) == 24
    assert all(not _is_routable_ssi(row) for row in rows)
    loaded_jpy = next(row for row in rows if row.currency == "JPY")
    assert loaded_jpy.intermediary_bic == "BOTKJPJTXXX"
    assert loaded_jpy.bic_only is False
    assert loaded_jpy.terms_inferred is True
    assert loaded_jpy.intermediary_account == "ACCT-91000841"
    assert loaded_jpy.beneficiary_account == "ACCT-91000842"
    assert suggest_from_ssi(db_session_clean, "BBDEBRSPXXX", "USD", "BR") == []
    assert suggest_from_ssi(db_session_clean, "BBDEBRSPXXX", "JPY", "BR") == []
