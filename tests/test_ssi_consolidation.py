import hashlib
import json
from collections import Counter
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db import Base
from app.models import SSI, Bank
from app.services.routing import _is_routable_ssi, suggest_from_ssi
from app.services.seed import (
    _SSI_CONSOLIDATION_DATA_FILES,
    BANKS,
    SEED_BIC_ALIASES,
    SSI_RECORDS,
    _is_canonical_bic11,
    _load_ssi_consolidation_data,
    seed_if_empty,
)

ROOT = Path(__file__).resolve().parents[1]
LEDGERS = [ROOT / "app" / "services" / name for name in _SSI_CONSOLIDATION_DATA_FILES]
NEW_CONSOLIDATION_LEDGERS = {
    "seed_ssi_consolidation_8_1.json",
    "seed_ssi_consolidation_8_2.json",
    "seed_ssi_consolidation_8_mena.json",
    "seed_ssi_consolidation_mena_1.json",
}
NEW_CONSOLIDATION_EXPECTATIONS = {
    "seed_ssi_consolidation_8_1.json": {
        "banks": 2,
        "records": 484,
        "sha256": "0bb4ac394dde1b55c68b35079504ae2252eff5103ce1b61a318b53211852e164",
    },
    "seed_ssi_consolidation_8_2.json": {
        "banks": 29,
        "records": 462,
        "sha256": "9d6c69ad04dd35ea77a1b4d92579a381c013fbee93549bcb9a9f438f516c6263",
    },
    "seed_ssi_consolidation_8_mena.json": {
        "banks": 0,
        "records": 42,
        "sha256": "0ee93287d51912aa04e2646f5942f17a4dd4a7c2abe11e39a7a900ccb92d5f82",
    },
    "seed_ssi_consolidation_mena_1.json": {
        "banks": 1,
        "records": 22,
        "sha256": "c28b38b6191d4bcee94f593496d495c9d35f2c78a594d4fde18c9790e3517810",
    },
}


def _payloads():
    return [json.loads(path.read_text()) for path in LEDGERS]


def _batch_ledgers(batch):
    prefix = f"seed_ssi_consolidation_{batch}_"
    return [path for path in LEDGERS if path.name.startswith(prefix)]


def _batch_payloads(batch):
    return [json.loads(path.read_text()) for path in _batch_ledgers(batch)]


def _batch_records(batch):
    return [row for payload in _batch_payloads(batch) for row in payload["ssi_records"]]


def _production_seeded_session():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
        future=True,
    )
    Base.metadata.create_all(bind=engine)
    session = sessionmaker(bind=engine, future=True)()
    seed_if_empty(session)
    return engine, session


def test_10k_expansion_catalog_count_matches_integrated_route_keys():
    """Pin the 10k expansion claim to the exact seeded route-key total."""
    route_keys = {(row[0], row[2], row[3]) for row in SSI_RECORDS}

    # The current expansion branch has 1829 additional canonical routes over
    # the 10,164-route merged baseline; keep this exact catalog total pinned
    # until the remaining 10k collection waves land.
    assert len(SSI_RECORDS) == len(route_keys) == 11_993


