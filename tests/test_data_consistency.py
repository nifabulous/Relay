"""
Cross-source consistency for correspondent data.

Correspondent truth lives in three places that are edited independently:

  1. CORRIDOR_RULES        — heuristic intermediary suggestions
  2. SSI_RECORDS           — bank-published settlement instructions
  3. SETTLEMENT_DIRECTORY  — CHIPS participant numbers + ABA routing numbers

Nothing structural forces them to agree, and drift between them teaches
learners contradictions (the pre-fix example: corridor rules routing USD
through Standard Chartered's LONDON BIC while the SSI data correctly used
SCB New York). These tests pin the invariants.

Invariant: any US-located bank (BIC positions 5-6 == "US") named as a USD
intermediary — in a USD corridor rule or a USD SSI record — must either
carry settlement identifiers in the directory or sit in the explicit
exemption list below. Exemptions are for banks whose CHIPS/ABA identifiers
have not been verified yet: verify and PROMOTE them to the directory rather
than letting the list grow.
"""

import json
import re
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.data.settlement_directory import SETTLEMENT_DIRECTORY, get_settlement_ids
from app.db import Base
from app.models import SSI, Bank, CorridorRule
from app.services.seed import BANKS, CORRIDOR_RULES, SSI_RECORDS


_SSI_MANIFEST_PATH = (
    Path(__file__).resolve().parents[1]
    / "scripts"
    / "ssi-autopilot"
    / "regions.json"
)


def _load_ssi_manifest():
    """Load the committed admission ledger used by the generated checks."""
    return json.loads(_SSI_MANIFEST_PATH.read_text(encoding="utf-8"))


def _manifest_region(region_name):
    for region in _load_ssi_manifest()["regions"]:
        if region["name"] == region_name:
            return region
    raise AssertionError(f"SSI region {region_name!r} is missing from the manifest")


def _canonical_ssi_bic(value):
    value = value.strip().upper()
    return value if len(value) == 11 else value + "XXX"


def _manifest_seedable_coverage(region_name):
    """Return the seedable bank contract straight from regions.json."""
    region = _manifest_region(region_name)
    return {
        bank["bic8"] + "XXX": (bank["name"], set(bank["currencies"]))
        for bank in region["banks"]
        if bank.get("seedable", True)
    }


def _canonical_ssi_note(record):
    citation = f"Source: {record['source']} (as of {record['as_of']})"
    if record.get("bic_only") is True:
        citation += (
            " BIC-level list — no account numbers published; "
            "not a selectable settlement instruction"
        )
    return (
        f"{citation}. Sourced from bank-published SSI page. "
        "Verify current values before use."
    )


def _assert_manifest_region_records(region_name, ssi_records, banks):
    """Check every admitted record field, not only aggregate currency counts.

    Banks without ``admitted_records`` are pre-existing directory coverage and
    are intentionally not treated as newly folded rows.  For admitted banks,
    this contract checks the exact canonical key, correspondent, masked
    accounts, settlement terms, provenance, BIC-only semantics, and inferred
    terms flag.  It also derives forbidden BICs and account reservations from
    the manifest, so a generated test cannot accidentally apply one bank's
    policy to another bank in the same region.
    """
    region = _manifest_region(region_name)
    seedable = [
        bank for bank in region["banks"] if bank.get("seedable", True)
    ]
    expected_bics = {bank["bic8"] + "XXX" for bank in seedable}
    rows = [row for row in ssi_records if row[0] in expected_bics]
    row_by_key = {}
    duplicates = []
    for row in rows:
        key = (row[0], row[2], _canonical_ssi_bic(row[3]))
        if key in row_by_key:
            duplicates.append(key)
        row_by_key[key] = row
    assert not duplicates, f"{region_name}: duplicate SSI keys: {duplicates}"

    block = str(region["masked_block"])
    mask = re.compile(rf"^ACCT-{block[:-2]}\d\d$")
    legacy = set(region.get("legacy_accounts", []))
    forbidden = {bic.strip().upper()[:8] for bic in region.get("forbidden_bics", [])}
    defaults = _load_ssi_manifest()["defaults"]
    allowed_charge = set(defaults.get("charge_codes", ()))
    allowed_value = set(defaults.get("value_dates", ()))

    checked = 0
    for bank in seedable:
        admitted = bank.get("admitted_records") or []
        if not admitted:
            continue
        bank_bic = bank["bic8"] + "XXX"
        for record in admitted:
            currency = record["currency"].strip().upper()
            intermediary = _canonical_ssi_bic(record["int_bic"])
            key = (bank_bic, currency, intermediary)
            row = row_by_key.get(key)
            assert row is not None, (
                f"{region_name}: admitted record {key} is missing from SSI_RECORDS"
            )
            assert row[1] == bank["name"], key
            assert row[2] == currency, key
            assert _canonical_ssi_bic(row[3]) == intermediary, key
            assert row[4] == record["correspondent"], key
            assert row[9] == _canonical_ssi_note(record), key
            assert row[10] == record["as_of"], key
            expected_status = record["status"].strip().lower()
            # Newly folded source rows may be unverified or explicitly
            # archived, but never silently promoted to a live claim.
            assert expected_status in {"unverified", "archived"}, key
            assert row[11] == expected_status, key
            expected_verifier = record.get("verified_by")
            actual_verifier = row[12] if len(row) > 12 else None
            assert actual_verifier == expected_verifier, key
            bic_only = record.get("bic_only") is True
            actual_bic_only = row[13] if len(row) > 13 else False
            assert isinstance(actual_bic_only, bool) and actual_bic_only is bic_only, key
            inferred = record.get("terms_inferred", False)
            actual_inferred = row[14] if len(row) > 14 else False
            assert isinstance(actual_inferred, bool) and actual_inferred is inferred, key
            assert row[0][:8] not in forbidden, key
            if bic_only:
                assert row[5] is None and row[6] is None, key
                assert row[7] is None and row[8] is None, key
            else:
                assert row[5] == record["nostro"], key
                assert row[6] == record["with_an"], key
                assert mask.fullmatch(row[5]) or row[5] in legacy, key
                assert mask.fullmatch(row[6]) or row[6] in legacy, key
                assert row[7] == record["charge_code"].strip().upper(), key
                assert row[8] == record["value_date"], key
                assert row[7] in allowed_charge, key
                assert row[8] in allowed_value, key
            checked += 1
    assert checked == sum(
        len(bank.get("admitted_records") or []) for bank in seedable
    ), f"{region_name}: record-level manifest validation checked {checked} rows"

# US-located USD intermediaries whose CHIPS/ABA identifiers are not yet
# verified against public sources. Do NOT add entries here to silence a
# failure for a major clearer — verify the identifiers and add them to
# SETTLEMENT_DIRECTORY instead.
UNVERIFIED_US_CLEARERS = {
    "BOMLUS33",  # Mashreqbank NY
    "BOTKUS33",  # MUFG Bank Ltd New York
    "SBICUS44",  # Standard Bank (NY)
    "SBINUS33",  # SBI New York
    "SMBCUS33",  # SMBC New York
    "USBKUS44",  # U.S. Bank National Association
    # Bank of Baroda New York (BoB's published USD SSI). Verified against The
    # Clearing House participant list: Baroda is NOT a CHIPS participant and
    # publishes no Fedwire routing number for this branch — the directory
    # holds no identifiers for it. The old entry borrowed BofA's CHIPS/ABA.
    "BARBUS33",
    # BOCHK's published USD SSI routes through Bank of China New York — a
    # legitimate US clearer. Verify its CHIPS/ABA and promote to
    # SETTLEMENT_DIRECTORY before removing.
    "BKCHUS33",
    # Société Générale New York (Coris/Orabank published USD SSIs) — a
    # legitimate US clearer; CHIPS/ABA not verifiable from a public source
    # right now. Verify and promote to SETTLEMENT_DIRECTORY before removing.
    "SOGEUS33",
    # Wells Fargo Bank New York under the legacy PNBPUS33 BIC (Banorte's
    # published USD SSI). Wells Fargo's primary BIC is WFBIUS6S; CHIPS/ABA
    # for this legacy identifier are not verifiable from a public source.
    # Verify and promote to SETTLEMENT_DIRECTORY before removing.
    "PNBPUS33",
    # American Express Bank (ComBank Ceylon's published USD SSI). CHIPS/ABA
    # not verifiable from the source. Verify and promote to
    # SETTLEMENT_DIRECTORY before removing.
    "AEIBUS33",
}


def _is_us_bic(bic: str) -> bool:
    return len(bic) >= 6 and bic[4:6] == "US"


def _known_or_exempt(bic: str) -> bool:
    prefix = bic[:8]
    return prefix in SETTLEMENT_DIRECTORY or prefix in UNVERIFIED_US_CLEARERS


class TestUsdCorridorRulesMatchSettlementDirectory:
    def test_us_intermediaries_on_usd_corridors_are_catalogued(self):
        missing = set()
        for _ccy, _country, bic, name, corridor, _conf, _rank in CORRIDOR_RULES:
            if corridor.startswith("USD->") and _is_us_bic(bic) and not _known_or_exempt(bic):
                missing.add((bic, name))
        assert not missing, (
            f"US banks used as USD corridor intermediaries without settlement "
            f"identifiers (add to SETTLEMENT_DIRECTORY, or to the exemption "
            f"list with a comment if unverifiable): {sorted(missing)}"
        )

    def test_no_london_bic_clears_usd_corridors(self):
        """The pre-fix regression: SCB's London BIC on USD corridors."""
        offenders = [
            (bic, corridor)
            for _ccy, _country, bic, _name, corridor, _conf, _rank in CORRIDOR_RULES
            if corridor.startswith("USD->") and bic[4:6] == "GB"
        ]
        assert offenders == [], (
            f"GB-located BICs listed as USD corridor clearers: {offenders}"
        )


class TestUsdSSIRecordsMatchSettlementDirectory:
    def test_us_correspondents_in_usd_ssis_are_catalogued(self):
        missing = set()
        for record in SSI_RECORDS:
            _ben_bic, _ben_name, ccy, int_bic, int_name = record[:5]
            if ccy == "USD" and _is_us_bic(int_bic) and not _known_or_exempt(int_bic):
                missing.add((int_bic, int_name))
        assert not missing, (
            f"US correspondents in USD SSI records without settlement "
            f"identifiers: {sorted(missing)}"
        )


class TestSourcedSsiAccountsAreIrreversiblyMasked:
    """Published account numbers must not be recoverable from seed data."""

    def test_newly_sourced_account_numbers_are_not_copied_into_placeholders(self):
        published_numbers = {
            "36370468", "04406278", "400877401000", "1009569820000",
            "6964030011", "9030006364119", "18500817461626",
            "18500817461658", "18500817461666", "18500817461674",
            "18500817461682", "36320321", "36327523", "3582025130001",
            "36327566", "36328366", "655024", "65502401", "000100000",
            "0004717", "001094566",
        }
        leaked = [
            row[5]
            for row in SSI_RECORDS
            if row[5] is not None and row[5].removeprefix("ACCT-") in published_numbers
        ]
        assert leaked == [], (
            "Published Nostro account numbers must be replaced with synthetic "
            f"placeholders, not copied after an ACCT- prefix: {leaked}"
        )


class TestBdoUsdCorrespondentBic:
    def test_usd_instruction_uses_bank_of_americas_new_york_bic(self):
        usd_bics = {
            row[3] for row in SSI_RECORDS
            if row[0] == "BNORPHMMXXX" and row[2] == "USD"
        }
        assert "BOFAUS6SXXX" not in usd_bics
        assert "BOFAUS3NXXX" in usd_bics


class TestSettlementDirectoryShape:
    def test_every_entry_has_wellformed_identifiers(self):
        for prefix, ids in SETTLEMENT_DIRECTORY.items():
            assert len(prefix) == 8, f"{prefix}: keys are 8-char BIC prefixes"
            chips = ids.get("chips_uid")
            aba = ids.get("aba")
            assert chips or aba, f"{prefix}: entry carries no identifiers"
            if chips:
                assert len(chips) == 4 and chips.isdigit(), f"{prefix}: CHIPS UID {chips!r}"
            if aba:
                assert len(aba) == 9 and aba.isdigit(), f"{prefix}: ABA {aba!r}"

    def test_every_entry_names_its_bank(self):
        """`bank_name` keeps each directory entry self-describing."""
        for prefix, ids in SETTLEMENT_DIRECTORY.items():
            name = ids.get("bank_name")
            assert name and name.strip(), f"{prefix}: entry has no bank_name"

    def test_aba_checksums_are_valid(self):
        """ABA routing numbers carry a 3-7-1 weighted checksum — verify it."""
        for prefix, ids in SETTLEMENT_DIRECTORY.items():
            aba = ids.get("aba")
            if not aba:
                continue
            digits = [int(c) for c in aba]
            total = (
                3 * (digits[0] + digits[3] + digits[6])
                + 7 * (digits[1] + digits[4] + digits[7])
                + 1 * (digits[2] + digits[5] + digits[8])
            )
            assert total % 10 == 0, f"{prefix}: ABA {aba} fails the checksum"

    def test_exemption_list_stays_disjoint_from_directory(self):
        overlap = UNVERIFIED_US_CLEARERS & set(SETTLEMENT_DIRECTORY)
        assert not overlap, (
            f"Banks promoted to the directory must leave the exemption list: {sorted(overlap)}"
        )

    def test_lookup_normalizes_case_and_length(self):
        assert get_settlement_ids("citius33xxx") == SETTLEMENT_DIRECTORY["CITIUS33"]
        assert get_settlement_ids("CITIUS33") == SETTLEMENT_DIRECTORY["CITIUS33"]


class TestChipsUidsAreUniquePerInstitution:
    """CHIPS UIDs are institution-level identifiers — never copy them between
    directory entries. A shared UID with two bank names means one entry was
    copy-pasted from another (the pre-fix bug: SBCAUS6L borrowed BofA's 0959)."""

    def test_no_two_institutions_share_a_chips_uid(self):
        def institution(name):
            return re.sub(r"\(.*\)$", "", name).strip()

        by_uid = {}
        for prefix, ids in SETTLEMENT_DIRECTORY.items():
            chips = ids.get("chips_uid")
            if chips:
                by_uid.setdefault(chips, set()).add(institution(ids["bank_name"]))
        collisions = {uid: names for uid, names in by_uid.items() if len(names) > 1}
        assert not collisions, (
            f"CHIPS UIDs resolve to different institutions; verify before use: {collisions}"
        )

    def test_state_bank_of_india_uses_its_own_uid(self):
        # Verified against The Clearing House participant list (2026-04-13):
        # 0914 = State Bank of India. 0959 = Bank of America only.
        assert SETTLEMENT_DIRECTORY["SBCAUS6L"]["chips_uid"] == "0914"


