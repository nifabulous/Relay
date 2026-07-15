"""
Tests for idempotency on payment-creation endpoints (item 1.4).

QA reproduced: POST /track/create generates a fresh UETR on every call,
so a retried request after a network blip duplicates the payment.

Fix: accept an Idempotency-Key header. Same key + same payload → same UETR.
Different key (or no key) → new UETR (existing behavior preserved).
"""


class TestTrackCreateIdempotency:
    """/track/create with Idempotency-Key must return the same UETR on replay."""

    def _payload(self):
        return {
            "originator_bic": "CITIUS33XXX",
            "originator_name": "Citibank",
            "beneficiary_bic": "GTBINGLAXXX",
            "beneficiary_name": "GTBank",
            "currency": "USD",
            "amount": 500,
        }

    def test_same_key_returns_same_uetr(self, client):
        """Two POSTs with the same Idempotency-Key must return the same UETR."""
        headers = {"Idempotency-Key": "client-req-001"}
        r1 = client.post("/api/track/create", json=self._payload(), headers=headers)
        r2 = client.post("/api/track/create", json=self._payload(), headers=headers)
        assert r1.status_code == 200
        assert r2.status_code == 200
        assert r1.json()["uetr"] == r2.json()["uetr"], (
            "Same Idempotency-Key must return the same UETR"
        )

    def test_different_keys_return_different_uetr(self, client):
        """Different keys must produce different UETRs."""
        r1 = client.post(
            "/api/track/create", json=self._payload(),
            headers={"Idempotency-Key": "key-A"},
        )
        r2 = client.post(
            "/api/track/create", json=self._payload(),
            headers={"Idempotency-Key": "key-B"},
        )
        assert r1.json()["uetr"] != r2.json()["uetr"], (
            "Different Idempotency-Keys must return different UETRs"
        )

    def test_no_key_still_works(self, client):
        """Without Idempotency-Key, existing behavior is preserved (new UETR each time)."""
        r1 = client.post("/api/track/create", json=self._payload())
        r2 = client.post("/api/track/create", json=self._payload())
        assert r1.status_code == 200
        assert r2.status_code == 200
        assert r1.json()["uetr"] != r2.json()["uetr"], (
            "Without Idempotency-Key, each call should mint a new UETR"
        )


class TestPreparePaymentIdempotency:
    """/prepare-payment with Idempotency-Key must return the same UETR on replay."""

    def _payload(self):
        return {
            "beneficiary_iban": "GB29NWBK60161331926819",
            "beneficiary_name": "Test User",
            "beneficiary_bic": "NWBKGB2LXXX",
            "currency": "USD",
            "amount": 1000,
        }

    def test_same_key_returns_same_uetr(self, client):
        headers = {"Idempotency-Key": "prepare-001"}
        r1 = client.post("/api/prepare-payment", json=self._payload(), headers=headers)
        r2 = client.post("/api/prepare-payment", json=self._payload(), headers=headers)
        assert r1.status_code == 200
        assert r2.status_code == 200
        assert r1.json()["uetr"] == r2.json()["uetr"], (
            "Same Idempotency-Key must return the same UETR on /prepare-payment"
        )
