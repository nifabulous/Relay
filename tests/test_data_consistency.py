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

import re

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.data.settlement_directory import SETTLEMENT_DIRECTORY, get_settlement_ids
from app.db import Base
from app.models import SSI, Bank, CorridorRule
from app.services.seed import BANKS, CORRIDOR_RULES, SSI_RECORDS

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
# Gulf / Middle East SSI coverage
# ---------------------------------------------------------------------------
#
# Third region pass. Three Gulf banks publish usable SSIs:
#   - Mashreq (MASHAEAD)     — full BIC-only SSI table on its own page
#                              (mashreq.com standard-settlement-instruction,
#                              archived 2026); USD via its own NY branch
#                              MSHQUS33
#   - Doha Bank (DOHBQAQA)   — 2010 "List of Nostro Accounts" (accounts
#                              printed, masked here); USD via Citibank NY
#   - NBK Kuwait (NBOKKWKW)  — 2021 SSI broadcast (IBANs printed, masked
#                              here); USD via Deutsche Bank Trust / Citi /
#                              JPMorgan NY
# FAB, ADCB, DIB, ADIB, QNB, KFH, Al Rajhi, Riyad, SNB, Bank Muscat, NBB
# and the Turkish HQs publish no usable SSIs — excluded.
#
# The seed previously carried three WRONG beneficiary BICs for these banks
# (NRBMAEAD for Mashreq, DOHAQAQA for Doha, NBOMKWKE for NBK) that match no
# published source; the bank-published values (MASHAEAD, DOHBQAQA,
# NBOKKWKW) are pinned below. Mashreq's own page also prints typos
# (U0VBSGSG, BN0RPHMM, SCBLDEFXXXX) that must never be seeded.
GULF_SSI_COVERAGE = [
    ("MASHAEADXXX", "Mashreq Bank", {"USD", "EUR", "GBP", "SAR", "KWD", "BHD", "TRY"}),
    ("DOHBQAQAXXX", "Doha Bank", {"USD", "EUR", "GBP", "SAR", "AED", "BHD"}),
    ("NBOKKWKWXXX", "National Bank of Kuwait",
     {"USD", "EUR", "GBP", "KWD", "QAR", "AED", "SAR", "CNY", "AUD", "BHD", "CAD",
      "CHF", "DKK", "EGP", "HKD", "INR", "JOD", "JPY", "KRW", "LKR", "NOK", "OMR",
      "PHP", "PKR", "SEK", "SGD"}),
    ("EBILAEADXXX", "Emirates NBD",
     {"USD", "EUR", "GBP", "SAR", "QAR", "KWD", "BHD", "OMR"}),
]


