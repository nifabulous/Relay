"""
Tests for SWIFT gpi payment tracking (UETR).

Covers:
  - UETR generation (UUID v4 format, uniqueness)
  - Timeline generation (correct hop sequence, fee deduction, terminal status)
  - Rejection path (stops at first intermediary)
  - Retrieval by UETR (timeline ordering, status summary, fees)
  - HTTP endpoints (create + get + 404 for unknown UETR)
"""
import uuid

import pytest

from app.services.tracking import (
    STATUS_CREDITED,
    STATUS_INITIATED,
    STATUS_REJECTED,
    TERMINAL_STATUSES,
    generate_timeline,
    generate_uetr,
    get_payment_status,
    get_timeline,
)

# ===========================================================================
# UETR generation
# ===========================================================================


class TestUETRGeneration:
    def test_generates_valid_uuid(self):
        uetr = generate_uetr()
        # Should parse as a valid UUID
        parsed = uuid.UUID(uetr)
        assert str(parsed) == uetr

    def test_is_version_4(self):
        uetr = generate_uetr()
        assert uuid.UUID(uetr).version == 4

    def test_is_36_chars(self):
        uetr = generate_uetr()
        assert len(uetr) == 36

    def test_generates_unique_values(self):
        uetrs = {generate_uetr() for _ in range(100)}
        assert len(uetrs) == 100


# ===========================================================================
# Timeline generation
# ===========================================================================


class TestGenerateTimeline:
    def _make_payment(self, db_session, outcome="credited"):
        """Helper: generate a standard USD→NG payment with one intermediary."""
        return generate_timeline(
            session=db_session,
            uetr=generate_uetr(),
            originator_bic="BOFAUS3NXXX",
            originator_name="Bank of America",
            beneficiary_bic="GTBINGLAXXX",
            beneficiary_name="Guaranty Trust Bank",
            intermediary_bics=["CITIUS33XXX"],
            intermediary_names=["Citibank N.A."],
            currency="USD",
            amount=5000.00,
            charge_code="SHA",
            outcome=outcome,
        )

    def test_generates_initiated_first(self, db_session):
        events = self._make_payment(db_session)
        assert events[0].status == STATUS_INITIATED
        assert events[0].bank_bic == "BOFAUS3NXXX"

    def test_successful_payment_ends_with_credited(self, db_session):
        events = self._make_payment(db_session)
        assert events[-1].status == STATUS_CREDITED
        assert events[-1].bank_bic == "GTBINGLAXXX"

    def test_credited_is_terminal(self, db_session):
        events = self._make_payment(db_session)
        assert events[-1].status in TERMINAL_STATUSES

    def test_rejected_payment_ends_with_rejected(self, db_session):
        events = self._make_payment(db_session, outcome="rejected")
        assert events[-1].status == STATUS_REJECTED
        # Rejection happens at the first intermediary
        assert "Citibank" in events[-1].bank_name

    def test_rejected_is_terminal(self, db_session):
        events = self._make_payment(db_session, outcome="rejected")
        assert events[-1].status in TERMINAL_STATUSES

    def test_sha_charge_deducts_fees(self, db_session):
        """SHA/BEN payments deduct intermediary fees from the amount."""
        events = self._make_payment(db_session)  # charge_code=SHA
        sent = float(events[0].amount)
        final = float(events[-1].amount)
        assert final < sent, "Fees should be deducted for SHA"
        assert final == pytest.approx(sent - 2.50, abs=0.01)

    def test_our_charge_no_fee_deduction(self, db_session):
        """OUR charges mean the sender pays all fees — beneficiary gets full amount."""
        uetr = generate_uetr()
        generate_timeline(
            session=db_session, uetr=uetr,
            originator_bic="BOFAUS3NXXX", originator_name="Bank of America",
            beneficiary_bic="GTBINGLAXXX", beneficiary_name="GTB",
            intermediary_bics=["CITIUS33XXX"], intermediary_names=["Citi"],
            currency="USD", amount=5000.00, charge_code="OUR",
        )
        events = get_timeline(db_session, uetr)
        sent = float(events[0].amount)
        final = float(events[-1].amount)
        assert final == sent, "No fee deduction for OUR"

    def test_chain_length_with_one_intermediary(self, db_session):
        """originator → 1 intermediary → beneficiary = at least 6 events."""
        events = self._make_payment(db_session)
        # INITIATED + (ACCEPTED + IN_PROGRESS + FORWARDED) + ACCEPTED + CREDITED = 7
        assert len(events) >= 6

    def test_hops_are_sequential(self, db_session):
        events = self._make_payment(db_session)
        hops = [e.hop for e in events]
        assert hops == sorted(hops), "Hops should be non-decreasing"

    def test_timestamps_are_chronological(self, db_session):
        events = self._make_payment(db_session)
        timestamps = [e.timestamp for e in events]
        assert timestamps == sorted(timestamps)

    def test_events_persist_to_db(self, db_session):
        from app.models import PaymentEvent
        uetr = generate_uetr()
        generate_timeline(
            session=db_session, uetr=uetr,
            originator_bic="BOFAUS3NXXX", originator_name="BofA",
            beneficiary_bic="GTBINGLAXXX", beneficiary_name="GTB",
            intermediary_bics=[], intermediary_names=[],
            currency="USD", amount=1000.00,
        )
        count = db_session.query(PaymentEvent).filter(PaymentEvent.uetr == uetr).count()
        assert count > 0

    def test_no_intermediaries_direct_payment(self, db_session):
        """Direct originator→beneficiary (no intermediaries)."""
        uetr = generate_uetr()
        events = generate_timeline(
            session=db_session, uetr=uetr,
            originator_bic="BOFAUS3NXXX", originator_name="BofA",
            beneficiary_bic="GTBINGLAXXX", beneficiary_name="GTB",
            intermediary_bics=[], intermediary_names=[],
            currency="USD", amount=1000.00,
        )
        assert events[0].status == STATUS_INITIATED
        assert events[-1].status == STATUS_CREDITED


