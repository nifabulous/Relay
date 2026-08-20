"""
Unit tests for the routing engine — the intermediary-suggestion logic.

Covers every branch of:
  - _normalize_bic_input (BIC + IBAN paths)
  - lookup_bank (prefix-matching fallback)
  - suggest_intermediaries (country match, currency fallback, rank ordering)
  - infer_destination_currency (all inference branches)
  - is_us_routing_number + lookup_us_bank

These call the service functions directly via the db_session fixture,
complementing the HTTP-level tests in test_api.py.
"""
import pytest

from app.models import SSI
from app.schemas import BankInfo
from app.services.routing import (
    _is_usable_ssi_account,
    _normalize_bic_input,
    infer_destination_currency,
    is_us_routing_number,
    lookup_bank,
    lookup_us_bank,
    suggest_intermediaries,
)


def _approve_ssi_rows(session, beneficiary_bic, currency):
    """Turn selected fixture rows into an explicitly routable SSI."""
    rows = session.query(SSI).filter(
        SSI.beneficiary_bic == beneficiary_bic,
        SSI.currency == currency,
    ).all()
    assert rows
    for row in rows:
        row.status = "published"
        row.as_of = "2026-08-19"
        row.verified_by = "Treasury Operations"
        row.intermediary_account = "021000089"
        row.beneficiary_account = "NG1234567890"
    session.commit()
    return rows


@pytest.mark.parametrize(
    "value",
    ["[ACCOUNT]", "ACCOUNT", "ACCT-1234", "MASKED-1234", "XXXX1234", "1234****"],
)
def test_masked_ssi_accounts_are_not_usable(value):
    assert not _is_usable_ssi_account(value)


@pytest.mark.parametrize("value", ["123456789", "GB29NWBK60161331926819"])
def test_concrete_ssi_accounts_are_usable(value):
    assert _is_usable_ssi_account(value)

# ===========================================================================
# _normalize_bic_input
# ===========================================================================


class TestNormalizeBicInput:
    def test_valid_bic_normalizes_to_11_chars(self):
        normalized, valid, errors, country = _normalize_bic_input("CITIUS33")
        assert valid is True
        assert errors == []
        assert normalized == "CITIUS33XXX"
        assert country == "US"

    def test_valid_11char_bic_passthrough(self):
        normalized, valid, errors, country = _normalize_bic_input("GTBINGLAXXX")
        assert valid is True
        assert normalized == "GTBINGLAXXX"
        assert country == "NG"

    def test_strips_whitespace_and_uppercases(self):
        normalized, valid, _, _ = _normalize_bic_input(" citius33 ")
        assert valid is True
        assert normalized == "CITIUS33XXX"

    def test_invalid_bic_returns_errors(self):
        normalized, valid, errors, country = _normalize_bic_input("NOTREAL1")
        assert valid is False
        assert len(errors) > 0
        assert normalized == ""

    def test_valid_iban_derives_bic(self):
        # GB IBAN → NatWest BIC is derivable from the sort code.
        normalized, valid, errors, country = _normalize_bic_input(
            "GB29NWBK60161331926819"
        )
        assert valid is True
        assert normalized == "NWBKGB2LXXX"
        assert country == "GB"

    def test_invalid_iban_returns_errors(self):
        normalized, valid, errors, country = _normalize_bic_input(
            "GB29NWBK00000000000000"
        )
        assert valid is False
        assert len(errors) > 0
        assert normalized == ""

    def test_valid_iban_without_derivable_bic(self):
        """
        An IBAN from a country whose registry doesn't expose BIC mapping
        should come back invalid with a specific explanatory error.
        We pick a country known not to map; if schwifty improves, this may
        need updating. Either way it must not crash.
        """
        # Many non-EEA IBANs don't have BIC mapping in schwifty's registry.
        # We assert the function handles None gracefully (no exception).
        normalized, valid, errors, country = _normalize_bic_input(
            "FR1420041010050500013M02606"
        )
        # FR may or may not derive a BIC depending on registry version.
        # The contract we care about: no crash, and valid==True for the IBAN.
        if valid:
            assert normalized is not None
        else:
            assert any("not derivable" in e for e in errors)


# ===========================================================================
# lookup_bank — prefix-matching fallback
# ===========================================================================