class TestGulfSsiCoverage:
    def test_gulf_banks_have_seeded_ssi_records(self):
        seeded = {}
        for record in SSI_RECORDS:
            seeded.setdefault(record[0], set()).add(record[2])
        for bic, name, currencies in GULF_SSI_COVERAGE:
            have = seeded.get(bic, set())
            missing = currencies - have
            assert not missing, (
                f"{name} ({bic}) is missing seeded SSI records for: {sorted(missing)}"
            )

    def test_gulf_banks_use_the_bank_published_bics(self):
        """The old seed keyed these banks under BICs matching no published
        source (NRBMAEAD, DOHAQAQA, NBOMKWKE). Pin the bank-published values
        and forbid the wrong ones."""
        bank_bics = {row[0] for row in BANKS}
        assert "MASHAEADXXX" in bank_bics, "Mashreq must be MASHAEAD"
        assert "DOHBQAQAXXX" in bank_bics, "Doha Bank must be DOHBQAQA"
        assert "NBOKKWKWXXX" in bank_bics, "NBK must be NBOKKWKW"
        for wrong in ("NRBMAEADXXX", "DOHAQAQAXXX", "NBOMKWKEXXX"):
            assert wrong not in bank_bics, f"Wrong BIC {wrong} still in BANKS"

    def test_kuwait_corridor_clears_through_the_published_bic(self):
        kwd_rules = [
            bic for _ccy, _country, bic, _name, corridor, _conf, _rank
            in CORRIDOR_RULES if corridor == "USD->KW"
        ]
        assert "NBOKKWKWXXX" in kwd_rules, f"USD->KW must clear via NBOKKWKW: {kwd_rules}"
        assert "NBOMKWKEXXX" not in kwd_rules

    def test_mashreq_source_typos_are_not_seeded(self):
        """Mashreq's own page prints U0VBSGSG (UOB), BN0RPHMM (BDO) and
        SCBLDEFXXXX (SCB Frankfurt) — OCR typos for real BICs. None may
        appear as an intermediary."""
        used = set()
        for record in SSI_RECORDS:
            used.add(record[3])
        for typo in ("U0VBSGSGXXX", "BN0RPHMMXXX", "SCBLDEFXXXX"):
            assert typo not in used, f"Mashreq-page typo {typo} must not be seeded"


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
    def test_ordinary_row_restated_to_bic_only_sheds_accounts(self):
        """A legacy ordinary row whose seed tuple is now bic_only must lose
        its account/charge/value fields on re-seed, or it would violate
        ck_ssi_bic_only_has_no_accounts at flush."""
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
            assert row.bic_only is True
            assert row.intermediary_account is None
            assert row.beneficiary_account is None
            assert row.charge_code is None
            assert row.value_date is None
            assert result["ssi_provenance_updated"] >= 1
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
            assert row.notes == notes
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
         _charge, _vdate, _notes, *provenance) = target
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
            assert row.notes == "Operator-corrected SSI must survive the roll-forward"
            assert result["ssi_provenance_updated"] >= 1
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
        seeded = {}
        for record in SSI_RECORDS:
            seeded.setdefault(record[0], set()).add(record[2])
        for bic, name, currencies in SOUTHEAST_ASIA_SSI_COVERAGE:
            have = seeded.get(bic, set())
            missing = currencies - have
            assert not missing, (
                f"{name} ({bic}) is missing seeded SSI records for: {sorted(missing)}"
            )

    def test_southeast_asia_banks_are_in_the_bank_directory(self):
        bank_bics = {row[0] for row in BANKS}
        missing = [
            bic for bic, _name, _currencies in SOUTHEAST_ASIA_SSI_COVERAGE
            if bic not in bank_bics
        ]
        assert not missing, (
            f"southeast-asia SSI beneficiaries must also be seeded in BANKS so "
            f"Explore can show their settlement instructions: {missing}"
        )

    def test_southeast_asia_seeded_records_are_semantically_valid(self):
        """Every seeded record for this region must satisfy the validator rules:
        masked accounts inside the region's block, charge/value dates from the
        manifest defaults, a provenance status and citation, no bic_only
        smuggled fields, and unique (beneficiary, currency, correspondent) keys.
        Pre-block-era legacy placeholders are enumerated in the manifest's
        legacy_accounts and may not be masked in-block; a new fold record can
        never join that set without an explicit manifest edit."""
        mask = re.compile(r"^ACCT-910007\d\d$")
        allowed_charge = {'SHA', 'OUR', 'BEN'}
        allowed_value = {'spot', '1d', '2d', '3d', 'T+1', 'T+2'}
        statuses = {"unverified", "illustrative", "published", "archived"}
        forbidden = {'BEIIIDJA', 'BPIPPHMM', 'CENAIDJJ'}
        legacy = {}
        banks = {bic for bic, _name, _currencies in SOUTHEAST_ASIA_SSI_COVERAGE}
        rows = [row for row in SSI_RECORDS if row[0] in banks]
        assert rows, "southeast-asia: no seeded records for the seedable banks"
        for row in rows:
            bic, ccy = row[0], row[2]
            assert bic[:8] not in forbidden, f"{bic}: BIC is on the forbidden list"
            int_acct, ben_acct, charge, vdate = row[5], row[6], row[7], row[8]
            if len(row) > 13 and row[13] is True:
                assert int_acct is None and ben_acct is None and charge is None and vdate is None, (
                    f"{bic}/{ccy}: bic_only row must not carry accounts, charge, or value date"
                )
                continue
            assert int_acct is not None and (mask.match(int_acct) or int_acct in legacy), f"{bic}/{ccy}: nostro {int_acct} is neither an ACCT-910007xx masked account nor a manifest legacy placeholder"
            assert ben_acct is not None and (mask.match(ben_acct) or ben_acct in legacy), f"{bic}/{ccy}: beneficiary account {ben_acct} is neither an ACCT-910007xx masked account nor a manifest legacy placeholder"
            assert charge in allowed_charge, f"{bic}/{ccy}: charge {charge} not in {allowed_charge}"
            assert vdate in allowed_value, f"{bic}/{ccy}: value date {vdate} not in {allowed_value}"
        for row in rows:
            bic, ccy = row[0], row[2]
            if len(row) < 12:
                continue
            if row[10] is not None:
                assert len(row[10]) == 10 and row[10][4] == "-" and row[10][7] == "-", (
                    f"{bic}/{ccy}: as_of {row[10]!r} must be written YYYY-MM-DD"
                )
            assert row[11] in statuses, f"{bic}/{ccy}: status {row[11]!r} not in {statuses}"
            assert row[9] and row[9].startswith("Source:"), (
                f"{bic}/{ccy}: notes must cite the source"
            )
        keys = [(row[0], row[2], row[3]) for row in rows]
        assert len(keys) == len(set(keys)), (
            "southeast-asia: duplicate (beneficiary, currency, correspondent) keys"
        )
# ---- end autopilot-generated coverage tests: southeast-asia ----


# ---- autopilot-generated coverage tests: bangladesh ----
BANGLADESH_SSI_COVERAGE = [
    ("AGBKBDDHXXX", "Agrani Bank", {"USD", "GBP", "EUR", "JPY", "CAD", "SGD", "CHF", "SAR", "AED", "CNY"}),
    ("EBLDBDDHXXX", "Eastern Bank PLC", {"USD", "EUR", "GBP", "JPY", "CNY", "CHF", "AUD", "SAR", "SGD", "AED"}),
]