# ---------------------------------------------------------------------------
# Africa SSI coverage expansion
# ---------------------------------------------------------------------------
#
# The training audience is African banking (Nigeria, Kenya, Ghana, South
# Africa, francophone West/Central Africa). SSI coverage must keep growing
# for that corridor set. These invariants pin the banks added from published
# sources — one tuple per beneficiary: BIC, name, currencies with seeded
# records (at-least semantics — more currencies are fine).
#
# Sourced from bank-published pages / archived copies:
#   - Bank of Kigali  — bk.rw correspondent-banks page
#   - Equity Bank KE  — equitygroupholdings.com SWIFT-transfer page (2020)
#   - UBA group       — "Nigeria SWIFT Codes" PDF family (archived 2021)
#   - MCB Mauritius   — mcb.mu correspondent-banking page (BICs, no accounts)
AFRICA_SSI_COVERAGE = [
    ("BKRWRWRWXXX", "Bank of Kigali", {"USD", "EUR", "GBP", "KES", "TZS", "UGX", "ZAR", "AED"}),
    ("EQBLKENAXXX", "Equity Bank", {"USD", "EUR", "GBP", "ZAR", "JPY", "CAD", "AUD", "CHF"}),
    ("UNAFNGLAXXX", "United Bank for Africa", {"USD", "EUR", "GBP"}),
    ("UNAFKENAXXX", "UBA Kenya", {"USD"}),
    ("UNAFUGKAXXX", "UBA Uganda", {"USD"}),
    ("UNAFSNDAXXX", "UBA Senegal", {"USD"}),
    ("UNAFTZTZXXX", "UBA Tanzania", {"USD"}),
    ("MCBLMUMUXXX", "MCB Group", {"USD", "EUR", "GBP", "ZAR", "JPY"}),
]


class TestAfricaSsiCoverage:
    def test_african_beneficiaries_have_seeded_ssi_records(self):
        seeded = {}
        for record in SSI_RECORDS:
            ben_bic = record[0]
            seeded.setdefault(ben_bic, set()).add(record[2])
        for bic, name, currencies in AFRICA_SSI_COVERAGE:
            have = seeded.get(bic, set())
            missing = currencies - have
            assert not missing, (
                f"{name} ({bic}) is missing seeded SSI records for: {sorted(missing)}"
            )

    def test_african_beneficiaries_are_in_the_bank_directory(self):
        bank_bics = {row[0] for row in BANKS}
        missing = [
            bic for bic, _name, _currencies in AFRICA_SSI_COVERAGE if bic not in bank_bics
        ]
        assert not missing, (
            f"African SSI beneficiaries must also be seeded in BANKS so Explore "
            f"can show their settlement instructions: {missing}"
        )

    def test_francophone_africa_has_usd_coverage(self):
        """The roadmap names francophone Africa as a training audience."""
        uba_senegal = [r for r in SSI_RECORDS if r[0] == "UNAFSNDAXXX"]
        assert any(r[2] == "USD" for r in uba_senegal), (
            "UBA Senegal (UNAFSNDA) must carry a USD SSI record"
        )


# ---------------------------------------------------------------------------
# Asia-Pacific SSI coverage expansion
# ---------------------------------------------------------------------------
#
# Same at-least semantics as the Africa block: one tuple per beneficiary —
# BIC, name, currencies that MUST have seeded records. Only banks with
# publicly published settlement instructions were included; ASEAN banks
# without published SSIs (Maybank, CIMB, Kasikorn, Mandiri, BCA, Techcombank,
# DBS, Vietcombank) stay corridor-heuristic only.
#
# Sourced from bank-published pages / archived copies:
#   - BDO (BNORPHMM)      — bdo.com.ph cross-border USD remittance (9 ccys)
#   - BOCHK (BKCHHKHH)    — Bank of China Hong Kong, via Bank of China
#                           branch network (14 ccys, bn.bankofchina.com)
#   - HSBC HK (HSBCHKHH)  — hsbc.com.hk multi-currency remittance page,
#                           USD via HSBC Bank USA (MRMDUS33, CHIPS 0108)
#   - OCBC (OCBCSGSG)     — ocbc.com USD via JPMorgan Chase New York
ASIA_SSI_COVERAGE = [
    ("BNORPHMMXXX", "Banco de Oro (BDO)", {"USD", "EUR", "GBP", "JPY", "SGD", "HKD", "CAD", "AUD"}),
    ("BKCHHKHHXXX", "Bank of China Hong Kong", {"USD", "EUR", "GBP", "JPY", "SGD", "HKD", "CHF", "AUD"}),
    ("HSBCHKHHXXX", "HSBC Hong Kong", {"USD", "EUR", "GBP", "JPY"}),
    ("OCBCSGSGXXX", "OCBC Bank", {"USD"}),
]


class TestAsiaSsiCoverage:
    def test_asian_beneficiaries_have_seeded_ssi_records(self):
        seeded = {}
        for record in SSI_RECORDS:
            ben_bic = record[0]
            seeded.setdefault(ben_bic, set()).add(record[2])
        for bic, name, currencies in ASIA_SSI_COVERAGE:
            have = seeded.get(bic, set())
            missing = currencies - have
            assert not missing, (
                f"{name} ({bic}) is missing seeded SSI records for: {sorted(missing)}"
            )

    def test_asian_beneficiaries_are_in_the_bank_directory(self):
        bank_bics = {row[0] for row in BANKS}
        missing = [
            bic for bic, _name, _currencies in ASIA_SSI_COVERAGE if bic not in bank_bics
        ]
        assert not missing, (
            f"Asian SSI beneficiaries must also be seeded in BANKS so Explore "
            f"can show their settlement instructions: {missing}"
        )

    def test_philippines_and_vietnam_have_usd_coverage(self):
        """BDO is the flagship PH beneficiary; Vietcombank's BIC is pinned
        separately by TestVietcombankBicIsCorrect (no published SSIs)."""
        bdo = [r for r in SSI_RECORDS if r[0] == "BNORPHMMXXX"]
        assert any(r[2] == "USD" for r in bdo), "BDO must carry a USD SSI record"


class TestVietcombankBicIsCorrect:
    """The pre-fix regression: ICBVVNVX is VIETINBANK's BIC, not
    Vietcombank's. Vietcombank publishes BFTVVNVX. Pin the correction so the
    wrong BIC never quietly comes back."""

    def test_no_vietcombank_record_keyed_under_vietinbank_bic(self):
        vietcombank_banks = [
            row[0] for row in BANKS if "Vietcombank" in row[1]
        ]
        assert vietcombank_banks == ["BFTVVNVXXXX"], (
            f"Vietcombank must be keyed under BFTVVNVXXXX, not a VietinBank "
            f"BIC: {vietcombank_banks}"
        )
        for record in SSI_RECORDS:
            assert not (record[0] == "ICBVVNVXXXX" and "Vietcombank" in record[1]), (
                "SSI record claims Vietcombank under the ICBVVNVX BIC"
            )

    def test_corridor_rule_uses_the_correct_bic(self):
        vnd_rules = [
            (bic, name) for _ccy, _country, bic, name, corridor, _conf, _rank
            in CORRIDOR_RULES if corridor == "USD->VN"
        ]
        assert ("BFTVVNVXXXX", "Vietcombank") in vnd_rules, (
            f"USD->VN corridor must clear through Vietcombank's own BIC: {vnd_rules}"
        )


# ---------------------------------------------------------------------------
# UBA francophone/West-Africa subsidiary SSIs
# ---------------------------------------------------------------------------
#
# ubagroup.com publishes a "swift-code" PDF family (archived 2021) covering
# Nigeria, Kenya, Uganda, Senegal, Tanzania (already seeded) plus Liberia,
# Benin, Guinea-Conakry. Each prints the USD correspondent through Citibank
# New York (CITIUS33, ABA 021000089). The PDFs contradict earlier guessed
# BICs (Liberia is UNAFLRLM, not UNAFLRLR; Guinea is UBAGGNCN, not
# UNAFGNGC) — pin the printed values. Côte d'Ivoire, Cameroon, Ghana,
# Sierra Leone, Gabon publish no such PDF — they stay corridor-heuristic.
UBA_SUBSIDIARY_SSI_COVERAGE = [
    ("UNAFLRLMXXX", "UBA Liberia", {"USD"}),
    ("COBBBJBJXXX", "UBA Benin", {"USD"}),
    ("UBAGGNCNXXX", "UBA Guinea", {"USD"}),
]


class TestUbaSubsidiarySsiCoverage:
    def test_uba_subsidiaries_have_seeded_ssi_records(self):
        seeded = {}
        for record in SSI_RECORDS:
            seeded.setdefault(record[0], set()).add(record[2])
        for bic, name, currencies in UBA_SUBSIDIARY_SSI_COVERAGE:
            have = seeded.get(bic, set())
            missing = currencies - have
            assert not missing, (
                f"{name} ({bic}) is missing seeded SSI records for: {sorted(missing)}"
            )

    def test_uba_subsidiaries_are_in_the_bank_directory(self):
        bank_bics = {row[0] for row in BANKS}
        missing = [
            bic for bic, _name, _currencies in UBA_SUBSIDIARY_SSI_COVERAGE
            if bic not in bank_bics
        ]
        assert not missing, (
            f"UBA subsidiary SSI beneficiaries must also be seeded in BANKS: {missing}"
        )

    def test_printed_bics_are_used_not_guesses(self):
        """The archive-verified PDFs print different BICs than the earlier
        guesses — never re-introduce the guessed values."""
        bank_bics = {row[0] for row in BANKS}
        assert "UNAFLRLRXXX" not in bank_bics, "Guessed UBA Liberia BIC is wrong"
        assert "UNAFGNGCXXX" not in bank_bics, "Guessed UBA Guinea BIC is wrong"
        assert "UNAFLRLMXXX" in bank_bics and "UBAGGNCNXXX" in bank_bics, (
            "Printed BICs must be present"
        )


# ---------------------------------------------------------------------------
# Francophone West/Central Africa SSI coverage
# ---------------------------------------------------------------------------
#
# The roadmap names francophone Africa as a training audience, but the seeded
# SSI set only covered anglophone West Africa (Nigeria, Ghana, Kenya, UBA
# subsidiaries). These banks publish BIC-level correspondent lists (no
# account numbers) on archived bank pages:
#   - Coris Bank (BF)      — coris-bank.com correspondants page (2015/2017)
#   - Bank of Africa CI    — boacoteivoire.com Correspondants page (2007)
#   - Afriland First Bank  — afrilandfirstbank.com correspondants page (2011)
#   - Orabank Burkina/Togo — orabank.net partners-and-correspondents (2012-2020)
#
# The pages print the correspondents' BICs but not the bank's own BIC; the
# beneficiary BICs below were verified against theswiftcodes.com country
# listings. Orabank Burkina is ORBKBFBF (a mislabeled ORBABFBF guess must
# never appear). All intermediary BICs were cross-checked — several printed
# BICs on the archived pages belong to OTHER banks (Natixis labeled as
# CCBPFRPP, UBAE as UBAIITRR, BNI as CSSSCIAB, UTB as UNTBTBTGTG, BIA as
# BILTTGT1, BFCM as CMCIFRPA) and are excluded.
FRANCOPHONE_AFRICA_SSI_COVERAGE = [
    ("CORIBFBFXXX", "Coris Bank International", {"USD", "EUR"}),
    ("AFRICIABXXX", "Bank of Africa Côte d'Ivoire", {"USD", "EUR"}),
    ("CCEICMCXXXX", "Afriland First Bank", {"USD", "EUR", "GBP"}),
    ("ORBKBFBFXXX", "Orabank Burkina Faso", {"USD", "EUR"}),
    ("ORBKTGTGXXX", "Orabank Togo", {"USD", "EUR"}),
]


class TestFrancophoneAfricaSsiCoverage:
    def test_francophone_beneficiaries_have_seeded_ssi_records(self):
        seeded = {}
        for record in SSI_RECORDS:
            seeded.setdefault(record[0], set()).add(record[2])
        for bic, name, currencies in FRANCOPHONE_AFRICA_SSI_COVERAGE:
            have = seeded.get(bic, set())
            missing = currencies - have
            assert not missing, (
                f"{name} ({bic}) is missing seeded SSI records for: {sorted(missing)}"
            )

    def test_francophone_beneficiaries_are_in_the_bank_directory(self):
        bank_bics = {row[0] for row in BANKS}
        missing = [
            bic for bic, _name, _currencies in FRANCOPHONE_AFRICA_SSI_COVERAGE
            if bic not in bank_bics
        ]
        assert not missing, (
            f"Francophone SSI beneficiaries must also be seeded in BANKS so "
            f"Explore can show their settlement instructions: {missing}"
        )

    def test_mislabeled_bics_from_source_pages_are_not_used(self):
        """The archived pages print several BICs that belong to other banks
        (Natixis labeled CCBPFRPP, UBAE labeled UBAIITRR, BNI labeled
        CSSSCIAB, UTB labeled UNTBTBTGTG, BIA labeled BILTTGT1, BFCM labeled
        CMCIFRPA) and one wrong Orabank Burkina guess (ORBABFBF). None of
        these may appear as intermediaries or beneficiaries."""
        forbidden = {
            "CCBPFRPP", "CCBPFRPPPAR", "UBAIITRR", "CSSSCIAB",
            "UNTBTBTGTG", "BILTTGT1", "CMCIFRPA", "ORBABFBF",
        }
        used = set()
        for record in SSI_RECORDS:
            used.add(record[0][:8])
            used.add(record[3][:8])
        used |= {row[0][:8] for row in BANKS}
        offenders = sorted(forbidden & used)
        assert not offenders, (
            f"Mislabeled BICs from the source pages must not be seeded: {offenders}"
        )

    def test_verified_beneficiary_bics_are_used(self):
        """The pages print only the correspondents' BICs; the bank's own BICs
        were verified against theswiftcodes.com. Pin the verified values."""
        bank_bics = {row[0] for row in BANKS}
        for bic, _name, _currencies in FRANCOPHONE_AFRICA_SSI_COVERAGE:
            assert bic in bank_bics, f"{bic} must be seeded in BANKS"
        assert "ORBKBFBFXXX" in bank_bics, "Orabank Burkina must be ORBKBFBF, not ORBABFBF"