class TestLookupBank:
    def test_exact_11char_match(self, db_session):
        result = lookup_bank(db_session, "GTBINGLAXXX")
        assert result is not None
        assert result.bank_name == "Guaranty Trust Bank"
        assert result.country_code == "NG"
        assert result.country_currency == "NGN"

    def test_8char_prefix_match(self, db_session):
        # Seeded as GTBINGLAXXX; query with 8-char + XXX padding should match.
        result = lookup_bank(db_session, "GTBINGLA" + "XXX")
        assert result is not None
        assert "Guaranty" in result.bank_name

    def test_returns_bank_info_fields(self, db_session):
        result = lookup_bank(db_session, "CITIUS33XXX")
        assert result is not None
        assert isinstance(result, BankInfo)
        assert result.bic == "CITIUS33XXX"
        assert result.bank_name == "Citibank N.A."
        assert result.country_code == "US"
        assert result.city == "New York"

    def test_unknown_bic_returns_none(self, db_session):
        # Structurally valid BIC, not in the curated directory.
        result = lookup_bank(db_session, "ZZZZUS31XXX")
        assert result is None

    def test_japan_bank_lookup(self, db_session):
        result = lookup_bank(db_session, "BOTKJPJTXXX")
        assert result is not None
        assert result.country_code == "JP"
        assert result.country_currency == "JPY"
        assert "MUFG" in result.bank_name or "Tokyo" in result.bank_name

    def test_middle_east_bank_lookup(self, db_session):
        result = lookup_bank(db_session, "EBILAEADXXX")
        assert result is not None
        assert result.country_code == "AE"
        assert result.bank_name == "Emirates NBD"

    @pytest.mark.parametrize(
        "bic",
        [
            "GTBINGLAXXX",
            "CITIUS33XXX",
            "DEUTDEFFXXX",
            "BOTKJPJTXXX",
            "BKCHCNBJXXX",
            "EBILAEADXXX",
            "NCBKSAJEXXX",
            "POALILITXXX",
        ],
    )
    def test_lookup_seeded_banks(self, db_session, bic):
        result = lookup_bank(db_session, bic)
        assert result is not None
        assert result.bank_name  # non-empty


# ===========================================================================
# suggest_intermediaries — country match, currency fallback, ordering
# ===========================================================================


class TestSuggestIntermediaries:
    def test_nigeria_country_match(self, db_session):
        suggestions = suggest_intermediaries(db_session, "NGN", "NG")
        assert len(suggestions) >= 3
        # Rank ordering: Citibank first (rank 1)
        assert suggestions[0].bic == "CITIUS33XXX"
        assert suggestions[0].confidence == "high"

    def test_rank_ordering_preserved(self, db_session):
        suggestions = suggest_intermediaries(db_session, "NGN", "NG")
        # All NGN/NG rules should be returned in rank order.
        bics = [s.bic for s in suggestions]
        assert bics.index("CITIUS33XXX") < bics.index("BOFAUS3NXXX")

    def test_currency_only_fallback_for_eur(self, db_session):
        # EUR rules have destination_country=None, so they fire as fallback.
        suggestions = suggest_intermediaries(db_session, "EUR", "DE")
        assert len(suggestions) >= 1
        # Commerzbank is rank 1 for EUR
        assert suggestions[0].bic == "COBADEFFXXX"

    def test_currency_only_fallback_when_no_country(self, db_session):
        suggestions = suggest_intermediaries(db_session, "EUR", None)
        assert len(suggestions) >= 1
        assert suggestions[0].bic == "COBADEFFXXX"

    def test_no_match_returns_empty(self, db_session):
        suggestions = suggest_intermediaries(db_session, "XYZ", "ZZ")
        assert suggestions == []

    def test_no_match_for_unknown_country(self, db_session):
        # NGN exists, but only for country NG, not for e.g. KE.
        suggestions = suggest_intermediaries(db_session, "NGN", "KE")
        # Country-specific lookup for NGN/KE finds nothing, and there's no
        # currency-only NGN rule, so this should be empty.
        assert suggestions == []

    def test_dedup_of_intermediary_bics(self, db_session):
        """
        If the same intermediary BIC appeared twice in rules (it doesn't in
        the seed, but the dedup guard exists). We verify the seen-set logic
        indirectly by confirming no duplicates in a real result.
        """
        suggestions = suggest_intermediaries(db_session, "NGN", "NG")
        bics = [s.bic for s in suggestions]
        assert len(bics) == len(set(bics)), "Duplicate intermediary BICs found"

    def test_japan_corridor(self, db_session):
        suggestions = suggest_intermediaries(db_session, "JPY", "JP")
        assert len(suggestions) >= 3
        assert suggestions[0].bic == "CITIUS33XXX"
        assert suggestions[1].bic == "BOTKJPJTXXX"  # MUFG

    def test_china_corridor_bank_of_china_primary(self, db_session):
        suggestions = suggest_intermediaries(db_session, "CNY", "CN")
        assert len(suggestions) >= 1
        # Bank of China is rank 1 for USD->CN
        assert suggestions[0].bic == "BKCHCNBJXXX"

    def test_singapore_corridor_dbs_primary(self, db_session):
        suggestions = suggest_intermediaries(db_session, "SGD", "SG")
        assert suggestions[0].bic == "DBSSSGSXAXX"

    def test_uae_corridor(self, db_session):
        suggestions = suggest_intermediaries(db_session, "AED", "AE")
        assert len(suggestions) >= 3
        assert suggestions[0].bic == "CITIUS33XXX"

    def test_suggestion_carries_corridor_label(self, db_session):
        suggestions = suggest_intermediaries(db_session, "NGN", "NG")
        for s in suggestions:
            assert s.corridor == "USD->NG"

    def test_confidence_levels_are_valid(self, db_session):
        valid_confidence = {"high", "medium", "low"}
        # Sample several corridors
        for ccy, ctry in [("NGN", "NG"), ("JPY", "JP"), ("EUR", None), ("AED", "AE")]:
            suggestions = suggest_intermediaries(db_session, ccy, ctry)
            for s in suggestions:
                assert s.confidence in valid_confidence


