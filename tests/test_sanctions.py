"""
Tests for sanctions screening + settlement/value-date endpoints.
"""
import pytest


class TestScreeningService:
    def test_exact_hit(self):
        from app.services.screening import screen_name
        r = screen_name("Tariq Kassem")
        assert r.score >= 0.90
        assert r.matched_entry is not None
        assert r.matched_entry["id"] == "TRN-001"

    def test_alias_hit(self):
        from app.services.screening import screen_name
        r = screen_name("Qassem Tariq")
        assert r.score >= 0.75

    def test_clear_name(self):
        from app.services.screening import screen_name
        r = screen_name("Alice Johnson")
        assert r.score < 0.50
        # matched_entry may be set (best match) but hit is False (below threshold)
        # The screening service always returns the best match, even if low score

    def test_screen_payment_clean(self):
        from app.services.screening import screen_payment
        r = screen_payment("Alice Johnson", "Bob Williams")
        assert r.overall_recommendation == "CLEAR"
        assert r.blocked is False
        assert r.sender.recommendation == "CLEAR"
        assert r.beneficiary.recommendation == "CLEAR"

    def test_screen_payment_hit(self):
        from app.services.screening import screen_payment
        r = screen_payment("Alice", "Tariq Kassem")
        assert r.overall_recommendation == "BLOCKED"
        assert r.blocked is True
        assert r.beneficiary.recommendation == "REJECT"
        assert r.beneficiary.score >= 0.90

    def test_screen_payment_with_intermediaries(self):
        from app.services.screening import screen_payment
        r = screen_payment(
            "Alice", "Bob",
            intermediary_bics=["CITIUS33XXX", "GTBINGLAXXX"],
            intermediary_names=["Citibank", "GTBank"],
        )
        assert len(r.hops) == 4  # sender + 2 intermediaries + beneficiary
        assert r.overall_recommendation == "CLEAR"


class TestScreeningEndpoint:
    def test_clean_names(self, client):
        r = client.post("/api/screen", json={
            "sender_name": "Alice Johnson",
            "beneficiary_name": "Bob Williams",
        })
        assert r.status_code == 200
        body = r.json()
        assert body["overall_recommendation"] == "CLEAR"
        assert body["blocked"] is False
        assert "disclaimer" in body

    def test_hit(self, client):
        r = client.post("/api/screen", json={
            "sender_name": "Normal Person",
            "beneficiary_name": "Tariq Kassem",
        })
        assert r.status_code == 200
        body = r.json()
        assert body["overall_recommendation"] == "BLOCKED"
        assert body["beneficiary"]["hit"] is True
        assert body["beneficiary"]["matched_entry"] is not None

    def test_missing_sender(self, client):
        r = client.post("/api/screen", json={"beneficiary_name": "X"})
        assert r.status_code == 422

    def test_empty_sender(self, client):
        r = client.post("/api/screen", json={
            "sender_name": "", "beneficiary_name": "X",
        })
        assert r.status_code == 422

    def test_with_intermediaries(self, client):
        r = client.post("/api/screen", json={
            "sender_name": "Alice",
            "beneficiary_name": "Bob",
            "intermediary_bics": ["CITIUS33XXX"],
            "intermediary_names": ["Citibank"],
        })
        assert r.status_code == 200
        assert len(r.json()["hops"]) == 3

    def test_mismatched_lists(self, client):
        r = client.post("/api/screen", json={
            "sender_name": "Alice",
            "beneficiary_name": "Bob",
            "intermediary_bics": ["A", "B"],
            "intermediary_names": ["Only one"],
        })
        assert r.status_code == 400


class TestValueDateService:
    def test_friday_after_cutoff(self):
        from app.services.value_date import calculate_value_date
        from datetime import datetime
        r = calculate_value_date(datetime(2026, 7, 10, 17, 30), "USD", "spot")
        assert r.missed_cut_off is True
        assert r.trade_date.weekday() == 0  # Monday
        assert r.value_date > r.trade_date

    def test_instant_same_day(self):
        from app.services.value_date import calculate_value_date
        from datetime import datetime
        r = calculate_value_date(datetime(2026, 7, 11, 22, 0), "GBP", "faster payments")
        assert r.value_date == r.trade_date
        assert "instant" in r.settlement_type.lower()

    def test_monday_t_plus_2(self):
        from app.services.value_date import calculate_value_date
        from datetime import datetime
        r = calculate_value_date(datetime(2026, 7, 13, 10, 0), "USD", "spot")
        # Monday + 2 business days = Wednesday
        assert r.business_days == 2

    def test_explanation_present(self):
        from app.services.value_date import calculate_value_date
        from datetime import datetime
        r = calculate_value_date(datetime(2026, 7, 13, 10, 0), "EUR", "sepa credit transfer")
        assert len(r.explanation) > 20


class TestValueDateEndpoint:
    def test_basic_request(self, client):
        r = client.post("/api/value-date", json={
            "send_datetime": "2026-07-13T10:00:00",
            "currency": "USD",
            "scheme": "spot",
        })
        assert r.status_code == 200
        body = r.json()
        assert "trade_date" in body
        assert "value_date" in body
        assert "explanation" in body
        assert "disclaimer" in body

    def test_instant_scheme(self, client):
        r = client.post("/api/value-date", json={
            "send_datetime": "2026-07-11T22:00:00",
            "currency": "GBP",
            "scheme": "faster payments",
        })
        assert r.status_code == 200
        assert r.json()["value_date"] == "2026-07-11"

    def test_friday_after_cutoff(self, client):
        r = client.post("/api/value-date", json={
            "send_datetime": "2026-07-10T17:30:00",
            "currency": "USD",
            "scheme": "spot",
        })
        assert r.status_code == 200
        body = r.json()
        assert body["missed_cut_off"] is True
        # Trade date should be Monday (not Friday)
        from datetime import date
        td = date.fromisoformat(body["trade_date"])
        assert td.weekday() == 0  # Monday

    def test_missing_currency(self, client):
        r = client.post("/api/value-date", json={
            "send_datetime": "2026-07-13T10:00:00",
            "scheme": "spot",
        })
        assert r.status_code == 422

    def test_bad_datetime(self, client):
        r = client.post("/api/value-date", json={
            "send_datetime": "not-a-date",
            "currency": "USD",
            "scheme": "spot",
        })
        assert r.status_code == 400

    def test_bad_currency(self, client):
        r = client.post("/api/value-date", json={
            "send_datetime": "2026-07-13T10:00:00",
            "currency": "DOLLARS",
            "scheme": "spot",
        })
        assert r.status_code == 422
