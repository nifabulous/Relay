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

from app.data.settlement_directory import SETTLEMENT_DIRECTORY, get_settlement_ids
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
    # BOCHK's published USD SSI routes through Bank of China New York — a
    # legitimate US clearer. Verify its CHIPS/ABA and promote to
    # SETTLEMENT_DIRECTORY before removing.
    "BKCHUS33",
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
            if row[5].removeprefix("ACCT-") in published_numbers
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