def test_active_route_consumer_excludes_bic_only_and_archived_rows():
    """Informational SSI metadata must never become a selectable route."""
    engine, session = _production_seeded_session()
    session.add_all(
        [
            SSI(
                beneficiary_bic="TSTCUS33XXX",
                beneficiary_bank_name="Test BIC-only beneficiary",
                currency="USD",
                intermediary_bic="CHASUS33XXX",
                intermediary_bank_name="JPMorgan Chase Bank N.A.",
                notes="Source: https://bank.example/bic-only",
                as_of="2026-09-20",
                status="unverified",
                bic_only=True,
                terms_inferred=False,
            ),
            SSI(
                beneficiary_bic="TSTCUS33XXX",
                beneficiary_bank_name="Test archived beneficiary",
                currency="EUR",
                intermediary_bic="DEUTDEFFXXX",
                intermediary_bank_name="Deutsche Bank AG",
                intermediary_account="123456789012",
                beneficiary_account="123456789012",
                charge_code="SHA",
                value_date="spot",
                notes="Source: https://bank.example/archived-ssi (archived 2024-01-01).",
                as_of="2024-01-01",
                status="archived",
                bic_only=False,
                terms_inferred=False,
            ),
        ]
    )
    session.commit()

    assert suggest_from_ssi(session, "TSTCUS33XXX", "USD", "US") == []
    assert suggest_from_ssi(session, "TSTCUS33XXX", "EUR", "DE") == []

    session.close()
    engine.dispose()


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
        138,
        139,
        140,
        141,
        142,
        143,
        144,
    ]
    assert [pr for payload in payloads for pr in payload.get("superseded_prs", [])] == [124, 137]
    assert [len(payload["ssi_records"]) for payload in _batch_payloads(1)] == [
        20,
        20,
        40,
        30,
    ]
    assert len(_batch_records(1)) == 110
    assert all(count == 1 for count in Counter(bank_bics).values())
    assert all(count == 1 for count in Counter(route_keys).values())
    assert {path.name for path in LEDGERS} == set(_SSI_CONSOLIDATION_DATA_FILES)
    seeded_by_key = {(row[0], row[2], row[3]): row for row in SSI_RECORDS}
    for payload in payloads:
        for row in payload["ssi_records"]:
            assert len(row) == 15
            seeded = seeded_by_key[(row[0], row[2], row[3])]
            # The loader canonicalizes BIC-only notes so every persisted row
            # carries the same non-routable warning; identity, settlement
            # fields, provenance, and safety flags must remain byte-for-byte.
            seeded_compare = list(seeded[:9]) + list(seeded[10:])
            row_compare = list(row[:9]) + list(row[10:])
            if seeded_compare[1] != row_compare[1]:
                name_aliases = {
                    frozenset(
                        {
                            "Emirates NBD Bank P.J.S.C.",
                            "Emirates NBD Bank (P.J.S.C.)",
                        }
                    ),
                    frozenset({"Banca Transilvania", "Banca Transilvania S.A."}),
                    frozenset({"OTP banka d.d.", "OTP banka d.d., Split"}),
                        frozenset(
                            {"Banco Santander Uruguay S.A.", "Banco Santander S.A. Uruguay"}
                        ),
                        frozenset({"I&M Bank Rwanda Plc", "I AND M BANK (RWANDA) PLC"}),
                }
                assert frozenset({seeded_compare[1], row_compare[1]}) in name_aliases
                seeded_compare[1] = row_compare[1]
            if tuple(seeded_compare) != tuple(row_compare):
                # A later admitted manifest may supersede a consolidated
                # BIC-only relationship with a masked, account-bearing row.
                # Both remain non-routable until independently verified; the
                # route identity and provenance safety flags are what must be
                # preserved across that replacement.
                superseded = (
                    seeded[11] == row[11] == "unverified"
                    and seeded[14] is True
                    and (
                        (row[13] is True and seeded[13] is False)
                        or (row[13] is False and seeded[13] is False and row[14] is True)
                    )
                )
                assert superseded, (
                    f"unexpected consolidated-row replacement for "
                    f"{row[0]}/{row[2]}/{row[3]}"
                )


def test_new_consolidation_ledgers_are_explicitly_loaded_and_seeded():
    """Keep the latest ledgers visible and exercise the production loader."""
    on_disk = {path.name for path in LEDGERS}
    configured = set(_SSI_CONSOLIDATION_DATA_FILES)
    assert NEW_CONSOLIDATION_LEDGERS <= on_disk
    assert NEW_CONSOLIDATION_LEDGERS <= configured
    assert set(NEW_CONSOLIDATION_EXPECTATIONS) == NEW_CONSOLIDATION_LEDGERS

    # This is the same loader used during seed import. Calling it here makes
    # the per-ledger schema, duplicate-route, and safety validation part of
    # the bounded review contract rather than relying only on imported globals.
    loaded_banks, loaded_records = _load_ssi_consolidation_data()
    loaded_keys = {(row[0], row[2], row[3]) for row in loaded_records}

    seeded_by_key = {(row[0], row[2], row[3]) for row in SSI_RECORDS}
    for filename in sorted(NEW_CONSOLIDATION_LEDGERS):
        path = ROOT / "app" / "services" / filename
        payload = json.loads(path.read_text())
        expected = NEW_CONSOLIDATION_EXPECTATIONS[filename]
        assert isinstance(payload["banks"], list), filename
        assert payload["ssi_records"], filename
        assert len(payload["banks"]) == expected["banks"], filename
        assert len(payload["ssi_records"]) == expected["records"], filename
        assert hashlib.sha256(path.read_bytes()).hexdigest() == expected["sha256"], filename
        assert all(len(row) == 15 for row in payload["ssi_records"]), filename
        assert all(
            (row[0], row[2], row[3]) in seeded_by_key
            for row in payload["ssi_records"]
        ), filename
        assert all(
            (row[0], row[2], row[3]) in loaded_keys
            for row in payload["ssi_records"]
        ), filename

    assert len(loaded_banks) >= sum(
        item["banks"] for item in NEW_CONSOLIDATION_EXPECTATIONS.values()
    )


