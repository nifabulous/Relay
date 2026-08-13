"""
Tests for the /api/schemes endpoint — payment rails by currency.

Covers:
  - Per-currency lookup (GBP, CAD, USD, etc.)
  - The all-currencies listing
  - 404 for unknown currencies
  - Response shape validation (schemes array, required fields)
  - Key currencies have the expected schemes
  - Source-cited catalogue contract (RED phase, plan task 0.1; implementation
    in plan tasks 2.1-2.2)

Acceptance matrix — schemes catalogue (plan: payment-pacing-schemes-redesign):

  Requirement                                             Test(s)
  ------------------------------------------------------  -------------------------------------------------
  SCH-1  Every currency carries verifiedAsof               TestSchemeCurrencyContract.test_every_currency_has_verified_asof / test_domestic_list_returns_exactly_ten_currencies
  SCH-2  Every rail has summary fields + sources          TestSchemeSourceContract.test_every_rail_has_at_least_one_source / test_sources_carry_name_label_and_official_url
  SCH-3  NGN contains an RTGS rail                        TestNgnRails.test_ngn_contains_rtgs_rail / test_ngn_rtgs_rail_is_enriched
  SCH-4  KES bank transfer distinct from batch EFT        TestKesRails.test_kes_has_bank_transfer_rail_distinct_from_eft
  SCH-5  Interac family + three mandated variants         TestInteracVariants.test_interac_has_family_with_three_mandated_variants
  SCH-6  At least one fully enriched rail per currency    TestSchemeEnrichedDetails.test_usd_fedwire_is_fully_enriched / test_every_currency_has_at_least_one_fully_enriched_rail
  SCH-7  International / SWIFT catalogue endpoint         TestInternationalSchemesEndpoint.test_international_endpoint_returns_swift_gpi / test_international_response_has_sources_and_roadmap / test_domestic_list_returns_exactly_ten_currencies
"""
import pytest

ALL_CURRENCIES = ["GBP", "CAD", "USD", "EUR", "NGN", "KES", "INR", "AUD", "JPY", "AED"]


class TestSchemesEndpoint:
    def test_list_all_currencies(self, client):
        r = client.get("/api/schemes")
        assert r.status_code == 200
        body = r.json()
        assert "currencies" in body
        assert "count" in body
        assert body["count"] == len(body["currencies"])
        assert body["count"] >= 10  # we have 10 currencies

    def test_gbp_schemes(self, client):
        r = client.get("/api/schemes", params={"currency": "GBP"})
        assert r.status_code == 200
        body = r.json()
        assert body["currency"] == "GBP"
        assert body["country"] == "United Kingdom"
        assert body["iban"] is True
        assert len(body["schemes"]) >= 3  # FPS, CHAPS, Bacs

        names = [s["name"] for s in body["schemes"]]
        assert any("Faster" in n for n in names)
        assert any("CHAPS" in n for n in names)
        assert any("Bacs" in n for n in names)

    def test_cad_schemes(self, client):
        r = client.get("/api/schemes", params={"currency": "CAD"})
        assert r.status_code == 200
        body = r.json()
        assert body["currency"] == "CAD"
        assert body["iban"] is False  # Canada doesn't use IBAN
        assert len(body["schemes"]) >= 3  # Interac, EFT, Lynx

        names = [s["name"] for s in body["schemes"]]
        assert any("Interac" in n for n in names)
        assert any("EFT" in n for n in names)
        assert any("Lynx" in n for n in names)

    def test_usd_schemes(self, client):
        r = client.get("/api/schemes", params={"currency": "USD"})
        assert r.status_code == 200
        body = r.json()
        assert body["currency"] == "USD"
        assert len(body["schemes"]) >= 4  # Fedwire, FedACH, CHIPS, RTP/FedNow

        names = [s["name"] for s in body["schemes"]]
        assert any("Fedwire" in n for n in names)
        assert any("FedACH" in n for n in names)

    def test_eur_schemes(self, client):
        r = client.get("/api/schemes", params={"currency": "EUR"})
        assert r.status_code == 200
        body = r.json()
        assert body["iban"] is True
        assert len(body["schemes"]) >= 3  # SEPA Inst, SEPA CT, TARGET2

    def test_inr_schemes(self, client):
        r = client.get("/api/schemes", params={"currency": "INR"})
        assert r.status_code == 200
        body = r.json()
        assert body["iban"] is False  # India doesn't use IBAN
        names = [s["name"] for s in body["schemes"]]
        assert any("UPI" in n for n in names)

    def test_unknown_currency_returns_404(self, client):
        r = client.get("/api/schemes", params={"currency": "XYZ"})
        assert r.status_code == 404

    def test_lowercase_currency_works(self, client):
        """The endpoint should normalize lowercase currency codes."""
        r = client.get("/api/schemes", params={"currency": "gbp"})
        assert r.status_code == 200
        assert r.json()["currency"] == "GBP"

    @pytest.mark.parametrize("ccy", ["GBP", "CAD", "USD", "EUR", "NGN", "KES", "INR", "AUD", "JPY", "AED"])
    def test_all_supported_currencies(self, client, ccy):
        """Every supported currency returns at least one scheme."""
        r = client.get("/api/schemes", params={"currency": ccy})
        assert r.status_code == 200
        body = r.json()
        assert body["currency"] == ccy
        assert len(body["schemes"]) >= 1
        # Each scheme has required fields
        for s in body["schemes"]:
            assert "name" in s
            assert "speed" in s
            assert "useCase" in s

    def test_scheme_has_local_identifier(self, client):
        """Each currency response has a localIdentifier describing the domestic format."""
        r = client.get("/api/schemes", params={"currency": "GBP"})
        body = r.json()
        assert "localIdentifier" in body
        assert "Sort Code" in body["localIdentifier"]

    def test_cad_has_no_iban(self, client):
        """Canada doesn't use IBAN — verify the flag is correct."""
        r = client.get("/api/schemes", params={"currency": "CAD"})
        body = r.json()
        assert body["iban"] is False
        assert body["localIdentifier"]  # must have a non-None identifier