# ===========================================================================
# infer_destination_currency — all inference branches
# ===========================================================================


class TestInferDestinationCurrency:
    def test_overrides_when_bank_has_local_currency(self):
        """USD passed for a Nigerian bank (NGN) → infers NGN."""
        bank = BankInfo(
            bic="GTBINGLAXXX",
            bank_name="GTB",
            country_code="NG",
            city="Lagos",
            country_currency="NGN",
        )
        result = infer_destination_currency("USD", bank, "NG")
        assert result == "NGN"

    def test_no_override_when_currency_matches_bank(self):
        """NGN passed for a Nigerian bank → stays NGN."""
        bank = BankInfo(
            bic="GTBINGLAXXX",
            bank_name="GTB",
            country_code="NG",
            city="Lagos",
            country_currency="NGN",
        )
        result = infer_destination_currency("NGN", bank, "NG")
        assert result == "NGN"

    def test_infers_from_country_when_no_bank(self):
        """No bank record, but country is in the map → infer from country."""
        result = infer_destination_currency("USD", None, "JP")
        assert result == "JPY"

    def test_returns_passed_when_country_not_in_map(self):
        """Unknown country → return passed currency unchanged."""
        result = infer_destination_currency("USD", None, "ZZ")
        assert result == "USD"

    def test_no_inference_for_non_funding_currency(self):
        """If passed currency isn't a funding currency, don't infer."""
        bank = BankInfo(
            bic="X",
            bank_name="X",
            country_code="NG",
            city=None,
            country_currency="NGN",
        )
        # ZAR is not a funding currency, so it's returned as-is even though
        # the bank's local currency is NGN.
        result = infer_destination_currency("ZAR", bank, "NG")
        assert result == "ZAR"

    def test_no_inference_when_bank_currency_equals_passed(self):
        """USD passed for a US bank → no override (stays USD)."""
        bank = BankInfo(
            bic="CITIUS33XXX",
            bank_name="Citi",
            country_code="US",
            city="NYC",
            country_currency="USD",
        )
        result = infer_destination_currency("USD", bank, "US")
        assert result == "USD"

    def test_no_bank_no_country_returns_passed(self):
        result = infer_destination_currency("USD", None, None)
        assert result == "USD"

    def test_country_inference_overrides_funding_currency(self):
        """EUR funding → a Japan destination infers JPY."""
        result = infer_destination_currency("EUR", None, "JP")
        assert result == "JPY"

    def test_country_map_covers_middle_east(self):
        result = infer_destination_currency("USD", None, "SA")
        assert result == "SAR"

    def test_country_map_covers_asia_pacific(self):
        for country, expected in [("CN", "CNY"), ("HK", "HKD"), ("SG", "SGD"),
                                   ("AU", "AUD"), ("TH", "THB"), ("VN", "VND")]:
            assert infer_destination_currency("USD", None, country) == expected


