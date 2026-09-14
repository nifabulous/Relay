import json
from collections import Counter
from pathlib import Path

from app.models import SSI
from app.services.routing import _is_routable_ssi, suggest_from_ssi
from app.services.seed import BANKS, SSI_RECORDS

ROOT = Path(__file__).resolve().parents[1]
LEDGERS = sorted((ROOT / "app" / "services").glob("seed_ssi_consolidation_*.json"))


def _payloads():
    return [json.loads(path.read_text()) for path in LEDGERS]


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
    payloads = _payloads()
    bank_bics = [bank[0] for bank in BANKS]
    route_keys = [(row[0], row[2], row[3]) for row in SSI_RECORDS]

    assert [pr for payload in payloads for pr in payload["source_prs"]] == [
        *range(103, 113),
        113,
        115,
        116,
        117,
        118,
        119,
        120,
        121,
        122,
        123,
        125,
        126,
        127,
        128,
        129,
        130,
        131,
        133,
        134,
        135,
        136,
        137,
        138,
        139,
        140,
        141,
        142,
        143,
        144,
    ]
    assert [
        pr for payload in payloads for pr in payload.get("superseded_prs", [])
    ] == [124]
    assert all(count == 1 for count in Counter(bank_bics).values())
    assert all(count == 1 for count in Counter(route_keys).values())


def test_consolidated_rows_are_informational_until_independently_verified():
    records = [row for payload in _payloads() for row in payload["ssi_records"]]
    assert records
    assert all(not _is_routable_ssi(_row_to_ssi(row)) for row in records)


def test_consolidated_rows_cannot_leak_through_the_production_selector(db_session_clean):
    new_bics_by_pair = {}
    for payload in _payloads():
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


def test_final_batch_applies_the_reviewed_payment_data_corrections():
    final = _payloads()[-1]["ssi_records"]

    assert not any(row[3] == "PNBPUS33XXX" for row in final)
    corrected_wells_fargo = [row for row in final if row[3] == "PNBPUS3NXXX"]
    assert corrected_wells_fargo
    assert all(row[4] == "Wells Fargo Bank N.A., New York" for row in corrected_wells_fargo)

    iob_dkk = [row for row in final if row[0] == "IOBAINBBXXX" and row[2] == "DKK"]
    assert iob_dkk
    assert all(row[3].startswith("DABADKKK") for row in iob_dkk)
    assert all("Danske Bank" in row[4] for row in iob_dkk)


def test_masked_account_comments_are_resolved_in_the_final_batch():
    final = _payloads()[-1]["ssi_records"]
    enbd = [row for row in final if row[0] == "EBILAEADXXX"]
    assert enbd
    assert all(row[5:9] == [None, None, None, None] for row in enbd)
    assert all(row[13] is True and row[14] is False for row in enbd)

    axis = [row for row in final if row[0] == "AXISINBBXXX"]
    assert axis
    assert all(row[6] is None for row in axis)