# ===========================================================================
# Source-cited catalogue contract — RED phase (plan tasks 2.1-2.2)
#
# These tests pin the contract the catalogue is being expanded to: every
# displayed rail carries an official source, every currency has a verifiedAsof,
# NGN gains an RTGS rail, KES separates bank transfer from batch EFT, Interac
# carries its three variants under one family, at least one rail per currency
# is fully enriched, and an international / SWIFT catalogue exists.
#
# The source/enrichment/variant/international tests FAIL against the current
# data by design — that is the RED phase. The verifiedAsof and ten-currency
# tests are guards that already pass and must keep passing.
# ===========================================================================


def _schemes_for(client, currency):
    r = client.get("/api/schemes", params={"currency": currency})
    assert r.status_code == 200
    return r.json()["schemes"]


class TestSchemeCurrencyContract:
    """SCH-1: currency-level metadata is complete for all ten currencies."""

    def test_every_currency_has_verified_asof(self, client):
        for ccy in ALL_CURRENCIES:
            r = client.get("/api/schemes", params={"currency": ccy})
            assert r.status_code == 200
            body = r.json()
            assert body["verifiedAsof"], f"{ccy} must carry verifiedAsof"
            assert len(body["verifiedAsof"]) == 7  # YYYY-MM

    def test_domestic_list_returns_exactly_ten_currencies(self, client):
        """SCH-1/SCH-7 guard: the list endpoint stays a ten-currency catalog."""
        r = client.get("/api/schemes")
        assert r.status_code == 200
        body = r.json()
        assert body["count"] == 10
        assert set(body["currencies"]) == set(ALL_CURRENCIES)


class TestSchemeSourceContract:
    """SCH-2: every displayed rail is source-cited — no unsourced rails."""

    def test_every_rail_has_at_least_one_source(self, client):
        for ccy in ALL_CURRENCIES:
            schemes = _schemes_for(client, ccy)
            assert schemes, f"{ccy} must have at least one rail"
            for scheme in schemes:
                assert scheme.get("sources"), (
                    f"{ccy}/{scheme['name']} must carry a sources list"
                )

    def test_sources_carry_name_label_and_official_url(self, client):
        for ccy in ALL_CURRENCIES:
            for scheme in _schemes_for(client, ccy):
                for source in scheme["sources"]:
                    assert source["name"], "source name required"
                    assert source["label"], "source label required"
                    assert source["url"].startswith("https://"), (
                        "official source URL required"
                    )


class TestSchemeEnrichedDetails:
    """SCH-6: no currency is left with a summary-only catalogue."""

    ENRICHED_FIELDS = (
        "howItWorks", "limits", "settlement", "reversible",
        "protections", "roadmap", "sources",
    )

    def test_usd_fedwire_is_fully_enriched(self, client):
        fedwire = next(
            s for s in _schemes_for(client, "USD") if "Fedwire" in s["name"]
        )
        for field in self.ENRICHED_FIELDS:
            assert field in fedwire and fedwire[field] is not None, (
                f"Fedwire must carry {field}"
            )
        assert fedwire["howItWorks"]
        assert fedwire["limits"]

    def test_every_currency_has_at_least_one_fully_enriched_rail(self, client):
        for ccy in ALL_CURRENCIES:
            enriched = [
                s for s in _schemes_for(client, ccy)
                if all(
                    s.get(f) is not None
                    for f in self.ENRICHED_FIELDS
                )
                and s.get("howItWorks")
            ]
            assert enriched, (
                f"{ccy} must have at least one fully enriched rail "
                f"({', '.join(self.ENRICHED_FIELDS)})"
            )