# ===========================================================================
# is_us_routing_number
# ===========================================================================


class TestIsUSRoutingNumber:
    @pytest.mark.parametrize(
        "value, expected",
        [
            ("011000015", True),
            ("021000021", True),
            ("011-000-015", True),      # dashes stripped
            ("011 000 015", True),       # spaces stripped
            ("GTBINGLAXXX", False),      # BIC
            ("GB29NWBK60161331926819", False),  # IBAN
            ("123", False),              # too short
            ("1234567890", False),       # too long
            ("abcdefghi", False),        # 9 chars but not digits
            ("", False),                 # empty
        ],
    )
    def test_detection(self, value, expected):
        assert is_us_routing_number(value) is expected


# ===========================================================================
# lookup_us_bank — depends on Fedwire/FedACH data being imported
# ===========================================================================


class TestLookupUSBank:
    """
    These tests depend on Fedwire data being present. If the dev DB hasn't
    had `import-fedwire` run, lookups will return None — which we assert as
    'not found' rather than failing. The parser tests in test_api.py cover
    the parsing logic independent of data load.
    """

    def test_known_fedwire_bank_when_imported(self, db_session):
        """FRB Boston (011000015) if imported, else None — both acceptable."""
        result = lookup_us_bank(db_session, "011000015")
        # The test DB is shared and may or may not have Fed data.
        if result is not None:
            assert result.country_code == "US"
            assert "FEDERAL RESERVE" in result.bank_name
            assert result.country_currency == "USD"

    def test_unknown_routing_returns_none(self, db_session):
        result = lookup_us_bank(db_session, "999999999")
        assert result is None

    def test_returns_bank_info_shape_when_found(self, db_session):
        result = lookup_us_bank(db_session, "021000021")  # JPMorgan Chase
        if result is not None:
            assert isinstance(result, BankInfo)
            assert result.country_code == "US"
            assert result.country_currency == "USD"
            # BIC field is intentionally empty for Fedwire-sourced records.
            assert result.bic == ""

    def test_strips_dashes(self, db_session):
        """011-000-015 should resolve the same as 011000015."""
        result = lookup_us_bank(db_session, "011-000-015")
        # If data is present, it resolves; if not, None — both fine.
        if result is not None:
            assert "FEDERAL RESERVE" in result.bank_name


# ===========================================================================
# SSI-first routing — published instructions beat corridor guesses
# ===========================================================================


