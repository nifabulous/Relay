"""Small, reviewable proof of the SSI data and routing contract.

The generated regional tests exercise the same rules at scale.  These focused
checks keep the security-critical invariants visible in a bounded diff so a
review can verify them even when GitHub truncates the large seed/manifest
patches.
"""

import json
import re
from collections import defaultdict
from pathlib import Path

from app.models import SSI
from app.services.routing import _is_routable_ssi, suggest_from_ssi
from app.services.seed import SSI_RECORDS

_MANIFEST_PATH = (
    Path(__file__).resolve().parents[1]
    / "scripts"
    / "ssi-autopilot"
    / "regions.json"
)


def _bic11(value):
    value = value.strip().upper()
    return value if len(value) == 11 else value + "XXX"


def _manifest_contract():
    manifest = json.loads(_MANIFEST_PATH.read_text(encoding="utf-8"))
    expected = {}
    for region in manifest["regions"]:
        for bank in region["banks"]:
            if not bank.get("seedable", True):
                continue
            beneficiary_bic = bank["bic8"] + "XXX"
            for record in bank.get("admitted_records") or []:
                key = (
                    beneficiary_bic,
                    record["currency"].upper(),
                    _bic11(record["int_bic"]),
                )
                assert key not in expected, f"duplicate manifest key: {key}"
                expected[key] = (region, bank, record)
    return manifest, expected


def _seed_index():
    rows = defaultdict(list)
    for row in SSI_RECORDS:
        rows[(row[0], row[2].upper(), _bic11(row[3]))].append(row)
    return rows


def _canonical_note(record):
    citation = f"Source: {record['source']} (as of {record['as_of']})"
    if record["bic_only"]:
        citation += (
            " BIC-level list — no account numbers published; "
            "not a selectable settlement instruction"
        )
    return (
        f"{citation}. Sourced from bank-published SSI page. "
        "Verify current values before use."
    )


def _row_object(row):
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


def test_manifest_admitted_records_have_exact_seed_parity():
    """Every admitted manifest record is present once with every field intact."""
    manifest, expected = _manifest_contract()
    seed = _seed_index()
    defaults = manifest["defaults"]

    assert expected
    for key, (region, bank, record) in expected.items():
        matches = seed[key]
        assert len(matches) == 1, f"seed rows for {key}: {len(matches)}"
        row = matches[0]
        assert row[1] == bank["name"]
        assert row[4] == record["correspondent"]
        assert row[9] == _canonical_note(record)
        assert row[10] == record["as_of"]
        assert row[11] == record["status"].lower()
        assert row[11] in {"unverified", "archived"}
        assert (row[13] if len(row) > 13 else False) is record["bic_only"]
        assert (row[14] if len(row) > 14 else False) is record.get("terms_inferred", False)
        assert row[0][:8] not in {
            value.strip().upper()[:8] for value in region.get("forbidden_bics", [])
        }

        if record["bic_only"]:
            assert row[5:9] == (None, None, None, None)
            continue

        mask_prefix = str(region["masked_block"])[:-2]
        mask = re.compile(rf"^ACCT-{re.escape(mask_prefix)}\d\d$")
        legacy = set(region.get("legacy_accounts", []))
        assert row[5] == record["nostro"]
        assert row[6] == record["with_an"]
        assert mask.fullmatch(row[5]) or row[5] in legacy
        assert mask.fullmatch(row[6]) or row[6] in legacy
        assert row[7] == record["charge_code"].upper()
        assert row[8] == record["value_date"]
        assert row[7] in defaults["charge_codes"]
        assert row[8] in defaults["value_dates"]


def test_admitted_rows_are_not_routable_until_reverified():
    """Seeded snapshots stay informational, even if a caller tries to use them."""
    _, expected = _manifest_contract()
    seed = _seed_index()
    for key in expected:
        row = seed[key][0]
        assert row[11] != "published"
        assert not _is_routable_ssi(_row_object(row)), key