def test_second_consolidation_chunks_fully_replace_and_load_original_ledger():
    expected_names = {f"seed_ssi_consolidation_2_{part}.json" for part in range(1, 7)}
    batch_ledgers = _batch_ledgers(2)
    batch_payloads = _batch_payloads(2)
    configured_batch_names = {
        name
        for name in _SSI_CONSOLIDATION_DATA_FILES
        if name.startswith("seed_ssi_consolidation_2_")
    }

    assert {path.name for path in batch_ledgers} == configured_batch_names == expected_names
    assert not (ROOT / "app" / "services" / "seed_ssi_consolidation_2.json").exists()
    assert sum(len(payload["ssi_records"]) for payload in batch_payloads) == 236
    assert all(tuple(bank) in BANKS for payload in batch_payloads for bank in payload["banks"])
    assert all(
        tuple(row) in SSI_RECORDS for payload in batch_payloads for row in payload["ssi_records"]
    )


def test_consolidated_rows_are_informational_until_independently_verified():
    records = [row for payload in _payloads() for row in payload["ssi_records"]]
    assert records
    assert all(not _is_routable_ssi(_row_to_ssi(row)) for row in records)


def test_masked_accounts_are_not_reused_by_different_beneficiaries():
    account_owners = {}
    for payload in _payloads():
        for row in payload["ssi_records"]:
            for account in row[5:7]:
                if account:
                    previous_owner = account_owners.setdefault(account, row[0])
                    assert previous_owner == row[0], (
                        f"{account} is shared by {previous_owner} and {row[0]}"
                    )


def test_third_consolidation_batch_is_loaded_and_fails_closed():
    records = _batch_records(3)
    assert len(records) == 168
    assert all(not _is_routable_ssi(_row_to_ssi(row)) for row in records)

    engine, db_session_clean = _production_seeded_session()
    for beneficiary_bic, currency in {(row[0], row[2]) for row in records}:
        new_bics = {row[3] for row in records if row[0] == beneficiary_bic and row[2] == currency}
        persisted = (
            db_session_clean.query(SSI)
            .filter(
                SSI.beneficiary_bic == beneficiary_bic,
                SSI.currency == currency,
                SSI.intermediary_bic.in_(new_bics),
            )
            .all()
        )
        assert {row.intermediary_bic for row in persisted} == new_bics
        selected = suggest_from_ssi(db_session_clean, beneficiary_bic, currency, None)
        assert new_bics.isdisjoint(suggestion.bic for suggestion in selected)
    db_session_clean.close()
    engine.dispose()


def test_consolidation_evidence_does_not_commit_account_fingerprints():
    evidence_dir = ROOT / "scripts" / "ssi-autopilot" / "evidence"
    evidence_names = [
        "ssi-wave55-bceelull-2026-01-12.json",
        "ssi-wave56-nbokgb2l-2019-05-13.json",
    ]

    for evidence_name in evidence_names:
        evidence = json.loads((evidence_dir / evidence_name).read_text())
        assert evidence["masking"]["source_account_fingerprints_committed"] is False
        assert all("source_account_fingerprint" not in route for route in evidence["routes"])


def test_consolidated_rows_cannot_leak_through_the_production_selector():
    engine, db_session_clean = _production_seeded_session()
    new_bics_by_pair = {}
    for payload in _payloads():
        for row in payload["ssi_records"]:
            new_bics_by_pair.setdefault((row[0], row[2]), set()).add(row[3])

    for (beneficiary_bic, currency), new_bics in new_bics_by_pair.items():
        persisted = (
            db_session_clean.query(SSI)
            .filter(
                SSI.beneficiary_bic == beneficiary_bic,
                SSI.currency == currency,
                SSI.intermediary_bic.in_(new_bics),
            )
            .all()
        )
        assert persisted
        assert {row.intermediary_bic for row in persisted} == new_bics
        assert all(not _is_routable_ssi(row) for row in persisted)
        selected = suggest_from_ssi(db_session_clean, beneficiary_bic, currency, None)
        assert new_bics.isdisjoint(suggestion.bic for suggestion in selected)

    db_session_clean.add(
        SSI(
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
        )
    )
    db_session_clean.commit()
    assert [
        suggestion.bic
        for suggestion in suggest_from_ssi(db_session_clean, "FICOUS44XXX", "USD", "US")
    ] == ["BOFAUS3NXXX"]
    db_session_clean.close()
    engine.dispose()