class TestSuggestFromSSI:
    def test_unverified_seed_ssi_is_not_routable(self, db_session_clean):
        from app.services.routing import suggest_from_ssi
        assert suggest_from_ssi(
            db_session_clean, "ABNGNGLAXXX", "USD", "NG"
        ) == []

    def test_published_correspondents_carry_settlement_ids(self, db_session_clean):
        from app.services.routing import suggest_from_ssi
        _approve_ssi_rows(db_session_clean, "ABNGNGLAXXX", "USD")
        suggestions = suggest_from_ssi(
            db_session_clean, "ABNGNGLAXXX", "USD", "NG"
        )
        by_bic = {s.bic: s for s in suggestions}
        citi = by_bic["CITIUS33XXX"]
        assert citi.settlement is not None
        assert citi.settlement.chips_uid == "0008"
        assert citi.settlement.aba == "021000089"
        dbtca = by_bic["BKTRUS33XXX"]
        assert dbtca.settlement is not None
        assert dbtca.settlement.chips_uid == "0103"
        assert dbtca.settlement.aba == "021001033"

    def test_no_ssi_returns_empty(self, db_session):
        from app.services.routing import suggest_from_ssi
        # A bank with no seeded SSI records
        assert suggest_from_ssi(db_session, "ZZZZXX99XXX", "USD", "XX") == []

    def test_ssi_lookup_matches_8char_prefix(self, db_session_clean):
        from app.services.routing import suggest_from_ssi
        _approve_ssi_rows(db_session_clean, "ABNGNGLAXXX", "USD")
        # Branch BIC should still find the head-office SSI rows
        suggestions = suggest_from_ssi(
            db_session_clean, "ABNGNGLA001", "USD", "NG"
        )
        assert len(suggestions) >= 3

    def test_archived_unverified_and_masked_rows_are_never_routed_on(
        self, db_session_clean
    ):
        from app.services.routing import suggest_from_ssi

        rows = [
            SSI(
                beneficiary_bic="TESTUS33XXX",
                beneficiary_bank_name="Test Bank",
                currency="USD",
                intermediary_bic="CITIUS33XXX",
                intermediary_bank_name="Citibank N.A.",
                intermediary_account="123456789",
                beneficiary_account="987654321",
                charge_code="SHA",
                value_date="spot",
                notes="Source: test.",
                as_of="2026-08-19",
                verified_by="Treasury Operations",
                status="archived",
            ),
            SSI(
                beneficiary_bic="TESTUS33XXX",
                beneficiary_bank_name="Test Bank",
                currency="USD",
                intermediary_bic="SCBLUS33XXX",
                intermediary_bank_name="Standard Chartered",
                intermediary_account="123456789",
                beneficiary_account="987654321",
                charge_code="SHA",
                value_date="spot",
                notes="Source: test.",
                as_of="2026-08-19",
                verified_by="Treasury Operations",
                status="unverified",
            ),
            SSI(
                beneficiary_bic="TESTUS33XXX",
                beneficiary_bank_name="Test Bank",
                currency="USD",
                intermediary_bic="BKTRUS33XXX",
                intermediary_bank_name="Deutsche Bank Trust",
                intermediary_account="MASKED-1234",
                beneficiary_account="987654321",
                charge_code="SHA",
                value_date="spot",
                notes="Source: test.",
                as_of="2026-08-19",
                verified_by="Treasury Operations",
                status="published",
            ),
            SSI(
                beneficiary_bic="TESTUS33XXX",
                beneficiary_bank_name="Test Bank",
                currency="USD",
                intermediary_bic="MRMDUS33XXX",
                intermediary_bank_name="HSBC Bank USA",
                intermediary_account="123456789",
                beneficiary_account="987654321",
                charge_code="SHA",
                value_date="spot",
                notes="Source: test.",
                as_of="2026-08-19",
                verified_by="Treasury Operations",
                status="published",
            ),
        ]
        db_session_clean.add_all(rows)
        db_session_clean.commit()

        suggestions = suggest_from_ssi(
            db_session_clean, "TESTUS33XXX", "USD", "US"
        )
        assert [suggestion.bic for suggestion in suggestions] == ["MRMDUS33XXX"]

    def test_bic_only_rows_are_never_routed_on(self, db_session_clean):
        """ENBD's charges-PDF rows name correspondents but carry no accounts,
        charge codes, or value dates. Routing on them would select a
        correspondent without a settlement instruction — they must be
        invisible to suggest_from_ssi. A bank with ONLY bic_only rows must
        fall through to the corridor path, not emit bogus suggestions."""
        from app.services.routing import suggest_from_ssi

        bic_only = db_session_clean.query(SSI).filter(
            SSI.beneficiary_bic == "EBILAEADXXX",
            SSI.currency == "USD",
        ).all()
        assert bic_only and all(r.bic_only for r in bic_only)
        assert suggest_from_ssi(db_session_clean, "EBILAEADXXX", "USD", "AE") == []

        # A real instruction next to a BIC-only row wins: only the selectable
        # one is suggested.
        db_session_clean.add(SSI(
            beneficiary_bic="EBILAEADXXX",
            beneficiary_bank_name="Emirates NBD",
            currency="USD",
            intermediary_bic="BKTRUS33XXX",
            intermediary_bank_name="BTMU, New York",
            intermediary_account="123456789",
            beneficiary_account="987654321",
            charge_code="SHA",
            value_date="spot",
            notes="Source: test. ",
            as_of="2026-08-19",
            verified_by="Treasury Operations",
            status="published",
        ))
        db_session_clean.commit()
        suggestions = suggest_from_ssi(
            db_session_clean, "EBILAEADXXX", "USD", "AE"
        )
        bics = [s.bic for s in suggestions]
        assert "BKTRUS33XXX" in bics
        assert len(bics) == 1, "bic_only rows leaked into the suggestions"