def test_published_status_is_required_for_an_explicit_settlement_instruction():
    """Status is an independent gate, not an accidental side effect of masking."""
    row = SSI(
        beneficiary_bic="STATEMENTUS",
        currency="USD",
        intermediary_bic="CITIUS33XXX",
        intermediary_bank_name="Citibank New York",
        intermediary_account="123456789",
        beneficiary_account="987654321",
        charge_code="SHA",
        value_date="spot",
        notes="Source: contract test.",
        as_of="2026-09-07",
        verified_by="Treasury Operations",
        status="unverified",
    )
    assert not _is_routable_ssi(row)
    row.status = "published"
    assert _is_routable_ssi(row)


def test_routable_predicate_rejects_masked_accounts_directly():
    """A direct predicate caller cannot promote a redacted account row."""
    row = SSI(
        beneficiary_bic="MASKUS33XXX",
        currency="USD",
        intermediary_bic="CITIUS33XXX",
        intermediary_bank_name="Citibank New York",
        intermediary_account="123456789",
        beneficiary_account="987654321",
        charge_code="SHA",
        value_date="spot",
        notes="Source: contract test.",
        as_of="2026-09-07",
        verified_by="Treasury Operations",
        status="published",
    )
    assert _is_routable_ssi(row)
    for field in ("intermediary_account", "beneficiary_account"):
        for masked in ("ACCT-91004901", "1234XX78", "[REDACTED]"):
            setattr(row, field, masked)
            assert not _is_routable_ssi(row), (field, masked)
            setattr(row, field, "123456789")


def test_masked_bic_only_and_multi_hop_rows_cannot_enter_settlement_path(db_session_clean):
    """The end-to-end SSI selector accepts only complete, explicit instructions."""
    rows = [
        SSI(
            beneficiary_bic="MASKUS33XXX",
            currency="USD",
            intermediary_bic="CITIUS33XXX",
            intermediary_bank_name="Citibank New York",
            intermediary_account="ACCT-99990101",
            beneficiary_account="ACCT-99990101",
            charge_code="SHA",
            value_date="spot",
            notes="Source: contract test.",
            as_of="2026-09-07",
            verified_by="Treasury Operations",
            status="published",
        ),
        SSI(
            beneficiary_bic="MULTUS33XXX",
            currency="USD",
            intermediary_bic="CITIUS33XXX",
            intermediary_bank_name="Citibank New York via another clearer",
            intermediary_account="123456789",
            beneficiary_account="987654321",
            charge_code="SHA",
            value_date="spot",
            notes="Source: contract test.",
            as_of="2026-09-07",
            verified_by="Treasury Operations",
            status="published",
        ),
        SSI(
            beneficiary_bic="GOODUS33XXX",
            currency="USD",
            intermediary_bic="CITIUS33XXX",
            intermediary_bank_name="Citibank New York",
            intermediary_account="123456789",
            beneficiary_account="987654321",
            charge_code="SHA",
            value_date="spot",
            notes="Source: contract test.",
            as_of="2026-09-07",
            verified_by="Treasury Operations",
            status="published",
        ),
    ]
    db_session_clean.add_all(rows)
    db_session_clean.commit()

    assert suggest_from_ssi(db_session_clean, "MASKUS33XXX", "USD", "US") == []
    assert suggest_from_ssi(db_session_clean, "MULTUS33XXX", "USD", "US") == []
    suggestions = suggest_from_ssi(db_session_clean, "GOODUS33XXX", "USD", "US")
    assert [suggestion.bic for suggestion in suggestions] == ["CITIUS33XXX"]


def test_manifest_exclusions_and_extra_rows_are_fail_closed():
    """Unlisted legacy rows and forbidden identities cannot become routes."""
    manifest, expected = _manifest_contract()
    seed = _seed_index()

    forbidden = {
        bic.strip().upper()[:8]
        for region in manifest["regions"]
        for bic in region.get("forbidden_bics", [])
    }
    assert not {
        row[0][:8] for row in SSI_RECORDS if row[0][:8] in forbidden
    }

    for region in manifest["regions"]:
        banks = [
            bank
            for bank in region["banks"]
            if bank.get("seedable", True) and bank.get("admitted_records")
        ]
        if not banks:
            continue
        beneficiary_bics = {bank["bic8"] + "XXX" for bank in banks}
        admitted_keys = {
            key for key in expected if key[0] in beneficiary_bics
        }
        for key, rows in seed.items():
            if key[0] not in beneficiary_bics or key in admitted_keys:
                continue
            assert all(
                not _is_routable_ssi(_row_object(row)) for row in rows
            ), (region["name"], key)