# ---------------------------------------------------------------------------
# Latin America SSI coverage
# ---------------------------------------------------------------------------
#
# Only one of the major LatAm banks publishes a full SSI table: Banorte
# (Banco Mercantil del Norte, Mexico) prints per-currency correspondents with
# BICs and ABA routing numbers on its transfer-instructions page (2021/2025
# snapshots). Itaú Unibanco publishes BIC-level data only (ITAUBRSP parent,
# ITAUUS33 New York) — no correspondents — so it stays corridor-heuristic
# rather than inventing structures. Banco do Brasil, Bradesco, Santander MX,
# BBVA MX, Banco de Chile and the Canadian banks publish no usable SSI.
#
# Discrepancy pinned: Banorte's own page and the swiftcodes registry agree
# the head-office BIC is MENOMXMT (MENOMXMTXXX as seeded); the commonly
# listed MNORMXMM must never appear.
LATAM_SSI_COVERAGE = [
    ("MENOMXMTXXX", "Banorte", {"USD", "EUR", "CAD", "GBP", "CHF", "JPY", "SEK", "AUD", "NOK"}),
]


class TestLatinAmericaSsiCoverage:
    def test_banorte_has_seeded_ssi_records(self):
        seeded = {}
        for record in SSI_RECORDS:
            seeded.setdefault(record[0], set()).add(record[2])
        for bic, name, currencies in LATAM_SSI_COVERAGE:
            have = seeded.get(bic, set())
            missing = currencies - have
            assert not missing, (
                f"{name} ({bic}) is missing seeded SSI records for: {sorted(missing)}"
            )

    def test_banorte_and_itau_are_in_the_bank_directory(self):
        bank_bics = {row[0] for row in BANKS}
        assert "MENOMXMTXXX" in bank_bics, "Banorte must be seeded in BANKS"
        assert "ITAUBRSPXXX" in bank_bics, (
            "Itaú must be seeded in BANKS so BRL routing and Explore resolve it"
        )

    def test_banorte_bic_is_the_bank_published_value(self):
        """Banorte's own page and the registry print MENOMXMT; the commonly
        listed MNORMXMM is wrong and must never be used."""
        bank_bics = {row[0] for row in BANKS}
        assert "MENOMXMTXXX" in bank_bics
        assert "MNORMXMMXXX" not in bank_bics, "Common-but-wrong Banorte BIC used"

    def test_itau_stays_bic_only_no_invented_ssi(self):
        """Itaú publishes only its own BICs (no correspondents) — it must not
        gain invented SSI records."""
        itau_records = [r for r in SSI_RECORDS if r[0] == "ITAUBRSPXXX"]
        assert itau_records == [], (
            "Itaú publishes no correspondent SSIs; do not invent them"
        )


# ---------------------------------------------------------------------------
# Asia-Pacific (deep) SSI coverage
# ---------------------------------------------------------------------------
#
# Second Asia pass: Taiwan, Hong Kong and Vietnam branches of CTBC, Cathay
# United Bank (Taiwan), and Bangkok Bank's own New York branch routing.
# Sources: ctbcbank.com archived Nostro tables (2024 DOCX, 2025 PDF),
# cathaybk.com.tw inward-remittance page (archived 2016), bangkokbank.com
# New York branch pages (2025). All BIC-only (no account numbers printed
# except CTBC VN's SSI circular, whose accounts are masked).
#
# Corrections pinned: Cathay United is UWCBTWTP, NOT the guessed CUBKTWTP;
# the Wells Fargo New York BIC printed as PNBPUS3NNYC is normalized to the
# canonical PNBPUS33XXX used elsewhere. Bangkok Bank's USD routing is via
# its OWN New York branch (ABA 026008691) — the same self-loop pattern as
# MUFG's existing record.
ASIA_DEEP_SSI_COVERAGE = [
    ("CTCBTWTPXXX", "CTBC Bank Taiwan", {"USD", "EUR", "GBP", "HKD", "JPY", "AUD", "SGD", "NZD", "CAD", "ZAR", "CNY"}),
    ("CTCBHKHHXXX", "CTBC Bank Hong Kong", {"USD", "EUR", "JPY", "GBP", "CHF", "AUD", "CAD", "SGD", "ZAR", "NZD", "THB", "CNY"}),
    ("CTCBVNVXXXX", "CTBC Bank Vietnam", {"USD", "EUR"}),
    ("UWCBTWTPXXX", "Cathay United Bank", {"USD", "HKD", "GBP", "CAD", "JPY", "EUR", "SGD", "AUD", "NZD", "CNY"}),
    ("BKKBTHBKXXX", "Bangkok Bank", {"USD"}),
]


class TestAsiaDeepSsiCoverage:
    def test_asian_banks_have_seeded_ssi_records(self):
        seeded = {}
        for record in SSI_RECORDS:
            seeded.setdefault(record[0], set()).add(record[2])
        for bic, name, currencies in ASIA_DEEP_SSI_COVERAGE:
            have = seeded.get(bic, set())
            missing = currencies - have
            assert not missing, (
                f"{name} ({bic}) is missing seeded SSI records for: {sorted(missing)}"
            )

    def test_asian_banks_are_in_the_bank_directory(self):
        bank_bics = {row[0] for row in BANKS}
        missing = [
            bic for bic, _name, _currencies in ASIA_DEEP_SSI_COVERAGE if bic not in bank_bics
        ]
        assert not missing, (
            f"Asian SSI beneficiaries must also be seeded in BANKS so Explore "
            f"can show their settlement instructions: {missing}"
        )

    def test_cathay_united_uses_the_bank_published_bic(self):
        """Cathay United's own page prints UWCBTWTP; the guessed CUBKTWTP
        must never be used."""
        bank_bics = {row[0] for row in BANKS}
        assert "UWCBTWTPXXX" in bank_bics
        assert "CUBKTWTPXXX" not in bank_bics, "Guessed Cathay United BIC used"

    def test_wells_fargo_uses_the_canonical_bic(self):
        """The printed PNBPUS3NNYC is normalized to PNBPUS33XXX (Wells Fargo
        New York, legacy BIC family) across all records."""
        for record in SSI_RECORDS:
            assert record[3] != "PNBPUS3NNYC", (
                "Normalize the printed Wells Fargo BIC to PNBPUS33XXX"
            )


# ---------------------------------------------------------------------------
# South Asia SSI coverage
# ---------------------------------------------------------------------------
#
# Fourth region pass. Pakistan, Bangladesh and Sri Lanka publish full SSI
# tables (BIC + account + routing IDs) on archived bank pages:
#   - HBL (HABBPKKA)    — hbl.com Nostros_and_SSI PDF (archived 2026)
#   - UBL (UNILPKKA)    — ubl.com.pk SSIs PDF (archived 2011)
#   - MCB (MUCBPKKA)    — mcb.com.pk Nostro PDF (archived 2021)
#   - Meezan (MEZNPAKA) — meezanbank.com NOSTRO PDF (archived 2019)
#   - Agrani (AGBKBDDH) — agranibank.org List of Nostro Ac PDF (archived 2021)
#   - ComBank Ceylon    — combank.lk correspondent-banks page (archived 2011)
#   - DFCC (DFCCLKLX)   — dfcc.lk SSI PDF (archived 2017)
# Turkish HQs and the other Bangladesh banks (IBBL, Sonali, Janata, BRAC,
# DBBL, HNB) publish no usable SSIs — excluded.
#
# BIC corrections pinned: Habib is HABBPKKA (the old HABBPKKAAXX "AXX"
# artifact must never return); Standard Chartered Frankfurt is normalized to
# SCBLDEFFXXX (the South Asian PDFs print SCBLDEFX); HBL's OMR row prints the
# transposed BSHROMRU (Sohar International is BHSOOMRU, unconfirmed) so it is
# not seeded. Mashreq NY (MSHQUS33) and Habib American Bank (HANYUS33) carry
# bank-published ABAs and are promoted to SETTLEMENT_DIRECTORY, not exempted.
SOUTH_ASIA_SSI_COVERAGE = [
    ("HABBPKKAXXX", "Habib Bank Limited", {"USD", "EUR", "GBP"}),
    ("UNILPKKAXXX", "United Bank Limited", {"USD", "EUR", "GBP"}),
    ("MUCBPKKAXXX", "MCB Bank", {"USD", "EUR", "GBP"}),
    ("MEZNPAKAXXX", "Meezan Bank", {"USD", "EUR", "GBP"}),
    ("AGBKBDDHXXX", "Agrani Bank", {"USD", "EUR"}),
    ("COMBLKLXXXX", "Commercial Bank of Ceylon", {"USD", "GBP"}),
    ("DFCCLKLXXXX", "DFCC Bank", {"USD", "EUR"}),
]


class TestSouthAsiaSsiCoverage:
    def test_south_asian_banks_have_seeded_ssi_records(self):
        seeded = {}
        for record in SSI_RECORDS:
            seeded.setdefault(record[0], set()).add(record[2])
        for bic, name, currencies in SOUTH_ASIA_SSI_COVERAGE:
            have = seeded.get(bic, set())
            missing = currencies - have
            assert not missing, (
                f"{name} ({bic}) is missing seeded SSI records for: {sorted(missing)}"
            )

    def test_south_asian_banks_are_in_the_bank_directory(self):
        bank_bics = {row[0] for row in BANKS}
        missing = [
            bic for bic, _name, _currencies in SOUTH_ASIA_SSI_COVERAGE
            if bic not in bank_bics
        ]
        assert not missing, (
            f"South Asian SSI beneficiaries must also be seeded in BANKS so "
            f"Explore can show their settlement instructions: {missing}"
        )

    def test_habib_uses_the_bank_published_bic(self):
        """HBL's own PDF prints HABBPKKA; the old HABBPKKAAXX 'AXX' artifact
        must never come back."""
        bank_bics = {row[0] for row in BANKS}
        assert "HABBPKKAXXX" in bank_bics
        assert "HABBPKKAAXX" not in bank_bics, "Legacy HABBPKKAAXX BIC used"

    def test_scb_frankfurt_normalized_everywhere(self):
        """The South Asian PDFs print Standard Chartered Frankfurt as
        SCBLDEFX; the canonical form is SCBLDEFFXXX. No variant of the
        typo may appear as an intermediary."""
        for record in SSI_RECORDS:
            assert record[3] != "SCBLDEFXXXX", (
                "Normalize SCB Frankfurt to SCBLDEFFXXX"
            )

    def test_no_transposed_sohar_bic(self):
        """HBL's OMR row prints BSHROMRU for Sohar International (real BIC
        BHSOOMRU, unconfirmed) — it must not be seeded."""
        used = set()
        for record in SSI_RECORDS:
            used.add(record[3])
        assert "BSHROMRUXXX" not in used, "Transposed Sohar BIC must not be seeded"


