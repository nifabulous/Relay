import json
from pathlib import Path

from app.models import SSI
from app.services.routing import _is_routable_ssi, suggest_from_ssi
from app.services.seed import SSI_RECORDS

ROOT = Path(__file__).resolve().parents[1]


def test_east_west_gbp_is_availability_only(db_session_clean):
    """The GBP PDF provides a BIC path, not an executable account instruction."""
    evidence = json.loads(
        (ROOT / "scripts/ssi-autopilot/evidence/ssi-east-west-2026-09-13.json").read_text()
    )
    rows = [row for row in SSI_RECORDS if row[0] == "EWBKUS66XXX"]
    assert [{"currency": row[2], "int_bic": row[3]} for row in rows] == evidence["routes"]
    assert evidence["source_revision"] == "2019-02"
    assert evidence["source_snapshot"]["raw_accounts_committed"] is False
    row = rows[0]
    assert row[5] is None and row[6] is None
    assert row[13] is True
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
        as_of=provenance[0],
        status=provenance[1],
        verified_by=provenance[2],
        bic_only=provenance[3],
        terms_inferred=provenance[4],
    )
    assert not _is_routable_ssi(ssi)
    assert suggest_from_ssi(db_session_clean, "EWBKUS66XXX", "GBP", "US") == []


def test_fundbank_single_hop_routes_are_availability_only(db_session_clean):
    """FundBank's direct correspondent rows stay non-selectable without accounts/terms."""
    evidence = json.loads(
        (ROOT / "scripts/ssi-autopilot/evidence/ssi-fundbank-2026-09-13.json").read_text()
    )
    rows = [row for row in SSI_RECORDS if row[0] == "CAYIKYKYXXX"]
    assert [{"currency": row[2], "int_bic": row[3]} for row in rows] == evidence["routes"]
    assert evidence["source_snapshot"]["raw_accounts_committed"] is False
    assert evidence["omitted_multi_hop_currencies"] == [
        "CHF", "JPY", "CAD", "AUD", "HKD", "AED", "ILS", "ZAR"
    ]

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
            as_of=provenance[0],
            status=provenance[1],
            verified_by=provenance[2],
            bic_only=provenance[3],
            terms_inferred=provenance[4],
        )
        assert ssi.bic_only is True
        assert ssi.status == "unverified"
        assert not _is_routable_ssi(ssi)
        assert suggest_from_ssi(db_session_clean, "CAYIKYKYXXX", row[2], "KY") == []