def test_asia_pacific_wave4_has_exact_manifest_admitted_keys():
    """The 215-row Asia-Pacific expansion has no unlisted seed identities."""
    manifest, expected = _manifest_contract()
    seed = _seed_index()
    region = next(
        region
        for region in manifest["regions"]
        if region["name"] == "asia-pacific-wave4"
    )
    beneficiary_bics = {
        bank["bic8"] + "XXX"
        for bank in region["banks"]
        if bank.get("seedable", True) and bank.get("admitted_records")
    }
    expected_keys = {key for key in expected if key[0] in beneficiary_bics}
    actual_keys = {key for key in seed if key[0] in beneficiary_bics}
    assert len(expected_keys) == 215
    assert actual_keys == expected_keys
    assert all(
        not _is_routable_ssi(_row_object(seed[key][0])) for key in actual_keys
    )


def test_europe_uncovered_wave4_has_exact_admitted_keys_and_no_self_hops():
    """The 323-row Europe expansion preserves its exclusion semantics."""
    manifest, expected = _manifest_contract()
    seed = _seed_index()
    region = next(
        region
        for region in manifest["regions"]
        if region["name"] == "europe-uncovered-wave4"
    )
    beneficiary_bics = {
        bank["bic8"] + "XXX"
        for bank in region["banks"]
        if bank.get("seedable", True) and bank.get("admitted_records")
    }
    expected_keys = {key for key in expected if key[0] in beneficiary_bics}
    actual_keys = {key for key in seed if key[0] in beneficiary_bics}
    assert len(expected_keys) == 323
    assert actual_keys == expected_keys
    assert all(key[0][:8] != key[2][:8] for key in actual_keys)
    assert all(
        not _is_routable_ssi(_row_object(seed[key][0])) for key in actual_keys
    )


def test_wave4_seed_rows_stay_out_of_ssi_settlement_selection(db_session_clean):
    """BIC-only and inferred wave-4 rows cannot reach the DB selector."""
    seed = _seed_index()
    targets = (
        ("CABARS22XXX", "EUR", "RS"),
        ("EMPOALTRXXX", "USD", "AL"),
        ("BSAHBJBJXXX", "USD", "BJ"),
    )
    query_targets = []
    for index, (beneficiary_bic, currency, country) in enumerate(targets):
        rows = [
            row
            for key, values in seed.items()
            if key[:2] == (beneficiary_bic, currency)
            for row in values
        ]
        assert rows
        model = _row_object(rows[0])
        model.beneficiary_bic = f"W4TEST{index:02d}XXX"
        db_session_clean.add(model)
        query_targets.append((model.beneficiary_bic, currency, country))
    db_session_clean.commit()

    for beneficiary_bic, currency, country in query_targets:
        assert suggest_from_ssi(
            db_session_clean, beneficiary_bic, currency, country
        ) == []


def test_wave5_routable_rows_require_two_unmasked_accounts():
    """Published metadata cannot make either redacted account executable."""
    row = SSI(
        beneficiary_bic="W5TEST00XXX",
        currency="USD",
        intermediary_bic="CITIUS33XXX",
        intermediary_bank_name="Citibank New York",
        intermediary_account="123456789",
        beneficiary_account="987654321",
        charge_code="SHA",
        value_date="spot",
        notes="Source: contract test.",
        as_of="2026-09-07",
        verified_by="Treasury Operations",
        status="published",
    )
    assert _is_routable_ssi(row)
    row.intermediary_account = "ACCT-91004601"
    assert not _is_routable_ssi(row)
    row.intermediary_account = "123456789"
    row.beneficiary_account = "[REDACTED]"
    assert not _is_routable_ssi(row)