class TestBangladeshSsiCoverage:
    def test_bangladesh_banks_have_seeded_ssi_records(self):
        seeded = {}
        for record in SSI_RECORDS:
            seeded.setdefault(record[0], set()).add(record[2])
        for bic, name, currencies in BANGLADESH_SSI_COVERAGE:
            have = seeded.get(bic, set())
            missing = currencies - have
            assert not missing, (
                f"{name} ({bic}) is missing seeded SSI records for: {sorted(missing)}"
            )

    def test_bangladesh_banks_are_in_the_bank_directory(self):
        bank_bics = {row[0] for row in BANKS}
        missing = [
            bic for bic, _name, _currencies in BANGLADESH_SSI_COVERAGE
            if bic not in bank_bics
        ]
        assert not missing, (
            f"bangladesh SSI beneficiaries must also be seeded in BANKS so "
            f"Explore can show their settlement instructions: {missing}"
        )

    def test_bangladesh_seeded_records_are_semantically_valid(self):
        """Every seeded record for this region must satisfy the validator rules:
        masked accounts inside the region's block, charge/value dates from the
        manifest defaults, a provenance status and citation, no bic_only
        smuggled fields, and unique (beneficiary, currency, correspondent) keys.
        Pre-block-era legacy placeholders are enumerated in the manifest's
        legacy_accounts and may not be masked in-block; a new fold record can
        never join that set without an explicit manifest edit."""
        mask = re.compile(r"^ACCT-910018\d\d$")
        allowed_charge = {'SHA', 'OUR', 'BEN'}
        allowed_value = {'spot', '1d', '2d', '3d', 'T+1', 'T+2'}
        statuses = {"unverified", "illustrative", "published", "archived"}
        forbidden = {'AGRABDDH', 'BRACBDDH', 'CIBBBDDH', 'DUTBBDDH', 'EBLBBDDH', 'JANABDDH', 'SCBLDEFX', 'SONABDDH'}
        legacy = {}
        banks = {bic for bic, _name, _currencies in BANGLADESH_SSI_COVERAGE}
        rows = [row for row in SSI_RECORDS if row[0] in banks]
        assert rows, "bangladesh: no seeded records for the seedable banks"
        for row in rows:
            bic, ccy = row[0], row[2]
            assert bic[:8] not in forbidden, f"{bic}: BIC is on the forbidden list"
            int_acct, ben_acct, charge, vdate = row[5], row[6], row[7], row[8]
            if len(row) > 13 and row[13] is True:
                assert int_acct is None and ben_acct is None and charge is None and vdate is None, (
                    f"{bic}/{ccy}: bic_only row must not carry accounts, charge, or value date"
                )
                continue
            assert int_acct is not None and (mask.match(int_acct) or int_acct in legacy), f"{bic}/{ccy}: nostro {int_acct} is neither an ACCT-910018xx masked account nor a manifest legacy placeholder"
            assert ben_acct is not None and (mask.match(ben_acct) or ben_acct in legacy), f"{bic}/{ccy}: beneficiary account {ben_acct} is neither an ACCT-910018xx masked account nor a manifest legacy placeholder"
            assert charge in allowed_charge, f"{bic}/{ccy}: charge {charge} not in {allowed_charge}"
            assert vdate in allowed_value, f"{bic}/{ccy}: value date {vdate} not in {allowed_value}"
        for row in rows:
            bic, ccy = row[0], row[2]
            if len(row) < 12:
                continue
            if row[10] is not None:
                assert len(row[10]) == 10 and row[10][4] == "-" and row[10][7] == "-", (
                    f"{bic}/{ccy}: as_of {row[10]!r} must be written YYYY-MM-DD"
                )
            assert row[11] in statuses, f"{bic}/{ccy}: status {row[11]!r} not in {statuses}"
            assert row[9] and row[9].startswith("Source:"), (
                f"{bic}/{ccy}: notes must cite the source"
            )
        keys = [(row[0], row[2], row[3]) for row in rows]
        assert len(keys) == len(set(keys)), (
            "bangladesh: duplicate (beneficiary, currency, correspondent) keys"
        )
# ---- end autopilot-generated coverage tests: bangladesh ----


# ---- autopilot-generated coverage tests: thailand ----
THAILAND_SSI_COVERAGE = [
    ("SICOTHBKXXX", "Siam Commercial Bank", {"USD", "EUR", "GBP", "JPY", "SGD", "HKD", "AUD", "CAD", "CHF", "DKK", "NZD", "SEK"}),
]


