import json
from collections import Counter
from pathlib import Path

from app.models import SSI
from app.services.routing import _is_routable_ssi, suggest_from_ssi
from app.services.seed import BANKS, SSI_RECORDS

ROOT = Path(__file__).resolve().parents[1]
LEDGER = ROOT / "app" / "services" / "seed_ssi_consolidation_1.json"


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


def test_consolidated_ledger_has_unique_bank_and_route_keys():
    payload = json.loads(LEDGER.read_text())
    bank_bics = [bank[0] for bank in BANKS]
    route_keys = [(row[0], row[2], row[3]) for row in SSI_RECORDS]

    assert payload["source_prs"] == list(range(103, 113))
    assert all(count == 1 for count in Counter(bank_bics).values())
    assert all(count == 1 for count in Counter(route_keys).values())


def test_consolidated_rows_are_informational_until_independently_verified():
    payload = json.loads(LEDGER.read_text())
    assert payload["ssi_records"]
    assert all(not _is_routable_ssi(_row_to_ssi(row)) for row in payload["ssi_records"])


def test_consolidated_rows_cannot_leak_through_the_production_selector(db_session_clean):
    payload = json.loads(LEDGER.read_text())
    new_bics_by_pair = {}
    for row in payload["ssi_records"]:
        new_bics_by_pair.setdefault((row[0], row[2]), set()).add(row[3])

    for (beneficiary_bic, currency), new_bics in new_bics_by_pair.items():
        selected = suggest_from_ssi(db_session_clean, beneficiary_bic, currency, None)
        assert new_bics.isdisjoint(suggestion.bic for suggestion in selected)


def test_commercial_bank_aud_location_mismatch_was_not_consolidated():
    assert not any(
        row[0] == "COMBKWKWXXX"
        and row[2] == "AUD"
        and row[3] == "IRVTUS3NXXX"
        for row in SSI_RECORDS
    )
