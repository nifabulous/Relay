"""
Tests for the fee calculator — /api/fees/simulate endpoint + service logic.

Covers:
  - SHA: fees deducted from amount at each hop
  - OUR: sender pays all, beneficiary receives full amount
  - BEN: same deduction as SHA
  - Per-hop breakdown correctness
  - Comparison between charge codes
  - Invalid charge code → 400
  - Mismatched intermediary lists → 400
"""

from app.services.fee_calculator import _get_lift_fee, simulate_fees


class TestFeeService:
    def test_sha_deducts_fees_from_amount(self):
        r = simulate_fees(5000, "USD", "SHA", ["CITIUS33XXX"], ["Citibank"])
        assert r.sent_amount == 5000
        assert r.received_amount < 5000
        assert r.total_fees > 0
        assert r.sender_pays_extra == 0
        assert len(r.hops) == 1

    def test_our_beneficiary_receives_full_amount(self):
        r = simulate_fees(5000, "USD", "OUR", ["CITIUS33XXX"], ["Citibank"])
        assert r.received_amount == 5000
        assert r.total_fees > 0
        assert r.sender_pays_extra > 0

    def test_ben_deducts_more_than_sha(self):
        """BEN deducts the sender bank fee too, so beneficiary receives less than SHA."""
        sha = simulate_fees(5000, "USD", "SHA", ["CITIUS33XXX", "SCBLUS33XXX"], ["Citi", "SCB"])
        ben = simulate_fees(5000, "USD", "BEN", ["CITIUS33XXX", "SCBLUS33XXX"], ["Citi", "SCB"])
        assert ben.received_amount < sha.received_amount
        assert ben.total_fees > sha.total_fees

    def test_multi_hop_cumulative(self):
        r = simulate_fees(5000, "USD", "SHA", ["CITIUS33XXX", "SCBLUS33XXX"], ["Citi", "SCB"])
        assert len(r.hops) == 2
        assert r.hops[0].amount_in == 5000
        assert r.hops[0].amount_out < 5000
        assert r.hops[1].amount_in == r.hops[0].amount_out
        assert r.hops[1].amount_out == r.received_amount
        assert r.hops[-1].cumulative_fees == r.total_fees

    def test_our_hops_show_no_deduction(self):
        r = simulate_fees(5000, "USD", "OUR", ["CITIUS33XXX"], ["Citibank"])
        assert r.hops[0].amount_in == 5000
        assert r.hops[0].amount_out == 5000
        assert r.hops[0].fee > 0  # fee exists but isn't deducted

    def test_unknown_intermediary_uses_generic_fee(self):
        r = simulate_fees(1000, "USD", "SHA", ["UNKNOWNBIC"], ["Unknown Bank"])
        assert r.total_fees > 0
        assert r.received_amount < 1000

    def test_invalid_charge_code_defaults_to_sha(self):
        r = simulate_fees(5000, "USD", "INVALID", ["CITIUS33XXX"], ["Citi"])
        assert r.charge_code == "SHA"

    def test_zero_intermediaries(self):
        r = simulate_fees(5000, "USD", "SHA", [], [])
        assert r.received_amount == 5000
        assert r.total_fees == 0
        assert len(r.hops) == 0

    def test_lift_fee_lookup(self):
        fee = _get_lift_fee("CITIUS33XXX", "USD")
        assert fee == 15.00

    def test_lift_fee_generic_fallback(self):
        fee = _get_lift_fee("UNKNOWNBIC", "USD")
        assert fee == 15.00  # generic USD


