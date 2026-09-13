from app.models import SSI
from app.services.routing import _is_routable_ssi
from app.services.seed import SSI_RECORDS


def test_old_national_foreign_currency_routes_are_terms_inferred():
    """Old National's foreign-currency terms remain guarded until verified."""
    expected = {
        ("EUR", "CHASGB2LXXX"),
        ("GBP", "CHASGB2LXXX"),
        ("CAD", "CIBCCATTXXX"),
    }
    rows = [row for row in SSI_RECORDS if row[0] == "OLNAUS44XXX"]
    assert {(row[2], row[3]) for row in rows} == expected

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
        assert ssi.terms_inferred is True
        assert ssi.status == "unverified"
        assert not _is_routable_ssi(ssi)
