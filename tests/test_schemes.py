"""
Tests for the /api/schemes endpoint — payment rails by currency.

Covers:
  - Per-currency lookup (GBP, CAD, USD, etc.)
  - The all-currencies listing
  - 404 for unknown currencies
  - Response shape validation (schemes array, required fields)
  - Key currencies have the expected schemes
"""
import pytest


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