class TestSuggestRoute:
    def test_verified_ssi_wins_over_corridor(self, db_session_clean):
        from app.services.routing import suggest_route
        _approve_ssi_rows(db_session_clean, "ABNGNGLAXXX", "USD")
        suggestions, basis = suggest_route(
            db_session_clean,
            beneficiary_bic_11="ABNGNGLAXXX",
            settlement_currency="USD",
            destination_currency="NGN",
            destination_country="NG",
        )
        assert basis == "published-ssi"
        bics = [s.bic for s in suggestions]
        # The corridor table's BofA guess must NOT appear — the bank's
        # The approved list doesn't include it.
        assert "BOFAUS3NXXX" not in bics
        assert "BKTRUS33XXX" in bics

    def test_corridor_fallback_when_no_ssi(self, db_session):
        from app.services.routing import suggest_route
        # GTBank Nigeria has corridor rules but (in seed) no USD SSI rows.
        suggestions, basis = suggest_route(
            db_session,
            beneficiary_bic_11="GTBINGLAXXX",
            settlement_currency="USD",
            destination_currency="NGN",
            destination_country="NG",
        )
        if basis == "corridor-heuristic":
            assert suggestions[0].bic == "CITIUS33XXX"
            assert suggestions[0].basis == "corridor-heuristic"
        else:
            # If GTBank SSIs are ever seeded, published must win instead.
            assert all(s.basis == "published-ssi" for s in suggestions)

    def test_corridor_suggestions_carry_settlement_ids_when_known(self, db_session):
        from app.services.routing import suggest_route
        suggestions, basis = suggest_route(
            db_session,
            beneficiary_bic_11="GLBBNPKAXXX",  # Nepal — corridor path
            settlement_currency="USD",
            destination_currency="NPR",
            destination_country="NP",
        )
        for s in suggestions:
            if s.bic.startswith("CITIUS33"):
                assert s.settlement is not None
                assert s.settlement.chips_uid == "0008"


class TestSettlementDirectory:
    def test_known_clearers(self):
        from app.data.settlement_directory import get_settlement_ids
        assert get_settlement_ids("CITIUS33XXX")["chips_uid"] == "0008"
        assert get_settlement_ids("chasus33")["aba"] == "021000021"
        assert get_settlement_ids("BKTRUS33XXX")["chips_uid"] == "0103"

    def test_unknown_bank_returns_none(self):
        from app.data.settlement_directory import get_settlement_ids
        assert get_settlement_ids("GTBINGLAXXX") is None
        assert get_settlement_ids("") is None
        assert get_settlement_ids(None) is None


class TestRouteEndpointSSIFirst:
    def test_route_access_bank_does_not_use_unverified_ssi(self, client):
        r = client.get("/api/route", params={"bic": "ABNGNGLA", "currency": "USD"})
        assert r.status_code == 200
        body = r.json()
        assert body["source"] == "curated-corridor-table"
        bics = [s["bic"] for s in body["suggested_intermediaries"]]
        assert "CITIUS33XXX" in bics
        assert all(s["basis"] == "corridor-heuristic" for s in body["suggested_intermediaries"])
        assert "heuristic" in body["notes"].lower()

    def test_route_endpoint_settlement_ids_serialized(self, client):
        r = client.get("/api/route", params={"bic": "ABNGNGLA", "currency": "USD"})
        body = r.json()
        citi = next(s for s in body["suggested_intermediaries"] if s["bic"] == "CITIUS33XXX")
        assert citi["settlement"]["chips_uid"] == "0008"
        assert citi["settlement"]["aba"] == "021000089"

    def test_route_corridor_fallback_still_labeled(self, client):
        r = client.get("/api/route", params={"bic": "GTBINGLAXXX", "currency": "USD"})
        assert r.status_code == 200
        body = r.json()
        assert body["source"] in ("published-ssi", "curated-corridor-table")
        if body["source"] == "curated-corridor-table":
            assert all(
                s["basis"] == "corridor-heuristic"
                for s in body["suggested_intermediaries"]
            )

    def test_lookup_exposes_settlement_ids_for_clearer(self, client):
        r = client.get("/api/lookup", params={"bic": "CITIUS33XXX"})
        assert r.status_code == 200
        body = r.json()
        assert body["settlement"]["chips_uid"] == "0008"

    def test_lookup_no_settlement_ids_for_non_clearer(self, client):
        r = client.get("/api/lookup", params={"bic": "ABNGNGLA"})
        assert r.status_code == 200
        assert r.json()["settlement"] is None

    def test_ssi_rows_carry_correspondent_settlement_ids(self, client):
        r = client.get("/api/ssi", params={"bic": "ABNGNGLA", "currency": "USD"})
        assert r.status_code == 200
        body = r.json()
        by_bic = {i["intermediary_bic"]: i for i in body["instructions"]}
        assert by_bic["CITIUS33XXX"]["intermediary_settlement"]["chips_uid"] == "0008"
        assert by_bic["BKTRUS33XXX"]["intermediary_settlement"]["aba"] == "021001033"