class TestThailandSsiCoverage:
    def test_thailand_banks_have_seeded_ssi_records(self):
        seeded = {}
        for record in SSI_RECORDS:
            seeded.setdefault(record[0], set()).add(record[2])
        for bic, name, currencies in THAILAND_SSI_COVERAGE:
            have = seeded.get(bic, set())
            missing = currencies - have
            assert not missing, (
                f"{name} ({bic}) is missing seeded SSI records for: {sorted(missing)}"
            )

    def test_thailand_banks_are_in_the_bank_directory(self):
        bank_bics = {row[0] for row in BANKS}
        missing = [
            bic for bic, _name, _currencies in THAILAND_SSI_COVERAGE
            if bic not in bank_bics
        ]
        assert not missing, (
            f"thailand SSI beneficiaries must also be seeded in BANKS so "
            f"Explore can show their settlement instructions: {missing}"
        )

    def test_thailand_seeded_records_are_semantically_valid(self):
        """Every seeded record for this region must satisfy the validator rules:
        masked accounts inside the region's block, charge/value dates from the
        manifest defaults, a provenance status and citation, no bic_only
        smuggled fields, and unique (beneficiary, currency, correspondent) keys.
        Pre-block-era legacy placeholders are enumerated in the manifest's
        legacy_accounts and may not be masked in-block; a new fold record can
        never join that set without an explicit manifest edit."""
        mask = re.compile(r"^ACCT-910021\d\d$")
        allowed_charge = {'SHA', 'OUR', 'BEN'}
        allowed_value = {'spot', '1d', '2d', '3d', 'T+1', 'T+2'}
        statuses = {"unverified", "illustrative", "published", "archived"}
        forbidden = {}
        legacy = {}
        banks = {bic for bic, _name, _currencies in THAILAND_SSI_COVERAGE}
        rows = [row for row in SSI_RECORDS if row[0] in banks]
        assert rows, "thailand: no seeded records for the seedable banks"
        for row in rows:
            bic, ccy = row[0], row[2]
            assert bic[:8] not in forbidden, f"{bic}: BIC is on the forbidden list"
            int_acct, ben_acct, charge, vdate = row[5], row[6], row[7], row[8]
            if len(row) > 13 and row[13] is True:
                assert int_acct is None and ben_acct is None and charge is None and vdate is None, (
                    f"{bic}/{ccy}: bic_only row must not carry accounts, charge, or value date"
                )
                continue
            assert int_acct is not None and (mask.match(int_acct) or int_acct in legacy), f"{bic}/{ccy}: nostro {int_acct} is neither an ACCT-910021xx masked account nor a manifest legacy placeholder"
            assert ben_acct is not None and (mask.match(ben_acct) or ben_acct in legacy), f"{bic}/{ccy}: beneficiary account {ben_acct} is neither an ACCT-910021xx masked account nor a manifest legacy placeholder"
            assert charge in allowed_charge, f"{bic}/{ccy}: charge {charge} not in {allowed_charge}"
            assert vdate in allowed_value, f"{bic}/{ccy}: value date {vdate} not in {allowed_value}"
        for row in rows:
            bic, ccy = row[0], row[2]
            if len(row) < 12:
                continue
            if row[10] is not None:
                assert len(row[10]) == 10 and row[10][4] == "-" and row[10][7] == "-", (
                    f"{bic}/{ccy}: as_of {row[10]!r} must be written YYYY-MM-DD"
                )
            assert row[11] in statuses, f"{bic}/{ccy}: status {row[11]!r} not in {statuses}"
            assert row[9] and row[9].startswith("Source:"), (
                f"{bic}/{ccy}: notes must cite the source"
            )
        keys = [(row[0], row[2], row[3]) for row in rows]
        assert len(keys) == len(set(keys)), (
            "thailand: duplicate (beneficiary, currency, correspondent) keys"
        )
# ---- end autopilot-generated coverage tests: thailand ----


# ---- autopilot-generated coverage tests: andean ----
ANDEAN_SSI_COVERAGE = [
    ("CAFECOBBXXX", "Banco Davivienda", {"USD", "EUR"}),
    ("BINPPEPLXXX", "Interbank (Peru)", {"USD", "EUR", "GBP", "CAD", "JPY", "CHF", "CNY", "HKD", "MXN", "AUD"}),
    ("BECHCLRMXXX", "BancoEstado", {"USD", "EUR", "GBP", "AUD", "CAD", "CHF", "DKK", "SEK", "NOK", "HKD", "MXN"}),
]


class TestAndeanSsiCoverage:
    def test_andean_banks_have_seeded_ssi_records(self):
        seeded = {}
        for record in SSI_RECORDS:
            seeded.setdefault(record[0], set()).add(record[2])
        for bic, name, currencies in ANDEAN_SSI_COVERAGE:
            have = seeded.get(bic, set())
            missing = currencies - have
            assert not missing, (
                f"{name} ({bic}) is missing seeded SSI records for: {sorted(missing)}"
            )

    def test_andean_banks_are_in_the_bank_directory(self):
        bank_bics = {row[0] for row in BANKS}
        missing = [
            bic for bic, _name, _currencies in ANDEAN_SSI_COVERAGE
            if bic not in bank_bics
        ]
        assert not missing, (
            f"andean SSI beneficiaries must also be seeded in BANKS so "
            f"Explore can show their settlement instructions: {missing}"
        )

    def test_andean_seeded_records_are_semantically_valid(self):
        """Every seeded record for this region must satisfy the validator rules:
        masked accounts inside the region's block, charge/value dates from the
        manifest defaults, a provenance status and citation, no bic_only
        smuggled fields, and unique (beneficiary, currency, correspondent) keys.
        Pre-block-era legacy placeholders are enumerated in the manifest's
        legacy_accounts and may not be masked in-block; a new fold record can
        never join that set without an explicit manifest edit."""
        mask = re.compile(r"^ACCT-910022\d\d$")
        allowed_charge = {'SHA', 'OUR', 'BEN'}
        allowed_value = {'spot', '1d', '2d', '3d', 'T+1', 'T+2'}
        statuses = {"unverified", "illustrative", "published", "archived"}
        forbidden = {'BBOGCOBM', 'BECECLRM', 'CAVDCOBB', 'CHBLCLRM'}
        legacy = {}
        banks = {bic for bic, _name, _currencies in ANDEAN_SSI_COVERAGE}
        rows = [row for row in SSI_RECORDS if row[0] in banks]
        assert rows, "andean: no seeded records for the seedable banks"
        for row in rows:
            bic, ccy = row[0], row[2]
            assert bic[:8] not in forbidden, f"{bic}: BIC is on the forbidden list"
            int_acct, ben_acct, charge, vdate = row[5], row[6], row[7], row[8]
            if len(row) > 13 and row[13] is True:
                assert int_acct is None and ben_acct is None and charge is None and vdate is None, (
                    f"{bic}/{ccy}: bic_only row must not carry accounts, charge, or value date"
                )
                continue
            assert int_acct is not None and (mask.match(int_acct) or int_acct in legacy), f"{bic}/{ccy}: nostro {int_acct} is neither an ACCT-910022xx masked account nor a manifest legacy placeholder"
            assert ben_acct is not None and (mask.match(ben_acct) or ben_acct in legacy), f"{bic}/{ccy}: beneficiary account {ben_acct} is neither an ACCT-910022xx masked account nor a manifest legacy placeholder"
            assert charge in allowed_charge, f"{bic}/{ccy}: charge {charge} not in {allowed_charge}"
            assert vdate in allowed_value, f"{bic}/{ccy}: value date {vdate} not in {allowed_value}"
        for row in rows:
            bic, ccy = row[0], row[2]
            if len(row) < 12:
                continue
            if row[10] is not None:
                assert len(row[10]) == 10 and row[10][4] == "-" and row[10][7] == "-", (
                    f"{bic}/{ccy}: as_of {row[10]!r} must be written YYYY-MM-DD"
                )
            assert row[11] in statuses, f"{bic}/{ccy}: status {row[11]!r} not in {statuses}"
            assert row[9] and row[9].startswith("Source:"), (
                f"{bic}/{ccy}: notes must cite the source"
            )
        keys = [(row[0], row[2], row[3]) for row in rows]
        assert len(keys) == len(set(keys)), (
            "andean: duplicate (beneficiary, currency, correspondent) keys"
        )