class TestSeedRollout:
    def test_operator_owned_ordinary_row_is_preserved_on_bic_only_conflict(self):
        """An unknown-owner legacy row is preserved when the source changes
        shape; clearing its settlement data would be destructive."""
        engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
            future=True,
        )
        Base.metadata.create_all(bind=engine)
        Session = sessionmaker(bind=engine, future=True)
        session = Session()
        try:
            session.add(SSI(
                beneficiary_bic="SICOTHBKXXX",
                beneficiary_bank_name="Siam Commercial Bank (SCB)",
                currency="USD",
                intermediary_bic="MRMDUS33XXX",
                intermediary_bank_name="HSBC Bank U.S.A., New York",
                intermediary_account="ACCT-LEGACY",
                beneficiary_account="ACCT-LEGACY-BENE",
                charge_code="SHA",
                value_date="spot",
            ))
            session.commit()

            from app.services.seed import seed_if_empty

            result = seed_if_empty(session)
            session.expunge_all()

            row = session.query(SSI).filter_by(
                beneficiary_bic="SICOTHBKXXX",
                currency="USD",
                intermediary_bic="MRMDUS33XXX",
            ).one()
            assert row.bic_only is False
            assert row.intermediary_account == "ACCT-LEGACY"
            assert row.beneficiary_account == "ACCT-LEGACY-BENE"
            assert row.charge_code == "SHA"
            assert row.value_date == "spot"
            assert result.get("ssi_provenance_updated", 0) == 0
        finally:
            session.close()
            engine.dispose()

    def test_reseed_preserves_an_unknown_owner_on_bic_only_conflict(self):
        """Without a fingerprint, a shape-changing source update is a
        conflict, not permission to rewrite the existing settlement row."""
        from app.services.seed import SSI_RECORDS, seed_if_empty

        target = next(
            row for row in SSI_RECORDS
            if len(row) > 13 and row[0] == "EBILAEADXXX" and row[2] == "USD"
        )
        (ben_bic, ben_name, ccy, int_bic, int_name, _int_acct, _ben_acct,
         _charge, _vdate, source_notes, source_as_of, source_status,
         _verified_by, target_bic_only) = target
        assert target_bic_only is True

        engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
            future=True,
        )
        Base.metadata.create_all(bind=engine)
        Session = sessionmaker(bind=engine, future=True)
        session = Session()
        try:
            session.add(SSI(
                beneficiary_bic=ben_bic,
                beneficiary_bank_name=ben_name,
                currency=ccy,
                intermediary_bic=int_bic,
                intermediary_bank_name=int_name,
                intermediary_account="ACCT-OLD",
                beneficiary_account="ACCT-OLD-BENE",
                charge_code="SHA",
                value_date="spot",
                notes="Source: superseded correspondent list.",
                as_of="2020-01-01",
                status=source_status,
                bic_only=False,
            ))
            session.commit()

            seed_if_empty(session)
            session.expunge_all()
            row = session.query(SSI).filter_by(
                beneficiary_bic=ben_bic, currency=ccy, intermediary_bic=int_bic
            ).one()
            assert row.bic_only is False
            assert row.notes == "Source: superseded correspondent list."
            assert row.as_of == "2020-01-01"
            assert row.status == source_status
            assert row.intermediary_account == "ACCT-OLD"
            assert row.beneficiary_account == "ACCT-OLD-BENE"
        finally:
            session.close()
            engine.dispose()

    def test_legacy_seed_placeholders_can_transition_to_bic_only(self):
        """Known pre-fingerprint seed placeholders may be safely reshaped;
        rows with any operator signal take the preservation path above."""
        import app.services.seed as seed_module

        target = next(
            row for row in seed_module.SSI_RECORDS
            if len(row) > 13 and row[0] == "EBILAEADXXX" and row[2] == "USD"
        )
        (ben_bic, _ben_name, ccy, int_bic, _int_name, _int_acct, _ben_acct,
         _charge, _vdate, _notes, source_as_of, source_status,
         _verified_by, target_bic_only) = target
        assert target_bic_only is True

        engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
            future=True,
        )
        Base.metadata.create_all(bind=engine)
        Session = sessionmaker(bind=engine, future=True)
        session = Session()
        try:
            session.add(SSI(
                beneficiary_bic=ben_bic,
                # These are the names from the pre-bic_only row. The source
                # later normalized them, but that source-controlled change
                # must not make the old machine row look operator-owned.
                beneficiary_bank_name="Emirates NBD",
                currency=ccy,
                intermediary_bic=int_bic,
                intermediary_bank_name="Citibank NA, New York",
                intermediary_account="ACCT-91001632",
                beneficiary_account="ACCT-91001630",
                charge_code="OUR",
                value_date="spot",
                notes=(
                    "Source: " + seed_module._ENBD_BIC_ONLY_SOURCE
                    + " (as of 2026-05-01). "
                    + seed_module._SSI_REAL_NOTE
                ),
                as_of="2026-05-01",
                status=source_status,
                bic_only=False,
            ))
            session.commit()

            seed_module.seed_if_empty(session)

            row = session.query(SSI).filter_by(
                beneficiary_bic=ben_bic,
                currency=ccy,
                intermediary_bic=int_bic,
            ).one()
            assert row.bic_only is True
            assert row.intermediary_account is None
            assert row.beneficiary_account is None
            assert row.charge_code is None
            assert row.value_date is None
            assert row.as_of == source_as_of
        finally:
            session.close()
            engine.dispose()

    def test_legacy_archived_sha_placeholders_are_recognized(self):
        import app.services.seed as seed_module

        row = SSI(
            beneficiary_bic="SICOTHBKXXX",
            beneficiary_bank_name="Siam Commercial Bank (SCB)",
            currency="USD",
            intermediary_bic="MRMDUS33XXX",
            intermediary_bank_name="HSBC Bank U.S.A., New York",
            intermediary_account="ACCT-91002101",
            beneficiary_account="ACCT-91002113",
            charge_code="SHA",
            value_date="spot",
            notes=(
                "Source: https://web.archive.org/web/20030824172043id_/"
                "http://www.scb.co.th:80/datahtml/gl_settlementbank_main.htm "
                "(as of 2002-08-08). " + seed_module._SSI_REAL_NOTE
            ),
            as_of="2002-08-08",
            status="archived",
            bic_only=False,
        )
        assert seed_module._legacy_seed_row_is_unmodified(row) is True
        row.intermediary_account = "ACCT-OPERATOR-OWNED"
        assert seed_module._legacy_seed_row_is_unmodified(row) is False

    def test_reseed_replaces_a_changed_machine_citation_with_same_provenance(self):
        """A source URL can change without changing date, status, or shape."""
        from app.services.seed import SSI_RECORDS, seed_if_empty

        target = next(
            row for row in SSI_RECORDS
            if len(row) <= 13 and row[0] == "ZEIBNGLAXXX"
            and row[2] == "USD" and row[3] == "CITIUS33XXX"
        )
        (ben_bic, ben_name, ccy, int_bic, int_name, _int_acct, _ben_acct,
         _charge, _vdate, source_notes, source_as_of, source_status,
         *provenance_tail) = target
        source_verified = provenance_tail[0] if provenance_tail else None

        engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
            future=True,
        )
        Base.metadata.create_all(bind=engine)
        Session = sessionmaker(bind=engine, future=True)
        session = Session()
        try:
            session.add(SSI(
                beneficiary_bic=ben_bic,
                beneficiary_bank_name=ben_name,
                currency=ccy,
                intermediary_bic=int_bic,
                intermediary_bank_name=int_name,
                intermediary_account="ACCT-OLD",
                beneficiary_account="ACCT-OLD-BENE",
                charge_code="SHA",
                value_date="spot",
                notes="Source: superseded page.",
                as_of=source_as_of,
                status=source_status,
                verified_by=source_verified,
            ))
            session.commit()

            seed_if_empty(session)

            row = session.query(SSI).filter_by(
                beneficiary_bic=ben_bic, currency=ccy, intermediary_bic=int_bic
            ).one()
            assert source_notes in row.notes
            assert "Source: superseded page." in row.notes
        finally:
            session.close()
            engine.dispose()

    def test_populated_database_receives_new_rows_and_bic_corrections(self):
        """The PR seed must upgrade an existing pre-expansion database."""
        engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
            future=True,
        )
        Base.metadata.create_all(bind=engine)
        Session = sessionmaker(bind=engine, future=True)
        session = Session()
        try:
            session.add(Bank(
                bic="CITIUS33XXX",
                bank_name="Citibank",
                country_code="US",
                city="New York",
                country_currency="USD",
            ))
            session.add(Bank(
                bic="NRBMAEADXXX",
                bank_name="Mashreq Bank",
                country_code="AE",
                city="Dubai",
                country_currency="AED",
            ))
            session.add(CorridorRule(
                destination_currency="KWD",
                destination_country="KW",
                intermediary_bic="NBOMKWKEXXX",
                intermediary_name="National Bank of Kuwait",
                corridor="USD->KW",
                confidence="high",
                rank=2,
            ))
            session.add(SSI(
                beneficiary_bic="BCEYLKLXXXX",
                beneficiary_bank_name="Bank of Ceylon",
                currency="EUR",
                intermediary_bic="SCBLDEFXXXX",
                intermediary_bank_name="Standard Chartered Frankfurt",
                intermediary_account="ACCT-OLD",
                beneficiary_account="ACCT-BENE",
                charge_code="SHA",
                value_date="spot",
            ))
            session.add(SSI(
                beneficiary_bic="GTBINGLAXXX",
                beneficiary_bank_name="Guaranty Trust Bank",
                currency="USD",
                intermediary_bic="CITIUS33XXX",
                intermediary_bank_name="Citibank New York",
                intermediary_account="ACCT-OPERATOR-OWNED",
                beneficiary_account="ACCT-BENE",
                charge_code="OUR",
                value_date="same-day",
                notes="Operator-imported SSI must survive seed rollout",
            ))
            session.commit()

            from app.services.seed import seed_if_empty

            result = seed_if_empty(session)

            assert result["banks"] > 0
            assert session.query(Bank).filter_by(bic="MASHAEADXXX").one_or_none() is not None
            assert session.query(Bank).filter_by(bic="NRBMAEADXXX").one_or_none() is None
            assert session.query(CorridorRule).filter_by(intermediary_bic="NBOKKWKWXXX").one_or_none() is not None
            assert session.query(CorridorRule).filter_by(intermediary_bic="NBOMKWKEXXX").one_or_none() is None
            corrected = session.query(SSI).filter_by(
                beneficiary_bic="BCEYLKLXXXX",
                currency="EUR",
                intermediary_bic="SCBLDEFFXXX",
            ).one_or_none()
            assert corrected is not None
            assert session.query(SSI).filter_by(intermediary_bic="SCBLDEFXXXX").one_or_none() is None
            preserved = session.query(SSI).filter_by(
                beneficiary_bic="GTBINGLAXXX",
                currency="USD",
                intermediary_bic="CITIUS33XXX",
            ).one()
            assert preserved.intermediary_account == "ACCT-OPERATOR-OWNED"
            assert preserved.charge_code == "OUR"
        finally:
            session.close()
            engine.dispose()

    def test_reseed_removes_stale_seed_owned_rows(self, monkeypatch):
        """Only fingerprinted, untouched rows removed from the source set retire."""
        import app.services.seed as seed_module

        current = next(
            row for row in seed_module.SSI_RECORDS
            if row[0] == "ZEIBNGLAXXX"
            and row[2] == "USD"
            and row[3] == "CITIUS33XXX"
        )
        removed = next(
            row for row in seed_module.SSI_RECORDS
            if row[0] == "SBININBBXXX"
            and row[2] == "EUR"
            and row[3] == "NDEAFIHHXXX"
        )
        operator_corrected = next(
            row for row in seed_module.SSI_RECORDS
            if row[0] == "SBININBBXXX"
            and row[2] == "EUR"
            and row[3] == "BBRUBEBBXXX"
        )
        legacy_bic_only = next(
            row for row in seed_module.SSI_RECORDS
            if len(row) > 13 and row[13] is True
        )
        removed_enbd_key = ("EBILAEADXXX", "USD", "OLDSUPPXXX")
        monkeypatch.setattr(seed_module, "SSI_RECORDS", (current,))

        engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
            future=True,
        )
        Session = sessionmaker(bind=engine, future=True)
        Base.metadata.create_all(bind=engine)
        session = Session()
        try:
            removed_row = SSI(
                beneficiary_bic=removed[0],
                beneficiary_bank_name=removed[1],
                currency=removed[2],
                intermediary_bic=removed[3],
                intermediary_bank_name=removed[4],
                intermediary_account=removed[5],
                beneficiary_account=removed[6],
                charge_code=removed[7],
                value_date=removed[8],
                notes=removed[9],
                as_of=removed[10],
                status=removed[11],
                bic_only=False,
            )
            # This represents a row written by the fingerprinted seeder on a
            # prior run; legacy rows without this snapshot are preserved.
            removed_row.seed_fingerprint = seed_module._seed_fingerprint(removed_row)
            session.add(removed_row)
            session.add(SSI(
                beneficiary_bic=removed_enbd_key[0],
                beneficiary_bank_name="Emirates NBD Bank (P.J.S.C.)",
                currency=removed_enbd_key[1],
                intermediary_bic=removed_enbd_key[2],
                intermediary_bank_name="Obsolete Superseded Bank",
                intermediary_account="ACCT-91001699",
                beneficiary_account="ACCT-91001698",
                charge_code="SHA",
                value_date="spot",
                notes=(
                    "Source: https://www.emiratesnbd.com/example"
                    " (as of 2026-05-01). " + seed_module._SSI_REAL_NOTE
                ),
                as_of="2026-05-01",
                status="unverified",
                bic_only=False,
            ))
            session.flush()
            removed_enbd_row = session.query(SSI).filter_by(
                beneficiary_bic=removed_enbd_key[0],
                currency=removed_enbd_key[1],
                intermediary_bic=removed_enbd_key[2],
            ).one()
            removed_enbd_row.seed_fingerprint = seed_module._seed_fingerprint(
                removed_enbd_row
            )
            session.add(SSI(
                beneficiary_bic=operator_corrected[0],
                beneficiary_bank_name=operator_corrected[1],
                currency=operator_corrected[2],
                intermediary_bic=operator_corrected[3],
                intermediary_bank_name=operator_corrected[4],
                intermediary_account=operator_corrected[5],
                beneficiary_account="REAL-OPERATOR-ACCOUNT",
                charge_code=operator_corrected[7],
                value_date=operator_corrected[8],
                notes=operator_corrected[9],
                as_of=operator_corrected[10],
                status=operator_corrected[11],
            ))
            session.add(SSI(
                beneficiary_bic=legacy_bic_only[0],
                beneficiary_bank_name=legacy_bic_only[1],
                currency=legacy_bic_only[2],
                intermediary_bic=legacy_bic_only[3],
                intermediary_bank_name=legacy_bic_only[4],
                notes=legacy_bic_only[9],
                as_of=legacy_bic_only[10],
                status=legacy_bic_only[11],
                bic_only=True,
            ))
            session.commit()

            result = seed_module.seed_if_empty(session)

            assert result["ssi_retired"] == 2
            assert session.query(SSI).filter_by(
                beneficiary_bic=removed[0],
                currency=removed[2],
                intermediary_bic=removed[3],
            ).one_or_none() is None
            assert session.query(SSI).filter_by(
                beneficiary_bic=removed_enbd_key[0],
                currency=removed_enbd_key[1],
                intermediary_bic=removed_enbd_key[2],
            ).one_or_none() is None
            preserved = session.query(SSI).filter_by(
                beneficiary_bic=operator_corrected[0],
                currency=operator_corrected[2],
                intermediary_bic=operator_corrected[3],
            ).one()
            assert preserved.beneficiary_account == "REAL-OPERATOR-ACCOUNT"
            assert session.query(SSI).filter_by(
                beneficiary_bic=legacy_bic_only[0],
                currency=legacy_bic_only[2],
                intermediary_bic=legacy_bic_only[3],
            ).one().bic_only is True
        finally:
            session.close()
            engine.dispose()

    def test_fingerprinted_seed_row_survives_a_later_operator_correction(self, monkeypatch):
        import app.services.seed as seed_module

        current = next(
            row for row in seed_module.SSI_RECORDS
            if row[0] == "ZEIBNGLAXXX"
            and row[2] == "USD"
            and row[3] == "CITIUS33XXX"
        )
        monkeypatch.setattr(seed_module, "SSI_RECORDS", (current,))

        engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
            future=True,
        )
        Base.metadata.create_all(bind=engine)
        Session = sessionmaker(bind=engine, future=True)
        session = Session()
        try:
            seed_module.seed_if_empty(session)
            row = session.query(SSI).filter_by(
                beneficiary_bic=current[0],
                currency=current[2],
                intermediary_bic=current[3],
            ).one()
            assert row.seed_fingerprint
            row.beneficiary_account = "REAL-OPERATOR-ACCOUNT"
            session.commit()

            monkeypatch.setattr(seed_module, "SSI_RECORDS", ())
            result = seed_module.seed_if_empty(session)

            assert result["ssi_retired"] == 0
            preserved = session.query(SSI).filter_by(
                beneficiary_bic=current[0],
                currency=current[2],
                intermediary_bic=current[3],
            ).one()
            assert preserved.beneficiary_account == "REAL-OPERATOR-ACCOUNT"
        finally:
            session.close()
            engine.dispose()

    def test_fingerprint_refreshes_when_the_machine_citation_changes(self, monkeypatch):
        import app.services.seed as seed_module

        original = next(
            row for row in seed_module.SSI_RECORDS
            if row[0] == "ZEIBNGLAXXX"
            and row[2] == "USD"
            and row[3] == "CITIUS33XXX"
        )
        monkeypatch.setattr(seed_module, "SSI_RECORDS", (original,))

        engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
            future=True,
        )
        Base.metadata.create_all(bind=engine)
        Session = sessionmaker(bind=engine, future=True)
        session = Session()
        try:
            seed_module.seed_if_empty(session)
            updated = (*original[:9], "Source: revised machine citation.", *original[10:])
            monkeypatch.setattr(seed_module, "SSI_RECORDS", (updated,))
            seed_module.seed_if_empty(session)

            row = session.query(SSI).filter_by(
                beneficiary_bic=original[0],
                currency=original[2],
                intermediary_bic=original[3],
            ).one()
            assert row.notes == updated[9]
            assert row.seed_fingerprint == seed_module._seed_fingerprint(row)

            monkeypatch.setattr(seed_module, "SSI_RECORDS", ())
            result = seed_module.seed_if_empty(session)
            assert result["ssi_retired"] == 1
            assert session.query(SSI).filter_by(
                beneficiary_bic=original[0],
                currency=original[2],
                intermediary_bic=original[3],
            ).one_or_none() is None
        finally:
            session.close()
            engine.dispose()

    def test_bic_only_row_becoming_ordinary_is_repopulated(self):
        """A previously availability-only row that the seed now defines as an
        ordinary instruction must GAIN its account/charge/value fields, not
        just flip the flag. Routing excludes bic_only rows; a row flipped back
        to ordinary only becomes selectable once it actually carries the
        instruction fields."""
        from app.services.seed import seed_if_empty

        target = next(r for r in SSI_RECORDS
                      if len(r) <= 13 and r[0] == "ZEIBNGLAXXX"
                      and r[2] == "USD" and r[3] == "CITIUS33XXX")
        (ben_bic, ben_name, ccy, int_bic, int_name, int_acct, ben_acct,
         charge, vdate, notes, *provenance) = target
        as_of = provenance[0] if provenance else None
        status = provenance[1] if len(provenance) > 1 else "illustrative"
        target_bic_only = bool(provenance[3]) if len(provenance) > 3 else False
        assert not target_bic_only

        engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
            future=True,
        )
        Base.metadata.create_all(bind=engine)
        Session = sessionmaker(bind=engine, future=True)
        session = Session()
        try:
            session.add(SSI(
                beneficiary_bic=ben_bic,
                beneficiary_bank_name="BIC-only legacy row",
                currency=ccy,
                intermediary_bic=int_bic,
                intermediary_bank_name="BIC-only legacy intermediary",
                bic_only=True,
                status="unverified",
                as_of="2020-08-15",
                notes="availability-only legacy row, no accounts published",
            ))
            session.commit()

            result = seed_if_empty(session)
            session.expunge_all()

            row = session.query(SSI).filter_by(
                beneficiary_bic=ben_bic, currency=ccy, intermediary_bic=int_bic
            ).one()
            assert row.bic_only is False
            assert row.intermediary_account == int_acct
            assert row.beneficiary_account == ben_acct
            assert row.charge_code == charge
            assert row.value_date == vdate
            assert row.beneficiary_bank_name == target[1]
            assert row.intermediary_bank_name == int_name
            assert row.notes.startswith("Source:")
            assert notes in row.notes
            assert "availability-only legacy row, no accounts published" in row.notes
            assert row.as_of == as_of
            assert row.status == status
            assert result["ssi_provenance_updated"] >= 1
        finally:
            session.close()
            engine.dispose()

    def test_reseed_preserves_operator_owned_ordinary_fields(self):
        """Ordinary rows are operator-authoritative: the seed restates
        provenance (as_of/status/verified_by) but must NOT clobber an
        operator-corrected account/charge/date with an illustrative
        placeholder. This is the complete-row assertion the re-seed defect
        review asked for — the row after a re-seed that changes provenance is
        checked field by field, not just counted."""
        from app.services.seed import seed_if_empty

        target = next(r for r in SSI_RECORDS
                      if len(r) <= 13 and r[0] == "ZEIBNGLAXXX"
                      and r[2] == "USD" and r[3] == "CITIUS33XXX")
        (ben_bic, _ben_name, ccy, int_bic, _int_name, _int_acct, _ben_acct,
         _charge, _vdate, source_notes, *provenance) = target
        source_as_of = provenance[0]
        source_status = provenance[1] if len(provenance) > 1 else "illustrative"

        engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
            future=True,
        )
        Base.metadata.create_all(bind=engine)
        Session = sessionmaker(bind=engine, future=True)
        session = Session()
        try:
            session.add(SSI(
                beneficiary_bic=ben_bic,
                beneficiary_bank_name="Operator-corrected Zenith",
                currency=ccy,
                intermediary_bic=int_bic,
                intermediary_bank_name="Operator-corrected Citibank",
                intermediary_account="ACCT-OP-INT",
                beneficiary_account="ACCT-OP-BENE",
                charge_code="OUR",
                value_date="same-day",
                notes="Operator-corrected SSI must survive the roll-forward",
                as_of="2020-08-15",
                status="unverified",
            ))
            session.commit()

            result = seed_if_empty(session)
            session.expunge_all()

            row = session.query(SSI).filter_by(
                beneficiary_bic=ben_bic, currency=ccy, intermediary_bic=int_bic
            ).one()
            # Provenance restates…
            assert row.as_of == source_as_of
            assert row.status == source_status
            # …but the operator's settlement fields survive untouched.
            assert row.intermediary_account == "ACCT-OP-INT"
            assert row.beneficiary_account == "ACCT-OP-BENE"
            assert row.charge_code == "OUR"
            assert row.value_date == "same-day"
            assert row.beneficiary_bank_name == "Operator-corrected Zenith"
            assert row.intermediary_bank_name == "Operator-corrected Citibank"
            assert row.notes.startswith("Source:")
            assert "Operator-corrected SSI must survive the roll-forward" in row.notes
            assert source_notes in row.notes
            assert result["ssi_provenance_updated"] >= 1

            first_notes = row.notes
            seed_if_empty(session)
            assert session.query(SSI).filter_by(
                beneficiary_bic=ben_bic,
                currency=ccy,
                intermediary_bic=int_bic,
            ).one().notes == first_notes
        finally:
            session.close()
            engine.dispose()

    def test_single_line_source_note_can_carry_an_operator_note(self):
        from app.services.seed import SSI_RECORDS, _merge_seed_citation

        target = next(r for r in SSI_RECORDS if r[0] == "ZEIBNGLAXXX" and r[2] == "USD")
        merged = _merge_seed_citation(
            "Source: old page; Operator note: use approved account",
            target[9],
        )
        assert target[9] in merged
        assert "use approved account" in merged

    def test_ambiguous_single_line_source_note_is_preserved(self):
        from app.services.seed import _merge_seed_citation

        merged = _merge_seed_citation(
            "Source: old page; retain approved account",
            "Source: new page",
        )
        assert "Source: new page" in merged
        assert "Source: old page; retain approved account" in merged

    def test_seed_rejects_a_non_boolean_bic_only_flag(self, monkeypatch):
        """The bic_only provenance flag is read with isinstance(x, bool): a
        hand-edited 14-field tuple whose flag is the string "False" must fail
        loudly at seed time. bool("False") is True, which would quietly turn an
        ordinary row into a BIC-only one — clearing its settlement fields and
        suppressing routing on it."""
        import pytest

        from app.services.seed import SSI_RECORDS, seed_if_empty

        malformed = (
            "ZZBANKXYXXX", "Some Bank", "USD", "CITIUS33XXX", "Citibank",
            None, None, None, None, "Source: x", "2026-01-01", "unverified",
            None, "False",
        )
        monkeypatch.setattr(
            "app.services.seed.SSI_RECORDS",
            list(SSI_RECORDS) + [malformed],
        )
        engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
            future=True,
        )
        Base.metadata.create_all(bind=engine)
        Session = sessionmaker(bind=engine, future=True)
        session = Session()
        try:
            with pytest.raises(ValueError, match="Python boolean"):
                seed_if_empty(session)
        finally:
            session.close()
            engine.dispose()

