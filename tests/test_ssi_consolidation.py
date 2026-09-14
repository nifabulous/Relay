import json
from collections import Counter
from pathlib import Path

from app.models import SSI
from app.services.routing import _is_routable_ssi, suggest_from_ssi
from app.services.seed import _SSI_CONSOLIDATION_DATA_FILES, BANKS, SSI_RECORDS

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
    ]
    assert all(count == 1 for count in Counter(bank_bics).values())
    assert all(count == 1 for count in Counter(route_keys).values())
    assert {LEDGER.name} == set(_SSI_CONSOLIDATION_DATA_FILES)
    seeded_rows = set(SSI_RECORDS)
    assert all(
        len(row) == 15 and tuple(row) in seeded_rows
        for row in payload["ssi_records"]
    )


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
        persisted = db_session_clean.query(SSI).filter(
            SSI.beneficiary_bic == beneficiary_bic,
            SSI.currency == currency,
            SSI.intermediary_bic.in_(new_bics),
        ).all()
        assert {row.intermediary_bic for row in persisted} == new_bics
        assert all(not _is_routable_ssi(row) for row in persisted)
        selected = suggest_from_ssi(db_session_clean, beneficiary_bic, currency, None)
        assert new_bics.isdisjoint(suggestion.bic for suggestion in selected)

    db_session_clean.add(SSI(
        beneficiary_bic="FICOUS44XXX",
        beneficiary_bank_name="Synovus Bank",
        currency="USD",
        intermediary_bic="BOFAUS3NXXX",
        intermediary_bank_name="Bank of America, New York",
        intermediary_account="123456789",
        beneficiary_account="987654321",
        charge_code="SHA",
        value_date="spot",
        notes="Source: selector control.",
        as_of="2026-09-14",
        status="published",
        verified_by="Treasury Operations",
        bic_only=False,
        terms_inferred=False,
    ))
    db_session_clean.commit()
    assert [
        suggestion.bic
        for suggestion in suggest_from_ssi(db_session_clean, "FICOUS44XXX", "USD", "US")
    ] == ["BOFAUS3NXXX"]


def test_commercial_bank_aud_location_mismatch_was_not_consolidated():
    assert not any(
        row[0] == "COMBKWKWXXX"
        and row[2] == "AUD"
        and row[3] == "IRVTUS3NXXX"
        for row in SSI_RECORDS
    )