# ---- end autopilot-generated coverage tests: andean ----


# ---- autopilot-generated coverage tests: india ----
INDIA_SSI_COVERAGE = [
    ("HDFCINBBXXX", "HDFC Bank", {"USD", "EUR", "GBP", "JPY", "AED", "SGD", "HKD"}),
    ("ICICINBBXXX", "ICICI Bank", {"USD", "EUR", "GBP", "JPY", "AED", "SGD", "HKD"}),
    ("SBININBBXXX", "State Bank of India", {"USD", "EUR", "GBP", "JPY", "AED", "SGD", "HKD"}),
    ("AXISINBBXXX", "Axis Bank", {"USD", "EUR", "GBP", "JPY", "AED", "SGD", "HKD"}),
    ("KKBKINBBXXX", "Kotak Mahindra Bank", {"USD", "EUR", "GBP", "JPY"}),
    ("BARBINBBXXX", "Bank of Baroda", {"USD", "EUR", "GBP", "JPY"}),
]


class TestIndiaSsiCoverage:
    def test_india_banks_have_seeded_ssi_records(self):
        seeded = {}
        for record in SSI_RECORDS:
            seeded.setdefault(record[0], set()).add(record[2])
        for bic, name, currencies in INDIA_SSI_COVERAGE:
            have = seeded.get(bic, set())
            missing = currencies - have
            assert not missing, (
                f"{name} ({bic}) is missing seeded SSI records for: {sorted(missing)}"
            )

    def test_india_banks_are_in_the_bank_directory(self):
        bank_bics = {row[0] for row in BANKS}
        missing = [
            bic for bic, _name, _currencies in INDIA_SSI_COVERAGE
            if bic not in bank_bics
        ]
        assert not missing, (
            f"india SSI beneficiaries must also be seeded in BANKS so "
            f"Explore can show their settlement instructions: {missing}"
        )

    def test_india_seeded_records_are_semantically_valid(self):
        """Every seeded record for this region must satisfy the validator rules:
        masked accounts inside the region's block, charge/value dates from the
        manifest defaults, a provenance status and citation, no bic_only
        smuggled fields, and unique (beneficiary, currency, correspondent) keys.
        Pre-block-era legacy placeholders are enumerated in the manifest's
        legacy_accounts and may not be masked in-block; a new fold record can
        never join that set without an explicit manifest edit."""
        mask = re.compile(r"^ACCT-910020\d\d$")
        allowed_charge = {'SHA', 'OUR', 'BEN'}
        allowed_value = {'spot', '1d', '2d', '3d', 'T+1', 'T+2'}
        statuses = {"unverified", "illustrative", "published", "archived"}
        forbidden = {}
        legacy = {'ACCT-00221', 'ACCT-04040', 'ACCT-08664', 'ACCT-10959', 'ACCT-11287', 'ACCT-14136', 'ACCT-15341', 'ACCT-18267', 'ACCT-19225', 'ACCT-25636', 'ACCT-26403', 'ACCT-30624', 'ACCT-31894', 'ACCT-36362', 'ACCT-38765', 'ACCT-47525', 'ACCT-50240', 'ACCT-51968', 'ACCT-52667', 'ACCT-52806', 'ACCT-53522', 'ACCT-56597', 'ACCT-61923', 'ACCT-62164', 'ACCT-62402', 'ACCT-64063', 'ACCT-65817', 'ACCT-69958', 'ACCT-70868', 'ACCT-71687', 'ACCT-72219', 'ACCT-72579', 'ACCT-76369', 'ACCT-77359', 'ACCT-81303', 'ACCT-85107', 'ACCT-85203', 'ACCT-85558', 'ACCT-87329', 'ACCT-91959', 'ACCT-92540', 'ACCT-93194', 'ACCT-94791', 'ACCT-96181', 'ACCT-96184', 'ACCT-96995', 'ACCT-97173', 'ACCT-98503'}
        banks = {bic for bic, _name, _currencies in INDIA_SSI_COVERAGE}
        rows = [row for row in SSI_RECORDS if row[0] in banks]
        assert rows, "india: no seeded records for the seedable banks"
        for row in rows:
            bic, ccy = row[0], row[2]
            assert bic[:8] not in forbidden, f"{bic}: BIC is on the forbidden list"
            int_acct, ben_acct, charge, vdate = row[5], row[6], row[7], row[8]
            if len(row) > 13 and row[13] is True:
                assert int_acct is None and ben_acct is None and charge is None and vdate is None, (
                    f"{bic}/{ccy}: bic_only row must not carry accounts, charge, or value date"
                )
                continue
            assert int_acct is not None and (mask.match(int_acct) or int_acct in legacy), f"{bic}/{ccy}: nostro {int_acct} is neither an ACCT-910020xx masked account nor a manifest legacy placeholder"
            assert ben_acct is not None and (mask.match(ben_acct) or ben_acct in legacy), f"{bic}/{ccy}: beneficiary account {ben_acct} is neither an ACCT-910020xx masked account nor a manifest legacy placeholder"
            assert charge in allowed_charge, f"{bic}/{ccy}: charge {charge} not in {allowed_charge}"
            assert vdate in allowed_value, f"{bic}/{ccy}: value date {vdate} not in {allowed_value}"
        for row in rows:
            bic, ccy = row[0], row[2]
            if len(row) < 12:
                continue
            if row[10] is not None:
                assert len(row[10]) == 10 and row[10][4] == "-" and row[10][7] == "-", (
                    f"{bic}/{ccy}: as_of {row[10]!r} must be written YYYY-MM-DD"
                )
            assert row[11] in statuses, f"{bic}/{ccy}: status {row[11]!r} not in {statuses}"
            assert row[9] and row[9].startswith("Source:"), (
                f"{bic}/{ccy}: notes must cite the source"
            )
        keys = [(row[0], row[2], row[3]) for row in rows]
        assert len(keys) == len(set(keys)), (
            "india: duplicate (beneficiary, currency, correspondent) keys"
        )
