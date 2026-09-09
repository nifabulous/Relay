import json
import re
from pathlib import Path

from app.models import SSI
from app.services.routing import _is_routable_ssi
from app.services.seed import SSI_RECORDS
from app.services.ssi_importer import canonicalize_bic11, ssi_composite_key

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
    assert evidence["masking"]["namespace"] == "beneficiary_bic"
    aliases = evidence["source_snapshot"]["bic_aliases"]
    assert aliases == {
        "SCBLDEFX": "SCBLDEFFXXX",
        "PNBPUS3NNYC": "PNBPUS33XXX",
    }
    route_bics = {route["int_bic"] for route in evidence["routes"]}
    assert set(aliases.values()) <= route_bics
    trusted = json.loads((ROOT / "scripts/ssi-autopilot/trusted_identities.json").read_text())
    assert trusted["FNNBTRIS"]["settlement_terms_published"] is False


def test_wave21_source_matches_independent_attestation_fixture():
    bank, evidence = _load()
    attestation = json.loads(
        (ROOT / "tests/fixtures/ssi_wave21_source_attestation.json").read_text()
    )
    assert attestation["beneficiary_bic"] == evidence["beneficiary_bic"] == "FNNBTRIS"
    assert attestation["source"] == evidence["source"]
    assert attestation["source_sha256"] == evidence["source_sha256"]
    expected_route_keys = {tuple(key) for key in attestation["route_keys"]}
    evidence_route_keys = {(route["currency"], route["int_bic"]) for route in evidence["routes"]}
    manifest_route_keys = {
        (record["currency"], record["int_bic"]) for record in bank["admitted_records"]
    }
    assert evidence_route_keys == manifest_route_keys == expected_route_keys
    assert len(expected_route_keys) == 31


def test_wave21_evidence_manifest_and_seed_share_canonical_bic_keys():
    """BIC-8 source notation and seeded BIC-11 rows join on one identity."""
    bank, evidence = _load()
    evidence_keys = {
        (
            canonicalize_bic11(evidence["beneficiary_bic"]),
            route["currency"],
            canonicalize_bic11(route["int_bic"]),
        )
        for route in evidence["routes"]
    }
    manifest_keys = {
        (
            canonicalize_bic11(bank["bic8"]),
            record["currency"],
            canonicalize_bic11(record["int_bic"]),
        )
        for record in bank["admitted_records"]
    }
    seed_keys = {
        (canonicalize_bic11(row[0]), row[2], canonicalize_bic11(row[3]))
        for row in SSI_RECORDS
        if row[0] == canonicalize_bic11(bank["bic8"])
    }
    assert evidence_keys == manifest_keys == seed_keys


def test_turkey_mask_namespace_is_beneficiary_scoped():
    qnb_bank, qnb_evidence = _load()
    manifest = json.loads((ROOT / "scripts/ssi-autopilot/regions.json").read_text())
    destek_bank = next(
        bank
        for region in manifest["regions"]
        for bank in region["banks"]
        if bank["bic8"] == "DEYATRIS"
    )
    destek_evidence = json.loads(
        (ROOT / "scripts/ssi-autopilot/evidence/ssi-wave22-deyatris-2025-11-30.json").read_text()
    )
    assert qnb_evidence["masking"]["namespace"] == destek_evidence["masking"]["namespace"] == "beneficiary_bic"
    qnb_masks = {
        (route["nostro_mask"], route["with_an_mask"]): (
            route["nostro_fingerprint"],
            route["with_an_fingerprint"],
        )
        for route in qnb_evidence["routes"]
    }
    destek_masks = {
        (route["nostro_mask"], route["with_an_mask"]): (
            route["nostro_fingerprint"],
            route["with_an_fingerprint"],
        )
        for route in destek_evidence["routes"]
    }
    collisions = set(qnb_masks) & set(destek_masks)
    assert collisions
    assert all(qnb_masks[mask] != destek_masks[mask] for mask in collisions)
    assert {record["nostro"] for record in qnb_bank["admitted_records"]} & {
        record["nostro"] for record in destek_bank["admitted_records"]
    }

    # The same redacted token is allowed in two beneficiary namespaces, but
    # the runtime identity used by the importer remains distinct.
    assert ssi_composite_key("FNNBTRIS", "USD", "IRVTUS3N") != ssi_composite_key(
        "DEYATRIS", "USD", "IRVTUS3N"
    )
    composite = next(
        constraint
        for constraint in SSI.__table__.constraints
        if constraint.name == "uq_ssi_composite"
    )
    assert tuple(column.name for column in composite.columns) == (
        "beneficiary_bic",
        "currency",
        "intermediary_bic",
    )


def test_wave21_inferred_routes_are_excluded_by_the_selection_guard():
    rows = [row for row in SSI_RECORDS if row[0] == "FNNBTRISXXX"]
    assert len(rows) == 31
    assert all(row[14] is True for row in rows)
    assert all(not _is_routable_ssi(_row_to_ssi(row)) for row in rows)


def test_wave21_manifest_coverage_is_non_vacuous():
    manifest = json.loads((ROOT / "scripts/ssi-autopilot/regions.json").read_text())
    region = next(region for region in manifest["regions"] if region["name"] == "turkey-israel")
    bank = next(bank for bank in region["banks"] if bank["bic8"] == "FNNBTRIS")
    seeded = [row for row in SSI_RECORDS if row[0] == "FNNBTRISXXX"]
    assert {record["currency"] for record in bank["admitted_records"]} == {
        row[2] for row in seeded
    }
    assert len(seeded) == len(bank["admitted_records"]) == 31
