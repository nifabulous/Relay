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
from app.services.seed import CORRIDOR_RULES, SSI_RECORDS

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