# ---- end autopilot-generated coverage tests: india ----


# ---- autopilot-generated coverage tests: mexico-central-america ----
MEXICO_CENTRAL_AMERICA_SSI_COVERAGE = [
    ("MENOMXMTXXX", "Banorte (Banco Mercantil del Norte)", {"USD", "EUR", "CAD", "GBP", "CHF", "JPY", "SEK", "AUD", "NOK"}),
    ("BAGEPAPAXXX", "Banco General (Panama)", {"USD", "EUR", "GBP", "MXN", "CAD", "CHF", "JPY", "AUD", "DKK", "HKD", "NOK", "SEK", "ZAR", "CNH"}),
    ("CAGRSVSSXXX", "Banco Agricola (El Salvador)", {"USD", "EUR", "GBP", "MXN", "JPY", "CAD", "CHF"}),
]


class TestMexicoCentralAmericaSsiCoverage:
    def test_mexico_central_america_banks_have_seeded_ssi_records(self):
        seeded = {}
        for record in SSI_RECORDS:
            seeded.setdefault(record[0], set()).add(record[2])
        for bic, name, currencies in MEXICO_CENTRAL_AMERICA_SSI_COVERAGE:
            have = seeded.get(bic, set())
            missing = currencies - have
            assert not missing, (
                f"{name} ({bic}) is missing seeded SSI records for: {sorted(missing)}"
            )

    def test_mexico_central_america_banks_are_in_the_bank_directory(self):
        bank_bics = {row[0] for row in BANKS}
        missing = [
            bic for bic, _name, _currencies in MEXICO_CENTRAL_AMERICA_SSI_COVERAGE
            if bic not in bank_bics
        ]
        assert not missing, (
            f"mexico-central-america SSI beneficiaries must also be seeded in BANKS so "
            f"Explore can show their settlement instructions: {missing}"
        )

    def test_mexico_central_america_seeded_records_are_semantically_valid(self):
        """Every seeded record for this region must satisfy the validator rules:
        masked accounts inside the region's block, charge/value dates from the
        manifest defaults, a provenance status and citation, no bic_only
        smuggled fields, and unique (beneficiary, currency, correspondent) keys.
        Pre-block-era legacy placeholders are enumerated in the manifest's
        legacy_accounts and may not be masked in-block; a new fold record can
        never join that set without an explicit manifest edit."""
        mask = re.compile(r"^ACCT-910023\d\d$")
        allowed_charge = {'SHA', 'OUR', 'BEN'}
        allowed_value = {'spot', '1d', '2d', '3d', 'T+1', 'T+2'}
        statuses = {"unverified", "illustrative", "published", "archived"}
        forbidden = {'BAGEGPAP', 'BAGRESSV', 'BMEXMXMM', 'BNMXMXMM', 'CUNIGTGT'}
        legacy = {}
        banks = {bic for bic, _name, _currencies in MEXICO_CENTRAL_AMERICA_SSI_COVERAGE}
        rows = [row for row in SSI_RECORDS if row[0] in banks]
        assert rows, "mexico-central-america: no seeded records for the seedable banks"
        for row in rows:
            bic, ccy = row[0], row[2]
            assert bic[:8] not in forbidden, f"{bic}: BIC is on the forbidden list"
            int_acct, ben_acct, charge, vdate = row[5], row[6], row[7], row[8]
            if len(row) > 13 and row[13] is True:
                assert int_acct is None and ben_acct is None and charge is None and vdate is None, (
                    f"{bic}/{ccy}: bic_only row must not carry accounts, charge, or value date"
                )
                continue
            assert int_acct is not None and (mask.match(int_acct) or int_acct in legacy), f"{bic}/{ccy}: nostro {int_acct} is neither an ACCT-910023xx masked account nor a manifest legacy placeholder"
            assert ben_acct is not None and (mask.match(ben_acct) or ben_acct in legacy), f"{bic}/{ccy}: beneficiary account {ben_acct} is neither an ACCT-910023xx masked account nor a manifest legacy placeholder"
            assert charge in allowed_charge, f"{bic}/{ccy}: charge {charge} not in {allowed_charge}"
            assert vdate in allowed_value, f"{bic}/{ccy}: value date {vdate} not in {allowed_value}"
        for row in rows:
            bic, ccy = row[0], row[2]
            if len(row) < 12:
                continue
            if row[10] is not None:
                assert len(row[10]) == 10 and row[10][4] == "-" and row[10][7] == "-", (
                    f"{bic}/{ccy}: as_of {row[10]!r} must be written YYYY-MM-DD"
                )
            assert row[11] in statuses, f"{bic}/{ccy}: status {row[11]!r} not in {statuses}"
            assert row[9] and row[9].startswith("Source:"), (
                f"{bic}/{ccy}: notes must cite the source"
            )
        keys = [(row[0], row[2], row[3]) for row in rows]
        assert len(keys) == len(set(keys)), (
            "mexico-central-america: duplicate (beneficiary, currency, correspondent) keys"
        )