def test_commercial_bank_aud_location_mismatch_was_not_consolidated():
    assert not any(
        row[0] == "COMBKWKWXXX" and row[2] == "AUD" and row[3] == "IRVTUS3NXXX"
        for row in SSI_RECORDS
    )


def test_final_batch_applies_the_reviewed_payment_data_corrections():
    final = _batch_records(4)

    assert len(final) == 123
    assert not any(row[3] == "PNBPUS33XXX" for row in final)
    corrected_wells_fargo = [row for row in final if row[3] == "PNBPUS3NXXX"]
    assert corrected_wells_fargo
    assert all(row[4] == "Wells Fargo Bank N.A., New York" for row in corrected_wells_fargo)

    iob_dkk = [row for row in final if row[0] == "IOBAINBBXXX" and row[2] == "DKK"]
    assert iob_dkk
    assert all(row[3].startswith("DABADKKK") for row in iob_dkk)
    assert all("Danske Bank" in row[4] for row in iob_dkk)


def test_jkb_evidence_route_count_matches_the_consolidated_seed():
    evidence = json.loads(
        (
            ROOT / "scripts" / "ssi-autopilot" / "evidence" / "ssi-wave68-jkbajoam-2026-09-14.json"
        ).read_text()
    )
    evidence_keys = {(route["currency"], route["int_bic"]) for route in evidence["routes"]}
    seeded_keys = {
        (row[2], row[3]) for row in _batch_records(4) if row[0] == evidence["beneficiary"]["bic"]
    }

    assert evidence["source_snapshot"]["route_count"] == 33
    assert len(evidence["routes"]) == len(evidence_keys) == 33
    assert seeded_keys == evidence_keys


def test_every_route_evidence_file_matches_the_seeded_catalog():
    def bic11(value):
        normalized = value.upper()
        return f"{normalized}XXX" if len(normalized) == 8 else normalized

    seeded_keys = {(bic11(row[0]), row[2], bic11(row[3])) for row in SSI_RECORDS}
    evidence_dir = ROOT / "scripts" / "ssi-autopilot" / "evidence"
    checked_files = []

    for path in sorted(evidence_dir.glob("*.json")):
        evidence = json.loads(path.read_text())
        beneficiary = evidence.get("beneficiary")
        beneficiary_bic = (
            beneficiary.get("bic") if isinstance(beneficiary, dict) else None
        ) or evidence.get("beneficiary_bic")
        routes = evidence.get("routes")
        if not beneficiary_bic or not isinstance(routes, list):
            continue

        route_keys = [
            (bic11(beneficiary_bic), route["currency"].upper(), bic11(route["int_bic"]))
            for route in routes
        ]
        assert len(route_keys) == len(set(route_keys)), path.name
        assert set(route_keys) <= seeded_keys, path.name

        for section_name, count_name in (
            ("source_snapshot", "route_count"),
            ("source_snapshot", "new_route_count"),
            ("scope", "included_route_count"),
            ("scope", "new_route_count"),
        ):
            section = evidence.get(section_name)
            if isinstance(section, dict) and count_name in section:
                assert section[count_name] == len(routes), (
                    path.name,
                    section_name,
                    count_name,
                )
        checked_files.append(path.name)

    assert len(checked_files) == 118


def test_wave69_evidence_count_matches_both_split_seed_ledgers():
    def bic11(value):
        normalized = value.upper()
        return f"{normalized}XXX" if len(normalized) == 8 else normalized

    evidence = json.loads(
        (
            ROOT
            / "scripts"
            / "ssi-autopilot"
            / "evidence"
            / "ssi-wave69-tacbtwtpxxx-2022-11-17.json"
        ).read_text()
    )
    evidence_keys = {
        (route["currency"].upper(), bic11(route["int_bic"]))
        for route in evidence["routes"]
    }
    seeded_keys = {
        (row[2].upper(), bic11(row[3]))
        for row in _batch_records(5)
        if row[0] == evidence["beneficiary"]["bic"]
    }

    assert evidence["source_snapshot"]["route_count"] == len(evidence["routes"])
    assert len(evidence_keys) == len(evidence["routes"]) == len(seeded_keys)
    assert evidence_keys == seeded_keys


