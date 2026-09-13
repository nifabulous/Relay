import json
from pathlib import Path

from app.models import SSI
from app.services.routing import _is_routable_ssi, suggest_from_ssi
from app.services.seed import SSI_RECORDS

ROOT = Path(__file__).resolve().parents[1]


def test_citizens_guyana_routes_match_current_official_wire_page(db_session_clean):
    """Citizens Bank Guyana's current page is represented as BIC-only data."""
    evidence = json.loads(
        (ROOT / "scripts/ssi-autopilot/evidence/ssi-citizens-guyana-2026-09-13.json").read_text()
    )
    rows = [row for row in SSI_RECORDS if row[0] == evidence["beneficiary_bic"]]
    assert [{"currency": row[2], "int_bic": row[3]} for row in rows] == evidence["routes"]
    assert evidence["source_snapshot"]["raw_accounts_committed"] is False
    assert evidence["identity_crosscheck_url"].startswith("https://epaguyana.org/")

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
        assert suggest_from_ssi(db_session_clean, evidence["beneficiary_bic"], row[2], "GY") == []
