import json
import re
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


def _load():
    manifest = json.loads((ROOT / "scripts/ssi-autopilot/regions.json").read_text())
    evidence = json.loads(
        (ROOT / "scripts/ssi-autopilot/evidence/ssi-wave21-fnnbtris-2026-09-08.json").read_text()
    )
    bank = next(
        bank
        for region in manifest["regions"]
        for bank in region["banks"]
        if bank["bic8"] == "FNNBTRIS"
    )
    return bank, evidence


def test_wave21_source_and_mask_equivalence_are_auditable():
    bank, evidence = _load()
    actual = {
        (record["currency"], record["int_bic"]): (record["nostro"], record["with_an"])
        for record in bank["admitted_records"]
    }
    expected = {
        (route["currency"], route["int_bic"]): (route["nostro_mask"], route["with_an_mask"])
        for route in evidence["routes"]
    }
    fingerprints = {
        (route["currency"], route["int_bic"]): (
            route["nostro_fingerprint"],
            route["with_an_fingerprint"],
        )
        for route in evidence["routes"]
    }
    assert actual == expected
    assert len(actual) == 31
    assert all(
        re.fullmatch(r"ACCT-\d{8}", value)
        for pair in actual.values()
        for value in pair
    )
    for left_key, left_fp in fingerprints.items():
        for right_key, right_fp in fingerprints.items():
            assert (actual[left_key] == actual[right_key]) == (left_fp == right_fp)
    assert evidence["source_snapshot"]["source_sha256"] == evidence["source_sha256"]
    assert evidence["source_snapshot"]["raw_accounts_committed"] is False
    assert evidence["source_snapshot"]["bic_aliases"]["PNBPUS33"] == "PNBPUS3NNYC"
    trusted = json.loads((ROOT / "scripts/ssi-autopilot/trusted_identities.json").read_text())
    assert trusted["FNNBTRIS"]["settlement_terms_published"] is False


def test_wave21_inferred_routes_are_excluded_by_the_selection_guard():
    rows = [row for row in SSI_RECORDS if row[0] == "FNNBTRISXXX"]
    assert len(rows) == 31
    assert all(row[14] is True for row in rows)
    assert all(not _is_routable_ssi(_row_to_ssi(row)) for row in rows)
