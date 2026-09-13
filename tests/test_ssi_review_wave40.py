import json
from pathlib import Path

from app.models import SSI
from app.services.routing import _is_routable_ssi, suggest_from_ssi
from app.services.seed import SSI_RECORDS

ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / "scripts/ssi-autopilot/evidence/ssi-grasshopper-bank-2026-09-13.json"


def _row_object(row):
    provenance = row[10:]
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
        as_of=provenance[0],
        status=provenance[1],
        verified_by=provenance[2],
        bic_only=provenance[3],
        terms_inferred=provenance[4],
    )


def test_grasshopper_currency_table_matches_bic_only_seed_rows(db_session_clean):
    evidence = json.loads(EVIDENCE.read_text(encoding="utf-8"))
    beneficiary_bic = evidence["beneficiary"]["bic"]
    rows = [row for row in SSI_RECORDS if row[0] == beneficiary_bic]
    actual = {(row[2], row[3]) for row in rows}
    expected = {(route["currency"], route["int_bic"]) for route in evidence["routes"]}

    assert len(rows) == 24
    assert actual == expected
    for row in rows:
        ssi = _row_object(row)
        assert ssi.bic_only is True
        assert ssi.status == "unverified"
        assert ssi.intermediary_account is None
        assert ssi.beneficiary_account is None
        assert not _is_routable_ssi(ssi)
        assert suggest_from_ssi(db_session_clean, beneficiary_bic, row[2], "US") == []