class TestNgnRails:
    """SCH-3: NGN gains a high-value RTGS rail alongside the instant/batch pair."""

    def test_ngn_contains_rtgs_rail(self, client):
        names = [s["name"] for s in _schemes_for(client, "NGN")]
        assert any("RTGS" in n.upper() for n in names), (
            "NGN must include an RTGS rail (CBN RTGS)"
        )

    def test_ngn_rtgs_rail_is_enriched(self, client):
        rtgs = next(
            s for s in _schemes_for(client, "NGN") if "RTGS" in s["name"].upper()
        )
        assert rtgs["operator"], "NGN RTGS must name its operator (CBN)"
        assert rtgs["settlement"], "NGN RTGS must describe settlement"
        assert rtgs["sources"], "NGN RTGS must cite official sources"


class TestKesRails:
    """SCH-4: KES distinguishes a bank credit transfer from batch EFT."""

    def test_kes_has_bank_transfer_rail_distinct_from_eft(self, client):
        names = [s["name"] for s in _schemes_for(client, "KES")]
        lowered = [n.lower() for n in names]
        assert any(n == "eft" for n in lowered), "KES must keep its batch EFT rail"
        bank_transfer = [
            n for n in lowered if "bank" in n and "transfer" in n
        ]
        assert bank_transfer, (
            "KES must carry a bank-transfer rail distinct from EFT"
        )
        assert len(names) == len(set(names)), "rail names must be distinct"


class TestInteracVariants:
    """SCH-5: Interac e-Transfer is one family with three descriptive variants."""

    def test_interac_has_family_with_three_mandated_variants(self, client):
        interac = next(
            s for s in _schemes_for(client, "CAD") if "Interac" in s["name"]
        )
        assert interac["family"] == "Interac e-Transfer"
        variants = interac["variants"]
        assert len(variants) == 3
        variant_names = [v["name"] for v in variants]
        assert set(variant_names) == {
            "Auto-Deposit",
            "Request Money",
            "Standard security-question claim",
        }
        # Variants describe product options — they are not settlement rails.
        assert all(v["description"] for v in variants), (
            "every variant must carry a description"
        )


class TestInternationalSchemesEndpoint:
    """SCH-7: the international / SWIFT catalogue endpoint exists and is
    source-cited; the domestic list stays exactly ten currencies."""

    def test_international_endpoint_returns_swift_gpi(self, client):
        r = client.get("/api/schemes/international")
        assert r.status_code == 200
        body = r.json()
        assert "SWIFT" in body["name"].upper()
        # Required gpi facts: speed, correspondent routing, UETR tracking,
        # MT103/pacs.008 references, and finality/reversibility caveats.
        assert body["speed"]
        assert body["useCase"]
        assert body["operator"] == "SWIFT"
        how_it_works = " ".join(body["howItWorks"])
        assert "UETR" in how_it_works, "SWIFT gpi facts must mention UETR tracking"
        assert "MT103" in how_it_works or "pacs.008" in how_it_works
        assert "reversible" in body and body["reversible"] is False
        assert body["verifiedAsof"]

    def test_international_response_has_sources_and_roadmap(self, client):
        r = client.get("/api/schemes/international")
        assert r.status_code == 200
        body = r.json()
        assert body["sources"], "SWIFT gpi must cite official sources"
        for source in body["sources"]:
            assert source["url"].startswith("https://")
        roadmap = " ".join(body.get("roadmap") or [])
        assert "CBPR+" in roadmap, (
            "roadmap must note the CBPR+ direction"
        )
        assert "MT103" in roadmap, (
            "roadmap must note the MT103 retirement direction"
        )

    def test_international_route_is_documented_in_openapi(self, client):
        """The new route must appear in the generated OpenAPI schema."""
        r = client.get("/openapi.json")
        assert r.status_code == 200
        paths = r.json()["paths"]
        assert "/api/schemes/international" in paths, (
            "OpenAPI must document GET /api/schemes/international"
        )
        assert "get" in paths["/api/schemes/international"]