# ---------------------------------------------------------------------------
# European beneficiary SSI coverage
# ---------------------------------------------------------------------------
#
# Fifth region pass — the first banks with EUR/GBP corridors seeded as
# BENEFICIARIES (European banks previously appeared only as intermediaries).
# Three publish usable SSIs:
#   - Deutsche Bank Frankfurt (DEUTDEFF) — corporates.db.com SSI PDF
#     (effective 2025-02-03): USD via its own NY branch DEUTUS33
#     (ABA 026003780), EUR direct via TARGET, GBP via DEUTGB2L, CHF via UBS
#   - Nordea (NDEASESS, Sweden) — nordea.com FX-and-derivatives SSI: USD via
#     Bank of America NY (ABA 026009593), SEK via itself, DKK via NDEADKKK,
#     GBP via Barclays, CHF via UBS
#   - Danske Bank (DABADKKK) — danskebank.com standard-settlement page
#     (archived 2017): USD via BofA NY, EUR direct, GBP via HSBC, JPY via
#     MUFG
# BNP, Santander, BBVA, Intesa, UniCredit, UBS, SEB, ING, Rabobank publish
# no beneficiary SSIs — excluded.
EUROPE_SSI_COVERAGE = [
    ("DEUTDEFFXXX", "Deutsche Bank Frankfurt", {"USD", "EUR", "GBP", "CHF"}),
    ("NDEASESSXXX", "Nordea Bank Sweden", {"USD", "SEK", "GBP", "CHF"}),
    ("DABADKKKXXX", "Danske Bank", {"USD", "EUR", "GBP", "JPY"}),
]


class TestEuropeSsiCoverage:
    def test_european_banks_have_seeded_ssi_records(self):
        seeded = {}
        for record in SSI_RECORDS:
            seeded.setdefault(record[0], set()).add(record[2])
        for bic, name, currencies in EUROPE_SSI_COVERAGE:
            have = seeded.get(bic, set())
            missing = currencies - have
            assert not missing, (
                f"{name} ({bic}) is missing seeded SSI records for: {sorted(missing)}"
            )

    def test_european_banks_are_in_the_bank_directory(self):
        bank_bics = {row[0] for row in BANKS}
        missing = [
            bic for bic, _name, _currencies in EUROPE_SSI_COVERAGE
            if bic not in bank_bics
        ]
        assert not missing, (
            f"European SSI beneficiaries must also be seeded in BANKS so "
            f"Explore can show their settlement instructions: {missing}"
        )

    def test_deutsche_usd_uses_its_own_ny_branch(self):
        """DB Frankfurt's published USD SSI is its own NY branch (DEUTUS33,
        ABA 026003780) — not a third-party clearer. Pin it."""
        deut_usd = [
            r[3] for r in SSI_RECORDS
            if r[0] == "DEUTDEFFXXX" and r[2] == "USD"
        ]
        assert "DEUTUS33XXX" in deut_usd, (
            f"DB Frankfurt must clear USD via its own NY branch: {deut_usd}"
        )


# ---- autopilot-generated coverage tests: southeast-asia ----
SOUTHEAST_ASIA_SSI_COVERAGE = [
    ("BOPIPHMMXXX", "Bank of the Philippine Islands", {"USD", "EUR", "GBP", "JPY", "SGD", "HKD", "CAD", "CHF", "SEK"}),
]

class TestSoutheastAsiaSsiCoverage:

    def test_southeast_asia_banks_have_seeded_ssi_records(self):
        manifest_expected = _manifest_seedable_coverage("southeast-asia")
        generated_expected = {bic: (bank_name, currencies) for bic, bank_name, currencies in SOUTHEAST_ASIA_SSI_COVERAGE}
        assert generated_expected == manifest_expected
        seeded = {}
        for record in SSI_RECORDS:
            seeded.setdefault(record[0], set()).add(record[2])
        for bic, (bank_name, currencies) in manifest_expected.items():
            missing = currencies - seeded.get(bic, set())
            assert not missing, f"{bank_name} ({bic}) is missing seeded SSI records for: {sorted(missing)}"

    def test_southeast_asia_banks_are_in_the_bank_directory(self):
        bank_bics = {row[0] for row in BANKS}
        manifest_expected = _manifest_seedable_coverage("southeast-asia")
        missing = [bic for bic in manifest_expected if bic not in bank_bics]
        assert not missing, (
            f"southeast-asia SSI beneficiaries must also be seeded in BANKS so "
            f"Explore can show their settlement instructions: {missing}"
        )

    def test_southeast_asia_seeded_records_are_semantically_valid(self):
        _assert_manifest_region_records("southeast-asia", SSI_RECORDS, BANKS)
# ---- end autopilot-generated coverage tests: southeast-asia ----


# ---- autopilot-generated coverage tests: bangladesh ----
BANGLADESH_SSI_COVERAGE = [
    ("AGBKBDDHXXX", "Agrani Bank PLC", {"AED", "CAD", "CHF", "CNY", "EUR", "GBP", "JPY", "SAR", "SGD", "USD"}),
    ("EBLDBDDHXXX", "Eastern Bank PLC", {"AED", "AUD", "CHF", "CNY", "EUR", "GBP", "JPY", "SAR", "SGD", "USD"}),
]

class TestBangladeshSsiCoverage:

    def test_bangladesh_banks_have_seeded_ssi_records(self):
        manifest_expected = _manifest_seedable_coverage("bangladesh")
        generated_expected = {bic: (bank_name, currencies) for bic, bank_name, currencies in BANGLADESH_SSI_COVERAGE}
        assert generated_expected == manifest_expected
        seeded = {}
        for record in SSI_RECORDS:
            seeded.setdefault(record[0], set()).add(record[2])
        for bic, (bank_name, currencies) in manifest_expected.items():
            missing = currencies - seeded.get(bic, set())
            assert not missing, f"{bank_name} ({bic}) is missing seeded SSI records for: {sorted(missing)}"

    def test_bangladesh_banks_are_in_the_bank_directory(self):
        bank_bics = {row[0] for row in BANKS}
        manifest_expected = _manifest_seedable_coverage("bangladesh")
        missing = [bic for bic in manifest_expected if bic not in bank_bics]
        assert not missing, (
            f"bangladesh SSI beneficiaries must also be seeded in BANKS so "
            f"Explore can show their settlement instructions: {missing}"
        )

    def test_bangladesh_seeded_records_are_semantically_valid(self):
        _assert_manifest_region_records("bangladesh", SSI_RECORDS, BANKS)
# ---- end autopilot-generated coverage tests: bangladesh ----


# ---- autopilot-generated coverage tests: thailand ----
THAILAND_SSI_COVERAGE = [
    ("SICOTHBKXXX", "Siam Commercial Bank", {"USD", "EUR", "GBP", "JPY", "SGD", "HKD", "AUD", "CAD", "CHF", "DKK", "NZD", "SEK"}),
]

class TestThailandSsiCoverage:

    def test_thailand_banks_have_seeded_ssi_records(self):
        manifest_expected = _manifest_seedable_coverage("thailand")
        generated_expected = {bic: (bank_name, currencies) for bic, bank_name, currencies in THAILAND_SSI_COVERAGE}
        assert generated_expected == manifest_expected
        seeded = {}
        for record in SSI_RECORDS:
            seeded.setdefault(record[0], set()).add(record[2])
        for bic, (bank_name, currencies) in manifest_expected.items():
            missing = currencies - seeded.get(bic, set())
            assert not missing, f"{bank_name} ({bic}) is missing seeded SSI records for: {sorted(missing)}"

    def test_thailand_banks_are_in_the_bank_directory(self):
        bank_bics = {row[0] for row in BANKS}
        manifest_expected = _manifest_seedable_coverage("thailand")
        missing = [bic for bic in manifest_expected if bic not in bank_bics]
        assert not missing, (
            f"thailand SSI beneficiaries must also be seeded in BANKS so "
            f"Explore can show their settlement instructions: {missing}"
        )

    def test_thailand_seeded_records_are_semantically_valid(self):
        _assert_manifest_region_records("thailand", SSI_RECORDS, BANKS)