def test_fifth_consolidation_batch_is_loaded_and_fails_closed():
    records = _batch_records(5)

    assert len(records) == 209
    assert not _is_canonical_bic11("FC1BBBBBXXX")
    assert all(_is_canonical_bic11(row[0]) and _is_canonical_bic11(row[3]) for row in records)
    assert all(row[5:9] == [None, None, None, None] for row in records)
    assert all(row[11] == "unverified" for row in records)
    assert all(row[13] is True and row[14] is False for row in records)
    assert all(not _is_routable_ssi(_row_to_ssi(row)) for row in records)


def test_fifth_consolidation_batch_has_exact_evidence_parity():
    def bic11(value):
        normalized = value.upper()
        return f"{normalized}XXX" if len(normalized) == 8 else normalized

    seeded_by_beneficiary = {}
    for row in _batch_records(5):
        seeded_by_beneficiary.setdefault(row[0], set()).add((row[2], row[3]))

    evidence_by_beneficiary = {}
    evidence_dir = ROOT / "scripts" / "ssi-autopilot" / "evidence"
    batch_files = []
    for path in evidence_dir.glob("ssi-wave*.json"):
        wave = int(path.name.split("-", 2)[1].removeprefix("wave"))
        if not 69 <= wave <= 96:
            continue
        evidence = json.loads(path.read_text())
        beneficiary_bic = bic11(evidence["beneficiary"]["bic"])
        assert beneficiary_bic not in evidence_by_beneficiary, beneficiary_bic
        evidence_by_beneficiary[beneficiary_bic] = {
            (route["currency"].upper(), bic11(route["int_bic"]))
            for route in evidence["routes"]
        }
        batch_files.append(path.name)

    assert len(batch_files) == 27
    assert set(evidence_by_beneficiary) == set(seeded_by_beneficiary)
    assert evidence_by_beneficiary == seeded_by_beneficiary


def test_sixth_consolidation_batch_is_loaded_and_fails_closed():
    records = _batch_records(6)

    assert len(records) == 70
    assert all(_is_canonical_bic11(row[0]) and _is_canonical_bic11(row[3]) for row in records)
    assert all(row[5:9] == [None, None, None, None] for row in records)
    assert all(row[11] in {"unverified", "archived"} for row in records)
    assert all(row[12] is None and row[13] is True and row[14] is False for row in records)
    assert all(not _is_routable_ssi(_row_to_ssi(row)) for row in records)


def test_sixth_consolidation_batch_has_exact_evidence_parity():
    def bic11(value):
        normalized = value.upper()
        return f"{normalized}XXX" if len(normalized) == 8 else normalized

    seeded_by_beneficiary = {}
    for row in _batch_records(6):
        seeded_by_beneficiary.setdefault(row[0], Counter()).update([(row[2], row[3])])

    evidence_by_beneficiary = {}
    evidence_banks = set()
    evidence_dir = ROOT / "scripts" / "ssi-autopilot" / "evidence"
    batch_files = []
    for path in evidence_dir.glob("ssi-wave*.json"):
        wave = int(path.name.split("-", 2)[1].removeprefix("wave"))
        if not 97 <= wave <= 101:
            continue
        evidence = json.loads(path.read_text())
        beneficiary_bic = bic11(evidence["beneficiary"]["bic"])
        assert beneficiary_bic not in evidence_by_beneficiary, beneficiary_bic
        route_keys = [
            (route["currency"].upper(), bic11(route["int_bic"]))
            for route in evidence["routes"]
        ]
        assert evidence["source_snapshot"]["route_count"] == len(route_keys)
        assert len(route_keys) == len(set(route_keys))
        evidence_by_beneficiary[beneficiary_bic] = Counter(route_keys)
        evidence_banks.add(beneficiary_bic)
        batch_files.append(path.name)

    manifest_banks = {
        bank[0] for payload in _batch_payloads(6) for bank in payload["banks"]
    }
    assert len(batch_files) == 5
    assert manifest_banks == evidence_banks == set(seeded_by_beneficiary)
    assert evidence_by_beneficiary == seeded_by_beneficiary