# ---- end autopilot-generated coverage tests: mexico-central-america ----


# ---- autopilot-generated coverage tests: west-africa ----
WEST_AFRICA_SSI_COVERAGE = [
    ("GHCBGHACXXX", "GCB Bank (Ghana)", {"USD", "EUR"}),
]


class TestWestAfricaSsiCoverage:
    def test_west_africa_banks_have_seeded_ssi_records(self):
        seeded = {}
        for record in SSI_RECORDS:
            seeded.setdefault(record[0], set()).add(record[2])
        for bic, name, currencies in WEST_AFRICA_SSI_COVERAGE:
            have = seeded.get(bic, set())
            missing = currencies - have
            assert not missing, (
                f"{name} ({bic}) is missing seeded SSI records for: {sorted(missing)}"
            )

    def test_west_africa_banks_are_in_the_bank_directory(self):
        bank_bics = {row[0] for row in BANKS}
        missing = [
            bic for bic, _name, _currencies in WEST_AFRICA_SSI_COVERAGE
            if bic not in bank_bics
        ]
        assert not missing, (
            f"west-africa SSI beneficiaries must also be seeded in BANKS so "
            f"Explore can show their settlement instructions: {missing}"
        )

    def test_west_africa_seeded_records_are_semantically_valid(self):
        """Every seeded record for this region must satisfy the validator rules:
        masked accounts inside the region's block, charge/value dates from the
        manifest defaults, a provenance status and citation, no bic_only
        smuggled fields, and unique (beneficiary, currency, correspondent) keys.
        Pre-block-era legacy placeholders are enumerated in the manifest's
        legacy_accounts and may not be masked in-block; a new fold record can
        never join that set without an explicit manifest edit."""
        mask = re.compile(r"^ACCT-910025\d\d$")
        allowed_charge = {'SHA', 'OUR', 'BEN'}
        allowed_value = {'spot', '1d', '2d', '3d', 'T+1', 'T+2'}
        statuses = {"unverified", "illustrative", "published", "archived"}
        forbidden = {'ECOCIAB', 'GHOCGHAC'}
        legacy = {}
        banks = {bic for bic, _name, _currencies in WEST_AFRICA_SSI_COVERAGE}
        rows = [row for row in SSI_RECORDS if row[0] in banks]
        assert rows, "west-africa: no seeded records for the seedable banks"
        for row in rows:
            bic, ccy = row[0], row[2]
            assert bic[:8] not in forbidden, f"{bic}: BIC is on the forbidden list"
            int_acct, ben_acct, charge, vdate = row[5], row[6], row[7], row[8]
            if len(row) > 13 and row[13] is True:
                assert int_acct is None and ben_acct is None and charge is None and vdate is None, (
                    f"{bic}/{ccy}: bic_only row must not carry accounts, charge, or value date"
                )
                continue
            assert int_acct is not None and (mask.match(int_acct) or int_acct in legacy), f"{bic}/{ccy}: nostro {int_acct} is neither an ACCT-910025xx masked account nor a manifest legacy placeholder"
            assert ben_acct is not None and (mask.match(ben_acct) or ben_acct in legacy), f"{bic}/{ccy}: beneficiary account {ben_acct} is neither an ACCT-910025xx masked account nor a manifest legacy placeholder"
            assert charge in allowed_charge, f"{bic}/{ccy}: charge {charge} not in {allowed_charge}"
            assert vdate in allowed_value, f"{bic}/{ccy}: value date {vdate} not in {allowed_value}"
        for row in rows:
            bic, ccy = row[0], row[2]
            if len(row) < 12:
                continue
            if row[10] is not None:
                assert len(row[10]) == 10 and row[10][4] == "-" and row[10][7] == "-", (
                    f"{bic}/{ccy}: as_of {row[10]!r} must be written YYYY-MM-DD"
                )
            assert row[11] in statuses, f"{bic}/{ccy}: status {row[11]!r} not in {statuses}"
            assert row[9] and row[9].startswith("Source:"), (
                f"{bic}/{ccy}: notes must cite the source"
            )
        keys = [(row[0], row[2], row[3]) for row in rows]
        assert len(keys) == len(set(keys)), (
            "west-africa: duplicate (beneficiary, currency, correspondent) keys"
        )