# ---- end autopilot-generated coverage tests: thailand ----


# ---- autopilot-generated coverage tests: andean ----
ANDEAN_SSI_COVERAGE = [
    ("CAFECOBBXXX", "Banco Davivienda S.A.", {"EUR", "USD"}),
    ("BINPPEPLXXX", "Banco Internacional del Peru (Interbank)", {"AUD", "CAD", "CHF", "CNY", "EUR", "GBP", "HKD", "JPY", "MXN", "USD"}),
    ("BECHCLRMXXX", "Banco del Estado de Chile (BancoEstado)", {"AUD", "CAD", "CHF", "DKK", "EUR", "GBP", "HKD", "MXN", "NOK", "SEK", "USD"}),
]

class TestAndeanSsiCoverage:

    def test_andean_banks_have_seeded_ssi_records(self):
        manifest_expected = _manifest_seedable_coverage("andean")
        generated_expected = {bic: (bank_name, currencies) for bic, bank_name, currencies in ANDEAN_SSI_COVERAGE}
        assert generated_expected == manifest_expected
        seeded = {}
        for record in SSI_RECORDS:
            seeded.setdefault(record[0], set()).add(record[2])
        for bic, (bank_name, currencies) in manifest_expected.items():
            missing = currencies - seeded.get(bic, set())
            assert not missing, f"{bank_name} ({bic}) is missing seeded SSI records for: {sorted(missing)}"

    def test_andean_banks_are_in_the_bank_directory(self):
        bank_bics = {row[0] for row in BANKS}
        manifest_expected = _manifest_seedable_coverage("andean")
        missing = [bic for bic in manifest_expected if bic not in bank_bics]
        assert not missing, (
            f"andean SSI beneficiaries must also be seeded in BANKS so "
            f"Explore can show their settlement instructions: {missing}"
        )

    def test_andean_seeded_records_are_semantically_valid(self):
        _assert_manifest_region_records("andean", SSI_RECORDS, BANKS)
# ---- end autopilot-generated coverage tests: andean ----


# ---- autopilot-generated coverage tests: india ----
INDIA_SSI_COVERAGE = [
    ("HDFCINBBXXX", "HDFC Bank", {"AED", "EUR", "GBP", "HKD", "JPY", "SGD", "USD"}),
    ("ICICINBBXXX", "ICICI Bank", {"AED", "EUR", "GBP", "HKD", "JPY", "SGD", "USD"}),
    ("SBININBBXXX", "State Bank of India", {"AED", "EUR", "GBP", "HKD", "JPY", "SGD", "USD"}),
    ("AXISINBBXXX", "Axis Bank", {"AED", "EUR", "GBP", "HKD", "JPY", "SGD", "USD"}),
    ("KKBKINBBXXX", "Kotak Mahindra Bank", {"EUR", "GBP", "JPY", "USD"}),
    ("BARBINBBXXX", "Bank of Baroda", {"EUR", "GBP", "JPY", "USD"}),
]

class TestIndiaSsiCoverage:

    def test_india_banks_have_seeded_ssi_records(self):
        manifest_expected = _manifest_seedable_coverage("india")
        generated_expected = {bic: (bank_name, currencies) for bic, bank_name, currencies in INDIA_SSI_COVERAGE}
        assert generated_expected == manifest_expected
        seeded = {}
        for record in SSI_RECORDS:
            seeded.setdefault(record[0], set()).add(record[2])
        for bic, (bank_name, currencies) in manifest_expected.items():
            missing = currencies - seeded.get(bic, set())
            assert not missing, f"{bank_name} ({bic}) is missing seeded SSI records for: {sorted(missing)}"

    def test_india_banks_are_in_the_bank_directory(self):
        bank_bics = {row[0] for row in BANKS}
        manifest_expected = _manifest_seedable_coverage("india")
        missing = [bic for bic in manifest_expected if bic not in bank_bics]
        assert not missing, (
            f"india SSI beneficiaries must also be seeded in BANKS so "
            f"Explore can show their settlement instructions: {missing}"
        )

    def test_india_seeded_records_are_semantically_valid(self):
        _assert_manifest_region_records("india", SSI_RECORDS, BANKS)
# ---- end autopilot-generated coverage tests: india ----


# ---- autopilot-generated coverage tests: mexico-central-america ----
MEXICO_CENTRAL_AMERICA_SSI_COVERAGE = [
    ("MENOMXMTXXX", "Banco Mercantil del Norte (Banorte) - Mexico", {"AUD", "CAD", "CHF", "EUR", "GBP", "JPY", "NOK", "SEK", "USD"}),
    ("BAGEPAPAXXX", "Banco General S.A. - Panama", {"AUD", "CAD", "CHF", "CNH", "DKK", "EUR", "GBP", "HKD", "JPY", "MXN", "NOK", "SEK", "USD", "ZAR"}),
    ("CAGRSVSSXXX", "Banco Agricola S.A. - El Salvador", {"CAD", "CHF", "EUR", "GBP", "JPY", "MXN", "USD"}),
]

class TestMexicoCentralAmericaSsiCoverage:

    def test_mexico_central_america_banks_have_seeded_ssi_records(self):
        manifest_expected = _manifest_seedable_coverage("mexico-central-america")
        generated_expected = {bic: (bank_name, currencies) for bic, bank_name, currencies in MEXICO_CENTRAL_AMERICA_SSI_COVERAGE}
        assert generated_expected == manifest_expected
        seeded = {}
        for record in SSI_RECORDS:
            seeded.setdefault(record[0], set()).add(record[2])
        for bic, (bank_name, currencies) in manifest_expected.items():
            missing = currencies - seeded.get(bic, set())
            assert not missing, f"{bank_name} ({bic}) is missing seeded SSI records for: {sorted(missing)}"

    def test_mexico_central_america_banks_are_in_the_bank_directory(self):
        bank_bics = {row[0] for row in BANKS}
        manifest_expected = _manifest_seedable_coverage("mexico-central-america")
        missing = [bic for bic in manifest_expected if bic not in bank_bics]
        assert not missing, (
            f"mexico-central-america SSI beneficiaries must also be seeded in BANKS so "
            f"Explore can show their settlement instructions: {missing}"
        )

    def test_mexico_central_america_seeded_records_are_semantically_valid(self):
        _assert_manifest_region_records("mexico-central-america", SSI_RECORDS, BANKS)
# ---- end autopilot-generated coverage tests: mexico-central-america ----


# ---- autopilot-generated coverage tests: west-africa ----
WEST_AFRICA_SSI_COVERAGE = [
    ("GHCBGHACXXX", "GCB Bank (Ghana)", {"USD", "EUR"}),
]

class TestWestAfricaSsiCoverage:

    def test_west_africa_banks_have_seeded_ssi_records(self):
        manifest_expected = _manifest_seedable_coverage("west-africa")
        generated_expected = {bic: (bank_name, currencies) for bic, bank_name, currencies in WEST_AFRICA_SSI_COVERAGE}
        assert generated_expected == manifest_expected
        seeded = {}
        for record in SSI_RECORDS:
            seeded.setdefault(record[0], set()).add(record[2])
        for bic, (bank_name, currencies) in manifest_expected.items():
            missing = currencies - seeded.get(bic, set())
            assert not missing, f"{bank_name} ({bic}) is missing seeded SSI records for: {sorted(missing)}"

    def test_west_africa_banks_are_in_the_bank_directory(self):
        bank_bics = {row[0] for row in BANKS}
        manifest_expected = _manifest_seedable_coverage("west-africa")
        missing = [bic for bic in manifest_expected if bic not in bank_bics]
        assert not missing, (
            f"west-africa SSI beneficiaries must also be seeded in BANKS so "
            f"Explore can show their settlement instructions: {missing}"
        )

    def test_west_africa_seeded_records_are_semantically_valid(self):
        _assert_manifest_region_records("west-africa", SSI_RECORDS, BANKS)
# ---- end autopilot-generated coverage tests: west-africa ----


# ---- autopilot-generated coverage tests: eastern-europe ----
EASTERN_EUROPE_SSI_COVERAGE = [
    ("BTRLRO22XXX", "Banca Transilvania", {"USD", "EUR", "GBP", "RON", "HUF", "AUD", "CAD", "CHF", "DKK", "JPY", "NOK", "PLN", "SEK", "TRY"}),
]

class TestEasternEuropeSsiCoverage:

    def test_eastern_europe_banks_have_seeded_ssi_records(self):
        manifest_expected = _manifest_seedable_coverage("eastern-europe")
        generated_expected = {bic: (bank_name, currencies) for bic, bank_name, currencies in EASTERN_EUROPE_SSI_COVERAGE}
        assert generated_expected == manifest_expected
        seeded = {}
        for record in SSI_RECORDS:
            seeded.setdefault(record[0], set()).add(record[2])
        for bic, (bank_name, currencies) in manifest_expected.items():
            missing = currencies - seeded.get(bic, set())
            assert not missing, f"{bank_name} ({bic}) is missing seeded SSI records for: {sorted(missing)}"

    def test_eastern_europe_banks_are_in_the_bank_directory(self):
        bank_bics = {row[0] for row in BANKS}
        manifest_expected = _manifest_seedable_coverage("eastern-europe")
        missing = [bic for bic in manifest_expected if bic not in bank_bics]
        assert not missing, (
            f"eastern-europe SSI beneficiaries must also be seeded in BANKS so "
            f"Explore can show their settlement instructions: {missing}"
        )

    def test_eastern_europe_seeded_records_are_semantically_valid(self):
        _assert_manifest_region_records("eastern-europe", SSI_RECORDS, BANKS)
# ---- end autopilot-generated coverage tests: eastern-europe ----


# ---- autopilot-generated coverage tests: singapore ----
SINGAPORE_SSI_COVERAGE = [
    ("OCBCSGSGXXX", "Oversea-Chinese Banking Corporation Limited", {"USD"}),
    ("UOVBSGSGXXX", "United Overseas Bank Limited", {"AED", "AUD", "BND", "CAD", "CHF", "DKK", "EUR", "GBP", "HKD", "IDR", "INR", "JPY", "NOK", "NZD", "CNY", "SEK", "USD"}),
]

class TestSingaporeSsiCoverage:

    def test_singapore_banks_have_seeded_ssi_records(self):
        manifest_expected = _manifest_seedable_coverage("singapore")
        generated_expected = {bic: (bank_name, currencies) for bic, bank_name, currencies in SINGAPORE_SSI_COVERAGE}
        assert generated_expected == manifest_expected
        seeded = {}
        for record in SSI_RECORDS:
            seeded.setdefault(record[0], set()).add(record[2])
        for bic, (bank_name, currencies) in manifest_expected.items():
            missing = currencies - seeded.get(bic, set())
            assert not missing, f"{bank_name} ({bic}) is missing seeded SSI records for: {sorted(missing)}"

    def test_singapore_banks_are_in_the_bank_directory(self):
        bank_bics = {row[0] for row in BANKS}
        manifest_expected = _manifest_seedable_coverage("singapore")
        missing = [bic for bic in manifest_expected if bic not in bank_bics]
        assert not missing, (
            f"singapore SSI beneficiaries must also be seeded in BANKS so "
            f"Explore can show their settlement instructions: {missing}"
        )

    def test_singapore_seeded_records_are_semantically_valid(self):
        _assert_manifest_region_records("singapore", SSI_RECORDS, BANKS)
# ---- end autopilot-generated coverage tests: singapore ----


# ---- autopilot-generated coverage tests: indonesia ----
INDONESIA_SSI_COVERAGE = [
    ("BBUKIDJAXXX", "PT Bank KB Bukopin Tbk", {"AUD", "EUR", "GBP", "HKD", "JPY", "MYR", "SGD", "USD"}),
]

class TestIndonesiaSsiCoverage:

    def test_indonesia_banks_have_seeded_ssi_records(self):
        manifest_expected = _manifest_seedable_coverage("indonesia")
        generated_expected = {bic: (bank_name, currencies) for bic, bank_name, currencies in INDONESIA_SSI_COVERAGE}
        assert generated_expected == manifest_expected
        seeded = {}
        for record in SSI_RECORDS:
            seeded.setdefault(record[0], set()).add(record[2])
        for bic, (bank_name, currencies) in manifest_expected.items():
            missing = currencies - seeded.get(bic, set())
            assert not missing, f"{bank_name} ({bic}) is missing seeded SSI records for: {sorted(missing)}"

    def test_indonesia_banks_are_in_the_bank_directory(self):
        bank_bics = {row[0] for row in BANKS}
        manifest_expected = _manifest_seedable_coverage("indonesia")
        missing = [bic for bic in manifest_expected if bic not in bank_bics]
        assert not missing, (
            f"indonesia SSI beneficiaries must also be seeded in BANKS so "
            f"Explore can show their settlement instructions: {missing}"
        )

    def test_indonesia_seeded_records_are_semantically_valid(self):
        _assert_manifest_region_records("indonesia", SSI_RECORDS, BANKS)
# ---- end autopilot-generated coverage tests: indonesia ----

# ---- autopilot-generated coverage tests: uganda ----
UGANDA_SSI_COVERAGE = [
    ("CERBUGKAXXX", "Centenary Rural Development Bank Limited (Centenary Bank Uganda)", {"CNY", "EUR", "GBP", "KES", "USD", "ZAR"}),
    ("SBICUGKXXXX", "Stanbic Bank Uganda Limited", {"CAD", "CHF", "CNY", "DKK", "EUR", "GBP", "JPY", "KES", "SEK", "TZS", "USD", "ZAR"}),
]

class TestUgandaSsiCoverage:

    def test_uganda_banks_have_seeded_ssi_records(self):
        manifest_expected = _manifest_seedable_coverage("uganda")
        generated_expected = {bic: (bank_name, currencies) for bic, bank_name, currencies in UGANDA_SSI_COVERAGE}
        assert generated_expected == manifest_expected
        seeded = {}
        for record in SSI_RECORDS:
            seeded.setdefault(record[0], set()).add(record[2])
        for bic, (bank_name, currencies) in manifest_expected.items():
            missing = currencies - seeded.get(bic, set())
            assert not missing, f"{bank_name} ({bic}) is missing seeded SSI records for: {sorted(missing)}"

    def test_uganda_banks_are_in_the_bank_directory(self):
        bank_bics = {row[0] for row in BANKS}
        manifest_expected = _manifest_seedable_coverage("uganda")
        missing = [bic for bic in manifest_expected if bic not in bank_bics]
        assert not missing, (
            f"uganda SSI beneficiaries must also be seeded in BANKS so "
            f"Explore can show their settlement instructions: {missing}"
        )

    def test_uganda_seeded_records_are_semantically_valid(self):
        _assert_manifest_region_records("uganda", SSI_RECORDS, BANKS)