def test_seventh_consolidation_batch_is_loaded_and_fails_closed():
    records = _batch_records(7)

    assert len(records) == 80
    assert all(_is_canonical_bic11(row[0]) and _is_canonical_bic11(row[3]) for row in records)
    assert all(row[5:9] == [None, None, None, None] for row in records)
    assert all(row[11] == "unverified" for row in records)
    assert all(row[12] is None and row[13] is True and row[14] is False for row in records)
    assert all(not _is_routable_ssi(_row_to_ssi(row)) for row in records)


def test_seventh_consolidation_batch_has_exact_evidence_parity():
    def bic11(value):
        normalized = value.upper()
        return f"{normalized}XXX" if len(normalized) == 8 else normalized

    approved_aliases = {
        source: bic11(target) for source, target in SEED_BIC_ALIASES.items()
    }

    seeded_by_beneficiary = {}
    for row in _batch_records(7):
        seeded_by_beneficiary.setdefault(row[0], Counter()).update([(row[2], row[3])])

    evidence_by_beneficiary = {}
    evidence_dir = ROOT / "scripts" / "ssi-autopilot" / "evidence"
    batch_files = []
    for path in evidence_dir.glob("ssi-wave*.json"):
        wave = int(path.name.split("-", 2)[1].removeprefix("wave"))
        if not 102 <= wave <= 109:
            continue
        evidence = json.loads(path.read_text())
        beneficiary_bic = bic11(evidence["beneficiary"]["bic"])
        assert beneficiary_bic not in evidence_by_beneficiary, beneficiary_bic
        assert evidence["source_urls"][0] == evidence["source"]
        assert evidence["as_of"]
        route_keys = [
            (route["currency"].upper(), bic11(route["int_bic"]))
            for route in evidence["routes"]
        ]
        assert evidence["source_snapshot"]["route_count"] == len(route_keys)
        assert len(route_keys) == len(set(route_keys))
        aliases = evidence["source_snapshot"].get("bic_aliases", {})
        assert all(approved_aliases.get(source) == target for source, target in aliases.items())
        for excluded in evidence["source_snapshot"].get("excluded_routes", []):
            excluded_key = (excluded["currency"].upper(), bic11(excluded["printed_bic"]))
            assert excluded_key not in route_keys
            assert "independently verified alias" in excluded["reason"]
        evidence_by_beneficiary[beneficiary_bic] = Counter(route_keys)
        batch_files.append(path.name)

        seeded_rows = [row for row in _batch_records(7) if row[0] == beneficiary_bic]
        citation = f"Source: {evidence['source']} (as of {evidence['as_of']})."
        assert seeded_rows
        assert all(row[9].startswith(citation) for row in seeded_rows)
        for route in evidence["routes"]:
            printed_bic = route.get("printed_bic")
            if printed_bic and len(printed_bic.replace(" ", "")) == 11:
                assert aliases.get(printed_bic) == route["int_bic"]
                assert approved_aliases.get(printed_bic) == route["int_bic"]

    manifest_banks = {
        bank[0] for payload in _batch_payloads(7) for bank in payload["banks"]
    }
    assert len(batch_files) == 8
    assert manifest_banks <= evidence_by_beneficiary.keys()
    assert evidence_by_beneficiary.keys() == seeded_by_beneficiary.keys()
    assert seeded_by_beneficiary.keys() <= {bic11(bank[0]) for bank in BANKS}
    assert evidence_by_beneficiary == seeded_by_beneficiary