# ===========================================================================
# get_payment_status
# ===========================================================================


class TestGetPaymentStatus:
    def test_returns_status_summary(self, db_session):
        uetr = generate_uetr()
        generate_timeline(
            session=db_session, uetr=uetr,
            originator_bic="BOFAUS3NXXX", originator_name="BofA",
            beneficiary_bic="GTBINGLAXXX", beneficiary_name="GTB",
            intermediary_bics=["CITIUS33XXX"], intermediary_names=["Citi"],
            currency="USD", amount=5000.00,
        )
        status = get_payment_status(db_session, uetr)
        assert status is not None
        assert status["current_status"] == STATUS_CREDITED
        assert status["is_terminal"] is True
        assert status["event_count"] > 0

    def test_calculates_total_fees(self, db_session):
        uetr = generate_uetr()
        generate_timeline(
            session=db_session, uetr=uetr,
            originator_bic="BOFAUS3NXXX", originator_name="BofA",
            beneficiary_bic="GTBINGLAXXX", beneficiary_name="GTB",
            intermediary_bics=["CITIUS33XXX"], intermediary_names=["Citi"],
            currency="USD", amount=5000.00, charge_code="SHA",
        )
        status = get_payment_status(db_session, uetr)
        assert status["total_fees"] == pytest.approx(2.50, abs=0.01)

    def test_returns_none_for_unknown_uetr(self, db_session):
        status = get_payment_status(db_session, "00000000-0000-0000-0000-000000000000")
        assert status is None


# ===========================================================================
# HTTP endpoints
# ===========================================================================


class TestTrackEndpoints:
    def test_create_tracked_payment(self, client):
        r = client.post("/api/track/create", json={
            "originator_bic": "BOFAUS3NXXX",
            "originator_name": "Bank of America",
            "beneficiary_bic": "GTBINGLAXXX",
            "beneficiary_name": "Guaranty Trust Bank",
            "currency": "USD",
            "amount": 5000.00,
            "intermediary_bics": ["CITIUS33XXX"],
            "intermediary_names": ["Citibank N.A."],
        })
        assert r.status_code == 200
        body = r.json()
        assert body["current_status"] == "CREDITED"
        assert body["is_terminal"] is True
        assert len(body["timeline"]) >= 6
        assert body["sent_amount"] == "5000.00"
        assert body["total_fees"] is not None
        assert "SIMULATED" in body["disclaimer"]

    def test_get_tracked_payment_by_uetr(self, client):
        # Create first
        create = client.post("/api/track/create", json={
            "originator_bic": "BOFAUS3NXXX",
            "originator_name": "Bank of America",
            "beneficiary_bic": "GTBINGLAXXX",
            "beneficiary_name": "GTB",
            "currency": "USD",
            "amount": 1000.00,
        })
        uetr = create.json()["uetr"]

        # Retrieve
        r = client.get(f"/api/track/{uetr}")
        assert r.status_code == 200
        body = r.json()
        assert body["uetr"] == uetr
        assert body["current_status"] == "CREDITED"

    def test_unknown_uetr_returns_404(self, client):
        r = client.get("/api/track/00000000-0000-0000-0000-000000000000")
        assert r.status_code == 404

    def test_create_rejected_payment(self, client):
        r = client.post("/api/track/create", json={
            "originator_bic": "BOFAUS3NXXX",
            "originator_name": "Bank of America",
            "beneficiary_bic": "GTBINGLAXXX",
            "beneficiary_name": "GTB",
            "currency": "USD",
            "amount": 5000.00,
            "intermediary_bics": ["CITIUS33XXX"],
            "intermediary_names": ["Citibank N.A."],
            "outcome": "rejected",
        })
        assert r.status_code == 200
        body = r.json()
        assert body["current_status"] == "REJECTED"
        assert body["is_terminal"] is True

    def test_timeline_has_correct_first_event(self, client):
        r = client.post("/api/track/create", json={
            "originator_bic": "BOFAUS3NXXX",
            "originator_name": "Bank of America",
            "beneficiary_bic": "GTBINGLAXXX",
            "beneficiary_name": "GTB",
            "currency": "USD",
            "amount": 1000.00,
        })
        body = r.json()
        assert body["timeline"][0]["status"] == "INITIATED"
        assert body["timeline"][0]["bank_bic"] == "BOFAUS3NXXX"

    def test_invalid_outcome_returns_400(self, client):
        r = client.post("/api/track/create", json={
            "originator_bic": "BOFAUS3NXXX",
            "originator_name": "BofA",
            "beneficiary_bic": "GTBINGLAXXX",
            "beneficiary_name": "GTB",
            "currency": "USD",
            "amount": 1000.00,
            "outcome": "lost",
        })
        assert r.status_code == 400

    def test_mismatched_intermediary_lists_returns_400(self, client):
        r = client.post("/api/track/create", json={
            "originator_bic": "BOFAUS3NXXX",
            "originator_name": "BofA",
            "beneficiary_bic": "GTBINGLAXXX",
            "beneficiary_name": "GTB",
            "currency": "USD",
            "amount": 1000.00,
            "intermediary_bics": ["CITIUS33XXX", "DEUTDEFFXXX"],
            "intermediary_names": ["Citibank only"],
        })
        assert r.status_code == 400