# ---- end autopilot-generated coverage tests: uganda ----


# ---- autopilot-generated coverage tests: hong-kong ----
HONG_KONG_SSI_COVERAGE = [
    ("BEASHKHHXXX", "The Bank of East Asia, Limited", {"AUD", "CAD", "CHF", "CNY", "DKK", "EUR", "JPY", "MYR", "NOK", "NZD", "PHP", "SEK", "SGD", "THB", "USD"}),
    ("HASEHKHHXXX", "Hang Seng Bank Limited", {"AUD", "CAD", "CHF", "CNY", "DKK", "EUR", "GBP", "JPY", "NOK", "NZD", "SEK", "SGD", "THB", "USD", "ZAR"}),
]

class TestHongKongSsiCoverage:

    def test_hong_kong_banks_have_seeded_ssi_records(self):
        manifest_expected = _manifest_seedable_coverage("hong-kong")
        generated_expected = {bic: (bank_name, currencies) for bic, bank_name, currencies in HONG_KONG_SSI_COVERAGE}
        assert generated_expected == manifest_expected
        seeded = {}
        for record in SSI_RECORDS:
            seeded.setdefault(record[0], set()).add(record[2])
        for bic, (bank_name, currencies) in manifest_expected.items():
            missing = currencies - seeded.get(bic, set())
            assert not missing, f"{bank_name} ({bic}) is missing seeded SSI records for: {sorted(missing)}"

    def test_hong_kong_banks_are_in_the_bank_directory(self):
        bank_bics = {row[0] for row in BANKS}
        manifest_expected = _manifest_seedable_coverage("hong-kong")
        missing = [bic for bic in manifest_expected if bic not in bank_bics]
        assert not missing, (
            f"hong-kong SSI beneficiaries must also be seeded in BANKS so "
            f"Explore can show their settlement instructions: {missing}"
        )

    def test_hong_kong_seeded_records_are_semantically_valid(self):
        _assert_manifest_region_records("hong-kong", SSI_RECORDS, BANKS)
# ---- end autopilot-generated coverage tests: hong-kong ----


# ---- autopilot-generated coverage tests: taiwan ----
TAIWAN_SSI_COVERAGE = [
    ("ESUNTWTPXXX", "E.SUN Commercial Bank, Ltd.", {"AUD", "CAD", "CHF", "CNY", "EUR", "GBP", "HKD", "JPY", "MXN", "NZD", "SEK", "SGD", "THB", "USD", "ZAR"}),
    ("HNBKTWTPXXX", "Hua Nan Commercial Bank, Ltd.", {"AUD", "CAD", "CHF", "EUR", "GBP", "HKD", "JPY", "NZD", "SEK", "SGD", "THB", "USD", "ZAR"}),
]

class TestTaiwanSsiCoverage:

    def test_taiwan_banks_have_seeded_ssi_records(self):
        manifest_expected = _manifest_seedable_coverage("taiwan")
        generated_expected = {bic: (bank_name, currencies) for bic, bank_name, currencies in TAIWAN_SSI_COVERAGE}
        assert generated_expected == manifest_expected
        seeded = {}
        for record in SSI_RECORDS:
            seeded.setdefault(record[0], set()).add(record[2])
        for bic, (bank_name, currencies) in manifest_expected.items():
            missing = currencies - seeded.get(bic, set())
            assert not missing, f"{bank_name} ({bic}) is missing seeded SSI records for: {sorted(missing)}"

    def test_taiwan_banks_are_in_the_bank_directory(self):
        bank_bics = {row[0] for row in BANKS}
        manifest_expected = _manifest_seedable_coverage("taiwan")
        missing = [bic for bic in manifest_expected if bic not in bank_bics]
        assert not missing, (
            f"taiwan SSI beneficiaries must also be seeded in BANKS so "
            f"Explore can show their settlement instructions: {missing}"
        )

    def test_taiwan_seeded_records_are_semantically_valid(self):
        _assert_manifest_region_records("taiwan", SSI_RECORDS, BANKS)
# ---- end autopilot-generated coverage tests: taiwan ----


# ---- autopilot-generated coverage tests: canada ----
CANADA_SSI_COVERAGE = [
    ("CIBCCATTXXX", "Canadian Imperial Bank of Commerce", {"USD"}),
    ("ROYCCAT2XXX", "Royal Bank of Canada", {"AUD", "CHF", "DKK", "EUR", "GBP", "HKD", "JPY", "MXN", "NOK", "NZD", "SEK", "SGD", "USD", "ZAR"}),
]

class TestCanadaSsiCoverage:

    def test_canada_banks_have_seeded_ssi_records(self):
        manifest_expected = _manifest_seedable_coverage("canada")
        generated_expected = {bic: (bank_name, currencies) for bic, bank_name, currencies in CANADA_SSI_COVERAGE}
        assert generated_expected == manifest_expected
        seeded = {}
        for record in SSI_RECORDS:
            seeded.setdefault(record[0], set()).add(record[2])
        for bic, (bank_name, currencies) in manifest_expected.items():
            missing = currencies - seeded.get(bic, set())
            assert not missing, f"{bank_name} ({bic}) is missing seeded SSI records for: {sorted(missing)}"

    def test_canada_banks_are_in_the_bank_directory(self):
        bank_bics = {row[0] for row in BANKS}
        manifest_expected = _manifest_seedable_coverage("canada")
        missing = [bic for bic in manifest_expected if bic not in bank_bics]
        assert not missing, (
            f"canada SSI beneficiaries must also be seeded in BANKS so "
            f"Explore can show their settlement instructions: {missing}"
        )

    def test_canada_seeded_records_are_semantically_valid(self):
        _assert_manifest_region_records("canada", SSI_RECORDS, BANKS)
# ---- end autopilot-generated coverage tests: canada ----


# ---- autopilot-generated coverage tests: gulf ----
GULF_SSI_COVERAGE = [
    ("EBILAEADXXX", "Emirates NBD Bank (P.J.S.C.)", {"BHD", "EUR", "GBP", "KWD", "OMR", "QAR", "SAR", "USD"}),
    ("NBOKKWKWXXX", "National Bank of Kuwait (S.A.K.P.)", {"AED", "AUD", "BHD", "CAD", "CHF", "CNY", "DKK", "EGP", "EUR", "GBP", "HKD", "INR", "JOD", "JPY", "KRW", "KWD", "LKR", "NOK", "OMR", "PHP", "PKR", "QAR", "SAR", "SEK", "SGD", "USD"}),
]

class TestGulfSsiCoverage:

    def test_gulf_banks_have_seeded_ssi_records(self):
        manifest_expected = _manifest_seedable_coverage("gulf")
        generated_expected = {bic: (bank_name, currencies) for bic, bank_name, currencies in GULF_SSI_COVERAGE}
        assert generated_expected == manifest_expected
        seeded = {}
        for record in SSI_RECORDS:
            seeded.setdefault(record[0], set()).add(record[2])
        for bic, (bank_name, currencies) in manifest_expected.items():
            missing = currencies - seeded.get(bic, set())
            assert not missing, f"{bank_name} ({bic}) is missing seeded SSI records for: {sorted(missing)}"

    def test_gulf_banks_are_in_the_bank_directory(self):
        bank_bics = {row[0] for row in BANKS}
        manifest_expected = _manifest_seedable_coverage("gulf")
        missing = [bic for bic in manifest_expected if bic not in bank_bics]
        assert not missing, (
            f"gulf SSI beneficiaries must also be seeded in BANKS so "
            f"Explore can show their settlement instructions: {missing}"
        )

    def test_gulf_seeded_records_are_semantically_valid(self):
        _assert_manifest_region_records("gulf", SSI_RECORDS, BANKS)
# ---- end autopilot-generated coverage tests: gulf ----


# ---- autopilot-generated coverage tests: pakistan ----
PAKISTAN_SSI_COVERAGE = [
    ("ALFHPKKAXXX", "Bank Alfalah Limited", {"AED", "AUD", "CAD", "CHF", "CNY", "DKK", "EUR", "GBP", "HKD", "JPY", "SAR", "SEK", "SGD", "USD"}),
]

class TestPakistanSsiCoverage:

    def test_pakistan_banks_have_seeded_ssi_records(self):
        manifest_expected = _manifest_seedable_coverage("pakistan")
        generated_expected = {bic: (bank_name, currencies) for bic, bank_name, currencies in PAKISTAN_SSI_COVERAGE}
        assert generated_expected == manifest_expected
        seeded = {}
        for record in SSI_RECORDS:
            seeded.setdefault(record[0], set()).add(record[2])
        for bic, (bank_name, currencies) in manifest_expected.items():
            missing = currencies - seeded.get(bic, set())
            assert not missing, f"{bank_name} ({bic}) is missing seeded SSI records for: {sorted(missing)}"

    def test_pakistan_banks_are_in_the_bank_directory(self):
        bank_bics = {row[0] for row in BANKS}
        manifest_expected = _manifest_seedable_coverage("pakistan")
        missing = [bic for bic in manifest_expected if bic not in bank_bics]
        assert not missing, (
            f"pakistan SSI beneficiaries must also be seeded in BANKS so "
            f"Explore can show their settlement instructions: {missing}"
        )

    def test_pakistan_seeded_records_are_semantically_valid(self):
        _assert_manifest_region_records("pakistan", SSI_RECORDS, BANKS)
# ---- end autopilot-generated coverage tests: pakistan ----


# ---- autopilot-generated coverage tests: japan ----
JAPAN_SSI_COVERAGE = [
    ("DNEXJPJTXXX", "Daiwa Next Bank, Ltd.", {"AUD", "CAD", "CNY", "EUR", "GBP", "HKD", "MXN", "NZD", "SGD", "TRY", "USD", "ZAR"}),
    ("JICRJPJTXXX", "au Jibun Bank Corporation", {"AUD", "EUR", "USD"}),
    ("RAKTJPJTXXX", "Rakuten Bank, Ltd.", {"AUD", "EUR", "GBP", "JPY", "NZD", "USD", "ZAR"}),
]

class TestJapanSsiCoverage:

    def test_japan_banks_have_seeded_ssi_records(self):
        manifest_expected = _manifest_seedable_coverage("japan")
        generated_expected = {bic: (bank_name, currencies) for bic, bank_name, currencies in JAPAN_SSI_COVERAGE}
        assert generated_expected == manifest_expected
        seeded = {}
        for record in SSI_RECORDS:
            seeded.setdefault(record[0], set()).add(record[2])
        for bic, (bank_name, currencies) in manifest_expected.items():
            missing = currencies - seeded.get(bic, set())
            assert not missing, f"{bank_name} ({bic}) is missing seeded SSI records for: {sorted(missing)}"

    def test_japan_banks_are_in_the_bank_directory(self):
        bank_bics = {row[0] for row in BANKS}
        manifest_expected = _manifest_seedable_coverage("japan")
        missing = [bic for bic in manifest_expected if bic not in bank_bics]
        assert not missing, (
            f"japan SSI beneficiaries must also be seeded in BANKS so "
            f"Explore can show their settlement instructions: {missing}"
        )

    def test_japan_seeded_records_are_semantically_valid(self):
        _assert_manifest_region_records("japan", SSI_RECORDS, BANKS)
# ---- end autopilot-generated coverage tests: japan ----


# ---- autopilot-generated coverage tests: western-europe ----
WESTERN_EUROPE_SSI_COVERAGE = [
    ("AREBESMMXXX", "ARESBANK, S.A.", {"GBP", "KWD", "USD"}),
    ("BAPPIT22XXX", "BANCO BPM SPA", {"CAD", "CHF", "CNY", "CZK", "DKK", "GBP", "HUF", "ILS", "JPY", "USD"}),
    ("CCRTIT2TXXX", "CASSA CENTRALE BANCA - CREDITO COOPERATIVO ITALIANO S.P.A.", {"CAD", "CHF", "EUR", "GBP", "USD"}),
    ("CRBAGRAAXXX", "ALPHA BANK S.A.", {"AUD", "CAD", "CHF", "CNY", "CZK", "DKK", "HKD", "JPY", "NOK"}),
]

class TestWesternEuropeSsiCoverage:

    def test_western_europe_banks_have_seeded_ssi_records(self):
        manifest_expected = _manifest_seedable_coverage("western-europe")
        generated_expected = {bic: (bank_name, currencies) for bic, bank_name, currencies in WESTERN_EUROPE_SSI_COVERAGE}
        assert generated_expected == manifest_expected
        seeded = {}
        for record in SSI_RECORDS:
            seeded.setdefault(record[0], set()).add(record[2])
        for bic, (bank_name, currencies) in manifest_expected.items():
            missing = currencies - seeded.get(bic, set())
            assert not missing, f"{bank_name} ({bic}) is missing seeded SSI records for: {sorted(missing)}"

    def test_western_europe_banks_are_in_the_bank_directory(self):
        bank_bics = {row[0] for row in BANKS}
        manifest_expected = _manifest_seedable_coverage("western-europe")
        missing = [bic for bic in manifest_expected if bic not in bank_bics]
        assert not missing, (
            f"western-europe SSI beneficiaries must also be seeded in BANKS so "
            f"Explore can show their settlement instructions: {missing}"
        )

    def test_western_europe_seeded_records_are_semantically_valid(self):
        _assert_manifest_region_records("western-europe", SSI_RECORDS, BANKS)
# ---- end autopilot-generated coverage tests: western-europe ----


# ---- autopilot-generated coverage tests: mauritius ----
MAURITIUS_SSI_COVERAGE = [
    ("AFBLMUMUXXX", "AfrAsia Bank Limited", {"AED", "BWP", "CAD", "CNY", "EUR", "GBP", "GHS", "HKD", "IDR", "INR", "JPY", "KES", "MUR", "NAD", "NGN", "RWF", "THB", "TZS", "UGX", "USD", "XAF", "XOF", "ZAR", "ZMW"}),
    ("MPCBMUMUXXX", "MauBank Ltd", {"AED", "AUD", "CAD", "CHF", "CNY", "EUR", "GBP", "HKD", "INR", "JPY", "SAR", "SGD", "USD", "ZAR"}),
]