def test_wave102_has_a_reproducible_source_extract_and_bic_cross_check():
    def bic11(value):
        normalized = value.upper()
        return f"{normalized}XXX" if len(normalized) == 8 else normalized

    evidence = json.loads(
        (
            ROOT
            / "scripts"
            / "ssi-autopilot"
            / "evidence"
            / "ssi-wave102-dbsssgsgxxx-2026-09-19.json"
        ).read_text()
    )
    fixture_path = ROOT / "tests" / "fixtures" / "ssi_wave102_dbs_agent_bank_extract.json"
    fixture = json.loads(fixture_path.read_text())
    assert evidence["source_snapshot"]["source_extract_fixture"] == str(
        fixture_path.relative_to(ROOT)
    )
    assert evidence["source_snapshot"]["bic_verification"]["fixture"] == str(
        fixture_path.relative_to(ROOT)
    )
    assert fixture["source"] == evidence["source"]
    assert fixture["as_of"] == evidence["as_of"]
    digest = hashlib.sha256(
        json.dumps(fixture["rows"], sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()
    assert fixture["source_route_digest"] == digest
    assert evidence["source_snapshot"]["source_route_digest"] == digest
    source_rows = [(currency, bic11(bic)) for currency, bic in fixture["rows"]]
    evidence_rows = [
        (
            route["currency"].upper(),
            bic11(route.get("printed_bic") or route["int_bic"]),
        )
        for route in evidence["routes"]
    ]
    assert source_rows == evidence_rows
    assert all(
        bic11(printed) == canonical
        for (currency, printed), (_, canonical) in zip(source_rows, evidence_rows)
    )
    assert fixture["bic_verification"]["operational_status"] == "unverified_non_routable"


def test_seventh_consolidation_waves_have_source_and_bic_attestations():
    def bic11(value):
        normalized = value.upper()
        return f"{normalized}XXX" if len(normalized) == 8 else normalized

    evidence_paths = [
        next(
            (ROOT / "scripts" / "ssi-autopilot" / "evidence").glob(
                f"ssi-wave{wave}-*.json"
            )
        )
        for wave in range(102, 110)
    ]
    assert len(evidence_paths) == 8

    for evidence_path in evidence_paths:
        evidence = json.loads(evidence_path.read_text())
        snapshot = evidence["source_snapshot"]
        fixture_path = ROOT / snapshot["source_extract_fixture"]
        fixture = json.loads(fixture_path.read_text())
        source_rows = fixture["source_extract"]["rows"]

        assert fixture["wave"] == int(evidence_path.name.split("-", 2)[1].removeprefix("wave"))
        assert fixture["beneficiary_bic"] == evidence["beneficiary"]["bic"]
        assert fixture["source"] == evidence["source"]
        assert fixture["as_of"] == evidence["as_of"]
        assert fixture["source_extract"]["account_values_removed"] is True

        expected_source_rows = [
            {
                "currency": route["currency"].upper(),
                "bic": route.get("printed_bic") or route["int_bic"],
                "correspondent": route["correspondent"],
                **(
                    {"printed_currency": route["printed_currency"]}
                    if route.get("printed_currency")
                    else {}
                ),
            }
            for route in evidence["routes"]
        ]
        expected_source_rows.extend(
            {
                "currency": excluded["currency"].upper(),
                "bic": excluded["printed_bic"],
                "correspondent": excluded["correspondent"],
                "excluded": True,
            }
            for excluded in snapshot.get("excluded_routes", [])
        )
        assert source_rows == expected_source_rows

        digest_field = (
            "source_extract_digest"
            if "source_extract_digest" in fixture
            else "source_route_digest"
        )
        digest = hashlib.sha256(
            json.dumps(source_rows, sort_keys=True, separators=(",", ":")).encode()
        ).hexdigest()
        assert fixture[digest_field] == digest
        assert snapshot[digest_field] == digest

        verification = fixture["independent_bic_verification"]
        assert verification["reference"] == snapshot["bic_verification"]["reference"]
        assert verification["reference_as_of"] == snapshot["bic_verification"]["reference_as_of"]
        assert verification["operational_status"] == "unverified_non_routable"
        assert [
            (row["source_bic"], row["canonical_bic"])
            for row in verification["rows"]
        ] == [(row["bic"], bic11(row["bic"])) for row in source_rows]
        assert all(
            row["canonical_bic"] == bic11(row["source_bic"])
            for row in verification["rows"]
        )

        directory_path = ROOT / snapshot["bic_verification"]["directory_extract_fixture"]
        directory = json.loads(directory_path.read_text())
        directory_rows = directory["rows"]
        directory_digest = hashlib.sha256(
            json.dumps(directory_rows, sort_keys=True, separators=(",", ":")).encode()
        ).hexdigest()
        assert directory["reference"] == verification["reference"]
        assert directory["reference_as_of"] == verification["reference_as_of"]
        assert directory["artifact_sha256"] == directory_digest
        directory_keys = {
            (row["source_bic"], row["canonical_bic"]) for row in directory_rows
        }
        assert {
            (row["source_bic"], row["canonical_bic"])
            for row in verification["rows"]
        } <= directory_keys


def test_wave109_evidence_links_its_attestation_artifacts():
    evidence = json.loads(
        (
            ROOT
            / "scripts"
            / "ssi-autopilot"
            / "evidence"
            / "ssi-wave109-tdomcatttor-2026-09-19.json"
        ).read_text()
    )
    snapshot = evidence["source_snapshot"]
    assert snapshot["source_extract_fixture"] == (
        "tests/fixtures/ssi_wave109_source_attestation.json"
    )
    assert snapshot["source_route_digest"] == snapshot["source_extract_digest"]
    assert snapshot["bic_verification"]["fixture"] == snapshot["source_extract_fixture"]
    assert snapshot["bic_verification"]["directory_extract_fixture"] == (
        "tests/fixtures/ssi_swift_bic_directory_extract.json"
    )


def test_fourth_consolidation_batch_is_loaded_and_fails_closed():
    records = _batch_records(4)
    assert len(records) == 123
    assert all(not _is_routable_ssi(_row_to_ssi(row)) for row in records)

    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
        future=True,
    )
    Base.metadata.create_all(bind=engine)
    db_session_clean = sessionmaker(bind=engine, future=True)()
    seed_if_empty(db_session_clean)
    for beneficiary_bic, currency in {(row[0], row[2]) for row in records}:
        new_bics = {row[3] for row in records if row[0] == beneficiary_bic and row[2] == currency}
        persisted = (
            db_session_clean.query(SSI)
            .filter(
                SSI.beneficiary_bic == beneficiary_bic,
                SSI.currency == currency,
                SSI.intermediary_bic.in_(new_bics),
            )
            .all()
        )
        assert {row.intermediary_bic for row in persisted} == new_bics
        assert all(not _is_routable_ssi(row) for row in persisted)
        selected = suggest_from_ssi(db_session_clean, beneficiary_bic, currency, None)
        assert new_bics.isdisjoint(suggestion.bic for suggestion in selected)
    db_session_clean.close()
    engine.dispose()


def test_existing_database_is_idempotently_backfilled_with_the_fourth_batch():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
        future=True,
    )
    Base.metadata.create_all(bind=engine)
    db_session = sessionmaker(bind=engine, future=True)()
    existing_bic = BANKS[0][0]
    db_session.add(
        Bank(
            bic=existing_bic,
            bank_name="Operator-maintained bank name",
            country_code="ZZ",
            city="Operator-maintained city",
            country_currency="USD",
        )
    )
    prior_catalog_row = _row_to_ssi(_batch_records(1)[0])
    corrected_source_row = next(row for row in _batch_records(4) if not row[13])
    corrected_route = _row_to_ssi(corrected_source_row)
    corrected_route.intermediary_bank_name = "Operator-corrected intermediary name"
    corrected_route.intermediary_account = "REAL-INTERMEDIARY-ACCOUNT"
    corrected_route.beneficiary_account = "REAL-BENEFICIARY-ACCOUNT"
    db_session.add(prior_catalog_row)
    db_session.add(corrected_route)
    db_session.commit()
    assert db_session.query(SSI).count() == 2

    first_result = seed_if_empty(db_session)
    final_keys = {(row[0], row[2], row[3]) for row in _batch_records(4)}
    persisted_keys = {
        (row.beneficiary_bic, row.currency, row.intermediary_bic)
        for row in db_session.query(SSI).all()
        if (row.beneficiary_bic, row.currency, row.intermediary_bic) in final_keys
    }
    second_result = seed_if_empty(db_session)

    assert first_result["ssi"] >= len(final_keys)
    assert persisted_keys == final_keys
    assert second_result["ssi"] == 0
    persisted_correction = (
        db_session.query(SSI)
        .filter(
            SSI.beneficiary_bic == corrected_route.beneficiary_bic,
            SSI.currency == corrected_route.currency,
            SSI.intermediary_bic == corrected_route.intermediary_bic,
        )
        .one()
    )
    assert persisted_correction.intermediary_bank_name == ("Operator-corrected intermediary name")
    assert persisted_correction.intermediary_account == "REAL-INTERMEDIARY-ACCOUNT"
    assert persisted_correction.beneficiary_account == "REAL-BENEFICIARY-ACCOUNT"
    assert db_session.query(Bank).filter(Bank.bic == existing_bic).one().bank_name == (
        "Operator-maintained bank name"
    )
    db_session.close()
    engine.dispose()


def test_masked_account_comments_are_resolved_in_the_final_batch():
    final = _batch_records(4)
    assert not any(row[0] == "EBILAEADXXX" for row in final)

    axis = [row for row in final if row[0] == "AXISINBBXXX"]
    assert axis
    assert all(row[5:9] == [None, None, None, None] for row in axis)
    assert all(row[13] is True and row[14] is False for row in axis)
