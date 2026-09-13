import json
from pathlib import Path

from app.models import SSI
from app.services.routing import _is_routable_ssi, suggest_from_ssi
from app.services.seed import SSI_RECORDS

ROOT = Path(__file__).resolve().parents[1]


def test_canara_gift_city_inferred_terms_are_not_routable():
    """Masked Canara SSI rows remain informational until terms are verified."""
    evidence = json.loads(
        (ROOT / "scripts/ssi-autopilot/evidence/ssi-canara-gift-city-2026-09-13.json").read_text()
    )
    rows = [row for row in SSI_RECORDS if row[0] == "CNRBINAAXXX"]
    assert [{"currency": row[2], "int_bic": row[3]} for row in rows] == evidence["routes"]
    assert evidence["source_last_updated"] == "2026-02-18"
    assert evidence["source_snapshot"]["raw_accounts_committed"] is False

    for row in rows:
        provenance = row[10:]
        ssi = SSI(
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
        assert ssi.terms_inferred is False
        assert ssi.status == "unverified"
        assert not _is_routable_ssi(ssi)


def test_canara_gift_city_rows_are_excluded_by_live_selection(db_session_clean):
    """The production SSI selector returns no executable Canara rows."""
    currencies = {row[2] for row in SSI_RECORDS if row[0] == "CNRBINAAXXX"}
    assert currencies
    assert all(
        suggest_from_ssi(db_session_clean, "CNRBINAAXXX", currency, "IN") == []
        for currency in currencies
    )