class TestMauritiusSsiCoverage:

    def test_mauritius_banks_have_seeded_ssi_records(self):
        manifest_expected = _manifest_seedable_coverage("mauritius")
        generated_expected = {bic: (bank_name, currencies) for bic, bank_name, currencies in MAURITIUS_SSI_COVERAGE}
        assert generated_expected == manifest_expected
        seeded = {}
        for record in SSI_RECORDS:
            seeded.setdefault(record[0], set()).add(record[2])
        for bic, (bank_name, currencies) in manifest_expected.items():
            missing = currencies - seeded.get(bic, set())
            assert not missing, f"{bank_name} ({bic}) is missing seeded SSI records for: {sorted(missing)}"

    def test_mauritius_banks_are_in_the_bank_directory(self):
        bank_bics = {row[0] for row in BANKS}
        manifest_expected = _manifest_seedable_coverage("mauritius")
        missing = [bic for bic in manifest_expected if bic not in bank_bics]
        assert not missing, (
            f"mauritius SSI beneficiaries must also be seeded in BANKS so "
            f"Explore can show their settlement instructions: {missing}"
        )

    def test_mauritius_seeded_records_are_semantically_valid(self):
        _assert_manifest_region_records("mauritius", SSI_RECORDS, BANKS)
# ---- end autopilot-generated coverage tests: mauritius ----


# ---- autopilot-generated coverage tests: latam-wave2 ----
LATAM_WAVE2_SSI_COVERAGE = [
    ("BSUDPYPXXXX", "Sudameris Bank S.A.E.C.A.", {"EUR", "USD"}),
    ("COMEUYMMXXX", "Scotiabank Uruguay S.A.", {"EUR", "USD"}),
    ("FAMIPYPAXXX", "Banco Familiar S.A.E.C.A.", {"EUR", "USD"}),
    ("GNDRBO22XXX", "Banco Ganadero S.A.", {"CNY", "EUR", "JPY", "USD"}),
    ("GUAYECEGXXX", "Banco Guayaquil S.A.", {"CHF", "EUR", "GBP", "JPY", "USD"}),
    ("ITAUUYMMXXX", "Banco Itaú Uruguay S.A.", {"EUR", "GBP", "USD"}),
]

class TestLatamWave2SsiCoverage:

    def test_latam_wave2_banks_have_seeded_ssi_records(self):
        manifest_expected = _manifest_seedable_coverage("latam-wave2")
        generated_expected = {bic: (bank_name, currencies) for bic, bank_name, currencies in LATAM_WAVE2_SSI_COVERAGE}
        assert generated_expected == manifest_expected
        seeded = {}
        for record in SSI_RECORDS:
            seeded.setdefault(record[0], set()).add(record[2])
        for bic, (bank_name, currencies) in manifest_expected.items():
            missing = currencies - seeded.get(bic, set())
            assert not missing, f"{bank_name} ({bic}) is missing seeded SSI records for: {sorted(missing)}"

    def test_latam_wave2_banks_are_in_the_bank_directory(self):
        bank_bics = {row[0] for row in BANKS}
        manifest_expected = _manifest_seedable_coverage("latam-wave2")
        missing = [bic for bic in manifest_expected if bic not in bank_bics]
        assert not missing, (
            f"latam-wave2 SSI beneficiaries must also be seeded in BANKS so "
            f"Explore can show their settlement instructions: {missing}"
        )

    def test_latam_wave2_seeded_records_are_semantically_valid(self):
        _assert_manifest_region_records("latam-wave2", SSI_RECORDS, BANKS)
# ---- end autopilot-generated coverage tests: latam-wave2 ----


# ---- autopilot-generated coverage tests: africa-wave2 ----
AFRICA_WAVE2_SSI_COVERAGE = [
    ("AGRZZWHAXXX", "AFC COMMERCIAL BANK LIMITED", {"BWP", "CNY", "EUR", "GBP", "USD", "ZAR"}),
    ("BKIGRWRWXXX", "BANK OF KIGALI PLC", {"EUR", "GBP", "KES", "TZS", "USD"}),
    ("IMBLTZTZXXX", "I AND M BANK (T) LIMITED", {"EUR", "GBP", "INR", "KES", "MUR", "USD", "ZAR"}),
    ("IMRWRWRWXXX", "I AND M BANK (RWANDA) PLC", {"CAD", "EUR", "GBP", "INR", "JPY", "KES", "RWF", "TZS", "USD", "ZAR"}),
    ("NMBLZWHXXXX", "NMB BANK LIMITED", {"CNY", "EUR", "GBP", "USD"}),
]

class TestAfricaWave2SsiCoverage:

    def test_africa_wave2_banks_have_seeded_ssi_records(self):
        manifest_expected = _manifest_seedable_coverage("africa-wave2")
        generated_expected = {bic: (bank_name, currencies) for bic, bank_name, currencies in AFRICA_WAVE2_SSI_COVERAGE}
        assert generated_expected == manifest_expected
        seeded = {}
        for record in SSI_RECORDS:
            seeded.setdefault(record[0], set()).add(record[2])
        for bic, (bank_name, currencies) in manifest_expected.items():
            missing = currencies - seeded.get(bic, set())
            assert not missing, f"{bank_name} ({bic}) is missing seeded SSI records for: {sorted(missing)}"

    def test_africa_wave2_banks_are_in_the_bank_directory(self):
        bank_bics = {row[0] for row in BANKS}
        manifest_expected = _manifest_seedable_coverage("africa-wave2")
        missing = [bic for bic in manifest_expected if bic not in bank_bics]
        assert not missing, (
            f"africa-wave2 SSI beneficiaries must also be seeded in BANKS so "
            f"Explore can show their settlement instructions: {missing}"
        )

    def test_africa_wave2_seeded_records_are_semantically_valid(self):
        _assert_manifest_region_records("africa-wave2", SSI_RECORDS, BANKS)
# ---- end autopilot-generated coverage tests: africa-wave2 ----


# ---- autopilot-generated coverage tests: europe-wave2 ----
EUROPE_WAVE2_SSI_COVERAGE = [
    ("ABKLCY2NXXX", "ALPHA BANK CYPRUS LTD", {"AED", "AUD", "CAD", "CHF", "CZK", "DKK", "EUR", "GBP", "ILS", "JPY", "NOK", "NZD", "PLN", "RON", "RSD", "RUB", "SEK", "SGD", "USD", "ZAR"}),
    ("CECBBGSFXXX", "CENTRAL COOPERATIVE BANK PLC", {"CAD", "CHF", "CZK", "DKK", "EUR", "GBP", "JPY", "MKD", "NOK", "PLN", "RON", "RUB", "SEK", "TRY", "USD"}),
    ("HEBACY2NXXX", "HELLENIC BANK PUBLIC COMPANY LTD.", {"AED", "AUD", "BHD", "CAD", "CHF", "CNY", "CZK", "DKK", "EUR", "GBP"}),
]

class TestEuropeWave2SsiCoverage:

    def test_europe_wave2_banks_have_seeded_ssi_records(self):
        manifest_expected = _manifest_seedable_coverage("europe-wave2")
        generated_expected = {bic: (bank_name, currencies) for bic, bank_name, currencies in EUROPE_WAVE2_SSI_COVERAGE}
        assert generated_expected == manifest_expected
        seeded = {}
        for record in SSI_RECORDS:
            seeded.setdefault(record[0], set()).add(record[2])
        for bic, (bank_name, currencies) in manifest_expected.items():
            missing = currencies - seeded.get(bic, set())
            assert not missing, f"{bank_name} ({bic}) is missing seeded SSI records for: {sorted(missing)}"

    def test_europe_wave2_banks_are_in_the_bank_directory(self):
        bank_bics = {row[0] for row in BANKS}
        manifest_expected = _manifest_seedable_coverage("europe-wave2")
        missing = [bic for bic in manifest_expected if bic not in bank_bics]
        assert not missing, (
            f"europe-wave2 SSI beneficiaries must also be seeded in BANKS so "
            f"Explore can show their settlement instructions: {missing}"
        )

    def test_europe_wave2_seeded_records_are_semantically_valid(self):
        _assert_manifest_region_records("europe-wave2", SSI_RECORDS, BANKS)
# ---- end autopilot-generated coverage tests: europe-wave2 ----


# ---- autopilot-generated coverage tests: caucasus-central-asia-wave3 ----
CAUCASUS_CENTRAL_ASIA_WAVE3_SSI_COVERAGE = [
    ("ATYNKZKAXXX", "JSC 'ALTYN BANK' (SB OF CHINA CITIC BANK CORPORATION)", {"AED", "AUD", "CAD", "CHF", "CNY", "DKK", "EUR", "GBP", "HKD", "JPY", "SEK", "USD"}),
    ("IRTYKZKAXXX", "FORTEBANK JSC", {"AED", "AUD", "CAD", "CHF", "CNY", "EUR", "GBP", "JPY", "KGS", "RUB", "SEK", "TRY", "USD", "ZAR"}),
    ("KCJBKZKXXXX", "JSC 'BANK CENTERCREDIT'", {"AMD", "BYN", "CHF", "EUR", "GBP", "RUB", "USD"}),
    ("KZIBKZKAXXX", "KAZAKHSTAN-ZIRAAT INTERNATIONAL BANK", {"AED", "CNY", "EUR", "GBP", "JPY", "KZT", "RUB", "TRY", "USD"}),
]

class TestCaucasusCentralAsiaWave3SsiCoverage:

    def test_caucasus_central_asia_wave3_banks_have_seeded_ssi_records(self):
        manifest_expected = _manifest_seedable_coverage("caucasus-central-asia-wave3")
        generated_expected = {bic: (bank_name, currencies) for bic, bank_name, currencies in CAUCASUS_CENTRAL_ASIA_WAVE3_SSI_COVERAGE}
        assert generated_expected == manifest_expected
        seeded = {}
        for record in SSI_RECORDS:
            seeded.setdefault(record[0], set()).add(record[2])
        for bic, (bank_name, currencies) in manifest_expected.items():
            missing = currencies - seeded.get(bic, set())
            assert not missing, f"{bank_name} ({bic}) is missing seeded SSI records for: {sorted(missing)}"

    def test_caucasus_central_asia_wave3_banks_are_in_the_bank_directory(self):
        bank_bics = {row[0] for row in BANKS}
        manifest_expected = _manifest_seedable_coverage("caucasus-central-asia-wave3")
        missing = [bic for bic in manifest_expected if bic not in bank_bics]
        assert not missing, (
            f"caucasus-central-asia-wave3 SSI beneficiaries must also be seeded in BANKS so "
            f"Explore can show their settlement instructions: {missing}"
        )

    def test_caucasus_central_asia_wave3_seeded_records_are_semantically_valid(self):
        _assert_manifest_region_records("caucasus-central-asia-wave3", SSI_RECORDS, BANKS)
# ---- end autopilot-generated coverage tests: caucasus-central-asia-wave3 ----


# ---- autopilot-generated coverage tests: southasia-mekong-wave3 ----
SOUTHASIA_MEKONG_WAVE3_SSI_COVERAGE = [
    ("NSBALKLXXXX", "National Savings Bank", {"CHF", "EUR", "JPY", "SGD", "USD"}),
    ("PSBKLKLXXXX", "People's Bank", {"AED", "AUD", "CAD", "CHF", "CNY", "DKK", "EUR", "GBP", "HKD", "INR", "JPY", "NOK", "NZD", "SEK", "SGD", "USD"}),
]

class TestSouthasiaMekongWave3SsiCoverage:

    def test_southasia_mekong_wave3_banks_have_seeded_ssi_records(self):
        manifest_expected = _manifest_seedable_coverage("southasia-mekong-wave3")
        generated_expected = {bic: (bank_name, currencies) for bic, bank_name, currencies in SOUTHASIA_MEKONG_WAVE3_SSI_COVERAGE}
        assert generated_expected == manifest_expected
        seeded = {}
        for record in SSI_RECORDS:
            seeded.setdefault(record[0], set()).add(record[2])
        for bic, (bank_name, currencies) in manifest_expected.items():
            missing = currencies - seeded.get(bic, set())
            assert not missing, f"{bank_name} ({bic}) is missing seeded SSI records for: {sorted(missing)}"

    def test_southasia_mekong_wave3_banks_are_in_the_bank_directory(self):
        bank_bics = {row[0] for row in BANKS}
        manifest_expected = _manifest_seedable_coverage("southasia-mekong-wave3")
        missing = [bic for bic in manifest_expected if bic not in bank_bics]
        assert not missing, (
            f"southasia-mekong-wave3 SSI beneficiaries must also be seeded in BANKS so "
            f"Explore can show their settlement instructions: {missing}"
        )

    def test_southasia_mekong_wave3_seeded_records_are_semantically_valid(self):
        _assert_manifest_region_records("southasia-mekong-wave3", SSI_RECORDS, BANKS)
# ---- end autopilot-generated coverage tests: southasia-mekong-wave3 ----


# ---- autopilot-generated coverage tests: southern-africa-wave3 ----
SOUTHERN_AFRICA_WAVE3_SSI_COVERAGE = [
    ("BFMXAOLUXXX", "Banco de Fomento Angola S.A.", {"AUD", "CAD", "CHF", "CNY", "DKK", "EUR", "GBP", "JPY", "NAD", "NOK", "SEK", "USD", "ZAR"}),
    ("MOZAMZMAXXX", "Moza Banco S.A.", {"AUD", "CHF", "EUR", "GBP", "JPY", "SEK", "USD", "ZAR"}),
    ("NBMAMWMWXXX", "National Bank of Malawi plc", {"CNY", "EUR", "GBP", "USD", "ZAR"}),
]

class TestSouthernAfricaWave3SsiCoverage:

    def test_southern_africa_wave3_banks_have_seeded_ssi_records(self):
        manifest_expected = _manifest_seedable_coverage("southern-africa-wave3")
        generated_expected = {bic: (bank_name, currencies) for bic, bank_name, currencies in SOUTHERN_AFRICA_WAVE3_SSI_COVERAGE}
        assert generated_expected == manifest_expected
        seeded = {}
        for record in SSI_RECORDS:
            seeded.setdefault(record[0], set()).add(record[2])
        for bic, (bank_name, currencies) in manifest_expected.items():
            missing = currencies - seeded.get(bic, set())
            assert not missing, f"{bank_name} ({bic}) is missing seeded SSI records for: {sorted(missing)}"

    def test_southern_africa_wave3_banks_are_in_the_bank_directory(self):
        bank_bics = {row[0] for row in BANKS}
        manifest_expected = _manifest_seedable_coverage("southern-africa-wave3")
        missing = [bic for bic in manifest_expected if bic not in bank_bics]
        assert not missing, (
            f"southern-africa-wave3 SSI beneficiaries must also be seeded in BANKS so "
            f"Explore can show their settlement instructions: {missing}"
        )

    def test_southern_africa_wave3_seeded_records_are_semantically_valid(self):
        _assert_manifest_region_records("southern-africa-wave3", SSI_RECORDS, BANKS)
# ---- end autopilot-generated coverage tests: southern-africa-wave3 ----
