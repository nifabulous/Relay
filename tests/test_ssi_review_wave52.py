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


def test_spar_nord_february_2026_table_matches_masked_seed_rows():
    evidence = json.loads(
        (ROOT / "scripts/ssi-autopilot/evidence/ssi-wave52-spnodk22-2026-02-02.json").read_text()
    )
    rows = [row for row in SSI_RECORDS if row[0] == "SPNODK22XXX"]
    expected = {(route["currency"], route["int_bic"] + "XXX" if len(route["int_bic"]) == 8 else route["int_bic"]) for route in evidence["routes"]}
    assert len(rows) == evidence["source_snapshot"]["route_count"] == 23
    assert {(row[2], row[3]) for row in rows} == expected
    assert all(row[5].startswith("ACCT-910050") for row in rows)
    assert all(row[6].startswith("ACCT-910050") for row in rows)
    assert all(row[7] == "SHA" and row[8] == "spot" for row in rows)
    assert all(row[13] is False and row[14] is True for row in rows)
    assert all(row[11] == "unverified" for row in rows)
    assert all("sparnord.dk" in row[9] and "Sourced from bank-published SSI page." in row[9] for row in rows)
    assert all(not _is_routable_ssi(_row_to_ssi(row)) for row in rows)


def test_spar_nord_rows_are_excluded_by_the_production_selector(db_session_clean):
    rows = db_session_clean.query(SSI).filter(
        SSI.beneficiary_bic == "SPNODK22XXX"
    ).all()
    assert len(rows) == 23
    assert all(not _is_routable_ssi(row) for row in rows)
    assert all(
        suggest_from_ssi(db_session_clean, "SPNODK22XXX", currency, "DK") == []
        for currency in {row.currency for row in rows}
    )
