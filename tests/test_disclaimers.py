"""
Tests for SIMULATION disclaimers on the machine surface (item 0.4).

The API title, /docs landing, and every payment-shaped response must
carry a SIMULATION disclaimer so a developer integrating via /docs
sees it before they ever read the README. Raw API responses must
carry it so an iframed response (e.g. a fake tracking page scam)
can't pass as real.
"""


class TestOpenApiTitleHasSimulation:
    """The FastAPI app title/description must flag SIMULATION prominently."""

    def test_title_contains_simulation(self, client):
        r = client.get("/openapi.json")
        assert r.status_code == 200
        info = r.json()["info"]
        title = info["title"]
        assert "SIMULATION" in title.upper() or "EDUCATIONAL" in title.upper(), (
            f"OpenAPI title must contain SIMULATION or EDUCATIONAL, got: {title!r}"
        )

    def test_description_warns_not_for_real_payments(self, client):
        r = client.get("/openapi.json")
        info = r.json()["info"]
        desc = info.get("description", "")
        assert "not for real payments" in desc.lower() or "do not" in desc.lower(), (
            "OpenAPI description must warn against real payment use"
        )


class TestPaymentResponsesCarryDisclaimer:
    """Every payment-shaped API response must include a disclaimer string."""

    def test_route_response_has_disclaimer(self, client):
        r = client.get("/api/route", params={"bic": "GTBINGLAXXX", "currency": "USD"})
        assert r.status_code == 200
        body = r.json()
        assert "disclaimer" in body or "notes" in body, (
            "Route response must carry a disclaimer/notes field"
        )
        # The notes/disclaimer must mention simulation or educational
        text = body.get("disclaimer", "") + " " + body.get("notes", "")
        assert any(w in text.lower() for w in ("heuristic", "educational", "simulat", "not for real")), (
            f"Route disclaimer must warn about simulated/educational nature, got: {text!r}"
        )

    def test_track_create_response_has_disclaimer(self, client):
        r = client.post("/api/track/create", json={
            "originator_bic": "CITIUS33XXX",
            "originator_name": "Citibank",
            "beneficiary_bic": "GTBINGLAXXX",
            "beneficiary_name": "GTBank",
            "currency": "USD",
            "amount": 100,
        })
        assert r.status_code == 200
        body = r.json()
        assert "disclaimer" in body, (
            "TrackPaymentResponse must carry a disclaimer field"
        )
        assert any(w in body["disclaimer"].lower() for w in ("simulat", "educational", "not for real")), (
            f"Tracking disclaimer must mention simulated nature, got: {body['disclaimer']!r}"
        )

    def test_ssi_response_has_disclaimer(self, client):
        r = client.get("/api/ssi", params={"bic": "GTBINGLAXXX", "currency": "USD"})
        assert r.status_code == 200
        body = r.json()
        assert "disclaimer" in body, "SSIResponse must carry a disclaimer field"

    def test_prepare_payment_response_has_warnings_or_disclaimer(self, client):
        r = client.post("/api/prepare-payment", json={
            "beneficiary_iban": "GB29NWBK60161331926819",
            "beneficiary_name": "Olaniyi Oladokun",
            "beneficiary_bic": "NWBKGB2LXXX",
            "currency": "USD",
            "amount": 1000,
        })
        assert r.status_code == 200
        body = r.json()
        # The prepare endpoint should warn about its educational nature
        # via warnings list, blocks list, or a disclaimer field
        all_text = str(body).lower()
        assert any(w in all_text for w in ("simulat", "educational", "heuristic", "placeholder")), (
            "PreparePaymentResponse must reference simulated/educational/placeholder nature somewhere"
        )


class TestVopResponsePrivacy:
    """VoP response must NOT leak the real name on NO_MATCH (privacy check)."""

    def test_no_match_does_not_leak_name(self, client):
        r = client.post("/api/verify-payee", json={
            "iban": "GB29NWBK60161331926819",
            "name": "Completely Wrong Name XYZ",
        })
        assert r.status_code == 200
        body = r.json()
        if body["outcome"] == "NO_MATCH":
            assert body.get("account_holder_name") is None, (
                "NO_MATCH must not return the real account holder name (privacy)"
            )