# ---- end autopilot-generated coverage tests: west-africa ----


# ---- autopilot-generated coverage tests: eastern-europe ----
EASTERN_EUROPE_SSI_COVERAGE = [
    ("BTRLRO22XXX", "Banca Transilvania", {"USD", "EUR", "GBP", "RON", "HUF", "AUD", "CAD", "CHF", "DKK", "JPY", "NOK", "PLN", "SEK", "TRY"}),
]


class TestEasternEuropeSsiCoverage:
    def test_eastern_europe_banks_have_seeded_ssi_records(self):
        seeded = {}
        for record in SSI_RECORDS:
            seeded.setdefault(record[0], set()).add(record[2])
        for bic, name, currencies in EASTERN_EUROPE_SSI_COVERAGE:
            have = seeded.get(bic, set())
            missing = currencies - have
            assert not missing, (
                f"{name} ({bic}) is missing seeded SSI records for: {sorted(missing)}"
            )

    def test_eastern_europe_banks_are_in_the_bank_directory(self):
        bank_bics = {row[0] for row in BANKS}
        missing = [
            bic for bic, _name, _currencies in EASTERN_EUROPE_SSI_COVERAGE
            if bic not in bank_bics
        ]
        assert not missing, (
            f"eastern-europe SSI beneficiaries must also be seeded in BANKS so "
            f"Explore can show their settlement instructions: {missing}"
        )

    def test_eastern_europe_seeded_records_are_semantically_valid(self):
        """Every seeded record for this region must satisfy the validator rules:
        masked accounts inside the region's block, charge/value dates from the
        manifest defaults, a provenance status and citation, no bic_only
        smuggled fields, and unique (beneficiary, currency, correspondent) keys.
        Pre-block-era legacy placeholders are enumerated in the manifest's
        legacy_accounts and may not be masked in-block; a new fold record can
        never join that set without an explicit manifest edit."""
        mask = re.compile(r"^ACCT-910024\d\d$")
        allowed_charge = {'SHA', 'OUR', 'BEN'}
        allowed_value = {'spot', '1d', '2d', '3d', 'T+1', 'T+2'}
        statuses = {"unverified", "illustrative", "published", "archived"}
        forbidden = {'RZBRROBU'}
        legacy = {}
        banks = {bic for bic, _name, _currencies in EASTERN_EUROPE_SSI_COVERAGE}
        rows = [row for row in SSI_RECORDS if row[0] in banks]
        assert rows, "eastern-europe: no seeded records for the seedable banks"
        for row in rows:
            bic, ccy = row[0], row[2]
            assert bic[:8] not in forbidden, f"{bic}: BIC is on the forbidden list"
            int_acct, ben_acct, charge, vdate = row[5], row[6], row[7], row[8]
            if len(row) > 13 and row[13] is True:
                assert int_acct is None and ben_acct is None and charge is None and vdate is None, (
                    f"{bic}/{ccy}: bic_only row must not carry accounts, charge, or value date"
                )
                continue
            assert int_acct is not None and (mask.match(int_acct) or int_acct in legacy), f"{bic}/{ccy}: nostro {int_acct} is neither an ACCT-910024xx masked account nor a manifest legacy placeholder"
            assert ben_acct is not None and (mask.match(ben_acct) or ben_acct in legacy), f"{bic}/{ccy}: beneficiary account {ben_acct} is neither an ACCT-910024xx masked account nor a manifest legacy placeholder"
            assert charge in allowed_charge, f"{bic}/{ccy}: charge {charge} not in {allowed_charge}"
            assert vdate in allowed_value, f"{bic}/{ccy}: value date {vdate} not in {allowed_value}"
        for row in rows:
            bic, ccy = row[0], row[2]
            if len(row) < 12:
                continue
            if row[10] is not None:
                assert len(row[10]) == 10 and row[10][4] == "-" and row[10][7] == "-", (
                    f"{bic}/{ccy}: as_of {row[10]!r} must be written YYYY-MM-DD"
                )
            assert row[11] in statuses, f"{bic}/{ccy}: status {row[11]!r} not in {statuses}"
            assert row[9] and row[9].startswith("Source:"), (
                f"{bic}/{ccy}: notes must cite the source"
            )
        keys = [(row[0], row[2], row[3]) for row in rows]
        assert len(keys) == len(set(keys)), (
            "eastern-europe: duplicate (beneficiary, currency, correspondent) keys"
        )
# ---- end autopilot-generated coverage tests: eastern-europe ----