class TestFeeEndpoint:
    def test_simulate_sha(self, client):
        r = client.post("/api/fees/simulate", json={
            "amount": 5000,
            "currency": "USD",
            "charge_code": "SHA",
            "intermediary_bics": ["CITIUS33XXX", "SCBLUS33XXX"],
            "intermediary_names": ["Citibank N.A.", "Standard Chartered NY"],
        })
        assert r.status_code == 200
        body = r.json()
        assert body["charge_code"] == "SHA"
        assert body["sent_amount"] == 5000
        assert body["received_amount"] < 5000
        assert body["total_fees"] > 0
        assert len(body["hops"]) == 2
        assert body["hops"][0]["amount_in"] == 5000
        assert body["hops"][0]["amount_out"] < 5000

    def test_simulate_our(self, client):
        r = client.post("/api/fees/simulate", json={
            "amount": 5000,
            "currency": "USD",
            "charge_code": "OUR",
            "intermediary_bics": ["CITIUS33XXX"],
            "intermediary_names": ["Citibank"],
        })
        assert r.status_code == 200
        body = r.json()
        assert body["received_amount"] == 5000
        assert body["sender_pays_extra"] > 0

    def test_invalid_charge_code(self, client):
        """Invalid charge code is rejected by the schema (422)."""
        r = client.post("/api/fees/simulate", json={
            "amount": 5000,
            "currency": "USD",
            "charge_code": "SPLIT",
            "intermediary_bics": [],
            "intermediary_names": [],
        })
        assert r.status_code == 422  # Pydantic validation error

    def test_whitespace_charge_code_normalized(self, client):
        """Whitespace in charge code is normalized by the schema."""
        r = client.post("/api/fees/simulate", json={
            "amount": 5000,
            "currency": "USD",
            "charge_code": " sha ",
            "intermediary_bics": ["CITIUS33XXX"],
            "intermediary_names": ["Citibank"],
        })
        assert r.status_code == 200
        assert r.json()["charge_code"] == "SHA"

    def test_negative_amount_rejected(self, client):
        """Negative amount is rejected by the schema."""
        r = client.post("/api/fees/simulate", json={
            "amount": -5000,
            "currency": "USD",
            "charge_code": "SHA",
            "intermediary_bics": [],
            "intermediary_names": [],
        })
        assert r.status_code == 422

    def test_zero_amount_rejected(self, client):
        """Zero amount is rejected by the schema."""
        r = client.post("/api/fees/simulate", json={
            "amount": 0,
            "currency": "USD",
            "charge_code": "SHA",
            "intermediary_bics": [],
            "intermediary_names": [],
        })
        assert r.status_code == 422

    def test_kes_has_fee_data(self, client):
        """KES should return realistic fees (not USD fallback)."""
        r = client.post("/api/fees/simulate", json={
            "amount": 50000,
            "currency": "KES",
            "charge_code": "SHA",
            "intermediary_bics": ["BARCKENXXXX"],
            "intermediary_names": ["Barclays Kenya"],
        })
        assert r.status_code == 200
        body = r.json()
        assert body["total_fees"] > 0
        # KES fee should be ~1500, not 15 (USD fallback)
        assert body["hops"][0]["fee"] >= 100

    def test_mismatched_lists(self, client):
        r = client.post("/api/fees/simulate", json={
            "amount": 5000,
            "currency": "USD",
            "charge_code": "SHA",
            "intermediary_bics": ["CITIUS33XXX", "SCBLUS33XXX"],
            "intermediary_names": ["Only one name"],
        })
        assert r.status_code == 400

    def test_currency_validation(self, client):
        r = client.post("/api/fees/simulate", json={
            "amount": 5000,
            "currency": "DOLLARS",
            "charge_code": "SHA",
            "intermediary_bics": [],
            "intermediary_names": [],
        })
        assert r.status_code == 422  # Pydantic validation error

    def test_zero_intermediaries(self, client):
        r = client.post("/api/fees/simulate", json={
            "amount": 5000,
            "currency": "USD",
            "charge_code": "SHA",
            "intermediary_bics": [],
            "intermediary_names": [],
        })
        assert r.status_code == 200
        body = r.json()
        assert body["received_amount"] == 5000
        assert body["total_fees"] == 0

    def test_fee_breakdown_string(self, client):
        r = client.post("/api/fees/simulate", json={
            "amount": 5000,
            "currency": "USD",
            "charge_code": "SHA",
            "intermediary_bics": ["CITIUS33XXX"],
            "intermediary_names": ["Citibank"],
        })
        body = r.json()
        assert "Sent" in body["fee_breakdown"]
        assert "Received" in body["fee_breakdown"]
        assert "fees" in body["fee_breakdown"]
