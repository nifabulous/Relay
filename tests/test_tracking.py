"""
Tests for SWIFT gpi payment tracking (UETR).

Covers:
  - UETR generation (UUID v4 format, uniqueness)
  - Timeline generation (correct hop sequence, fee deduction, terminal status)
  - Rejection path (stops at first intermediary)
  - Retrieval by UETR (timeline ordering, status summary, fees)
  - HTTP endpoints (create + get + 404 for unknown UETR)
  - Scheduled pacing (RED phase, plan task 0.1): scheduled vs instant
    timelines, time injection, persisted pending rows, one-event advancement,
    completion, idempotent terminal controls, restart-safe visibility, and
    the skip/complete HTTP endpoints.

Acceptance matrix — scheduled pacing (plan: payment-pacing-schemes-redesign
task 0.1; implementation lands in plan tasks 1.1-1.4. Tests below FAIL today
by design — they are the RED phase):

  Requirement                                             Test
  ------------------------------------------------------  -------------------------------------------------
  TRK-1  Scheduled vs instant distinction                 TestScheduledTimelineVisibility.test_schedule_value_is_persisted_on_every_row / test_instant_timeline_is_fully_visible_at_start
  TRK-2  Time injection (fixed UTC now, read-time)        test_due_events_become_visible_at_read_time_without_mutation
  TRK-3  Persisted pending rows (full plan on disk)       test_scheduled_timeline_persists_every_plan_row / test_scheduled_timeline_shows_only_initiated_at_start
  TRK-4  One-event advancement                            test_advance_reveals_exactly_one_event_in_planned_order
  TRK-5  Completion (reveals all, terminal)               test_complete_reveals_all_remaining_and_terminal / test_complete_on_rejected_scheduled_payment_reveals_rejection
  TRK-6  Idempotent terminal controls + no rewrite        test_repeat_skip_reveals_one_event_each_time / test_advance_after_terminal_is_a_noop / test_advance_and_complete_are_noops_for_instant_timelines / test_controls_never_rewrite_planned_timestamps
  TRK-7  Restart-safe visibility                          test_revealed_events_survive_a_fresh_session
  TRK-8  No future leakage in status summary              test_initiated_only_status_hides_final_amount_and_fees / test_status_never_leaks_future_statuses
  TRK-9  skip/complete HTTP endpoints + 404 + idempotent  TestScheduledTrackEndpoints.test_skip_reveals_exactly_one_event / test_complete_reveals_terminal_state / test_unknown_uetr_skip_and_complete_return_404 / test_repeated_skip_is_idempotent / test_repeated_complete_is_idempotent / test_get_advances_visibility_when_clock_passes_planned_timestamps
  TRK-10 Prepare = scheduled, admin create = instant      TestScheduledTrackEndpoints.test_instant_admin_create_remains_terminal / TestScheduledTrackEndpoints.test_prepared_payment...
"""
import uuid
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy.orm import sessionmaker

from app.services.tracking import (
    STATUS_ACCEPTED,
    STATUS_CREDITED,
    STATUS_IN_PROGRESS,
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
        # Citi's seeded USD lift fee — the same number the fee simulator uses.
        assert final == pytest.approx(sent - 15.00, abs=0.01)

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

    def test_direct_payment_honours_rejected_outcome(self, db_session):
        """
        A rejected direct payment must not end CREDITED.

        Rejection used to fire only inside the intermediary loop, at i == 1. With
        no intermediaries `chain[1:-1]` is empty, the loop never runs, and the
        caller's `outcome="rejected"` was silently discarded — the payment ran
        through to CREDITED as though nothing had been asked. A caller asking for
        a rejection and getting a successful payment is the worst kind of
        silence, because the response looks entirely valid.

        With no correspondent in the chain there is only one bank that can refuse
        the payment: the beneficiary's own.
        """
        uetr = generate_uetr()
        events = generate_timeline(
            session=db_session, uetr=uetr,
            originator_bic="BOFAUS3NXXX", originator_name="BofA",
            beneficiary_bic="GTBINGLAXXX", beneficiary_name="GTB",
            intermediary_bics=[], intermediary_names=[],
            currency="USD", amount=1000.00,
            outcome="rejected",
        )
        assert events[-1].status == STATUS_REJECTED
        assert events[-1].status in TERMINAL_STATUSES
        assert events[-1].bank_bic == "GTBINGLAXXX"
        assert STATUS_CREDITED not in [e.status for e in events]

    def test_direct_payment_rejection_is_reflected_in_status(self, db_session):
        """The persisted status summary must agree with the event stream."""
        uetr = generate_uetr()
        generate_timeline(
            session=db_session, uetr=uetr,
            originator_bic="BOFAUS3NXXX", originator_name="BofA",
            beneficiary_bic="GTBINGLAXXX", beneficiary_name="GTB",
            intermediary_bics=[], intermediary_names=[],
            currency="USD", amount=1000.00,
            outcome="rejected",
        )
        status = get_payment_status(db_session, uetr)
        assert status is not None
        assert status["current_status"] == STATUS_REJECTED
        assert status["is_terminal"] is True


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
        assert status["total_fees"] == pytest.approx(15.00, abs=0.01)

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


# ===========================================================================
# Scheduled pacing — RED phase (plan task 0.1, implementation in tasks 1.1-1.4)
#
# These tests assert behavior that does not exist yet: a `schedule` argument
# to generate_timeline, `get_visible_timeline` / `advance_payment` /
# `complete_payment` in app.services.tracking, `now` injection on
# get_payment_status, and the schedule/revealed_at columns on PaymentEvent.
# They FAIL against the current code by design. Acceptance matrix above.
#
# All clocks are fixed UTC datetimes; nothing here sleeps.
# ===========================================================================


class TestScheduledTimelineVisibility:
    """TRK-1/2/3/4/5/6/7/8: service-level visibility contract on the plan.

    RED phase: every test calls an API surface the current service does not
    have (schedule kwarg, visible-timeline helpers, now injection), so each
    fails now and flips green when plan tasks 1.1-1.3 land.
    """

    # Fixed UTC clock shared by all tests in this class.
    START = datetime(2026, 8, 13, 9, 0, 0, tzinfo=timezone.utc)

    def _make_scheduled(self, db_session, outcome="credited"):
        from app.services.tracking import generate_timeline

        self.uetr = generate_uetr()
        return generate_timeline(
            session=db_session,
            uetr=self.uetr,
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
            schedule="scheduled",
            start_time=self.START,
        )

    def test_scheduled_timeline_persists_every_plan_row(self, db_session):
        """TRK-3: the full planned chain is persisted, not only visible rows."""
        self._make_scheduled(db_session)
        all_rows = get_timeline(db_session, self.uetr)
        assert len(all_rows) >= 6, "Full plan must be on disk from the start"

    def test_scheduled_timeline_shows_only_initiated_at_start(self, db_session):
        """TRK-3: at t0 only INITIATED is visible; later banks stay hidden."""
        from app.services.tracking import get_visible_timeline

        self._make_scheduled(db_session)
        visible = get_visible_timeline(db_session, self.uetr, now=self.START)
        assert len(visible) == 1
        assert visible[0].status == STATUS_INITIATED

    def test_instant_timeline_is_fully_visible_at_start(self, db_session):
        """TRK-1: instant keeps today's behavior — the whole chain at once."""
        from app.services.tracking import get_visible_timeline

        uetr = generate_uetr()
        generate_timeline(
            session=db_session, uetr=uetr,
            originator_bic="BOFAUS3NXXX", originator_name="BofA",
            beneficiary_bic="GTBINGLAXXX", beneficiary_name="GTB",
            intermediary_bics=["CITIUS33XXX"], intermediary_names=["Citi"],
            currency="USD", amount=1000.00,
            start_time=self.START,
        )
        visible = get_visible_timeline(db_session, uetr, now=self.START)
        assert len(visible) == len(get_timeline(db_session, uetr)) >= 6

    def test_schedule_value_is_persisted_on_every_row(self, db_session):
        """TRK-1: each row carries its schedule mode; instant stays default."""
        self._make_scheduled(db_session)
        for event in get_timeline(db_session, self.uetr):
            assert event.schedule == "scheduled"

        uetr = generate_uetr()
        generate_timeline(
            session=db_session, uetr=uetr,
            originator_bic="BOFAUS3NXXX", originator_name="BofA",
            beneficiary_bic="GTBINGLAXXX", beneficiary_name="GTB",
            intermediary_bics=[], intermediary_names=[],
            currency="USD", amount=1000.00,
            start_time=self.START,
        )
        for event in get_timeline(db_session, uetr):
            assert event.schedule == "instant"

    def test_due_events_become_visible_at_read_time_without_mutation(
        self, db_session
    ):
        """TRK-2: visibility is a function of a fixed clock, not a background job."""
        from app.services.tracking import get_visible_timeline

        self._make_scheduled(db_session)
        # With one intermediary, ACCEPTED lands at start + 50s.
        early = get_visible_timeline(db_session, self.uetr, now=self.START)
        assert len(early) == 1

        due = get_visible_timeline(
            db_session, self.uetr, now=self.START + timedelta(seconds=51)
        )
        assert len(due) == 2
        assert due[1].status == STATUS_ACCEPTED

        # Reading must not mutate: the full plan is bit-identical afterwards
        # and none of the due rows were manually revealed.
        snapshot = [
            (e.hop, e.status, e.timestamp)
            for e in get_timeline(db_session, self.uetr)
        ]
        after = get_timeline(db_session, self.uetr)
        assert [(e.hop, e.status, e.timestamp) for e in after] == snapshot
        assert all(e.revealed_at is None for e in after)

    def test_advance_reveals_exactly_one_event_in_planned_order(self, db_session):
        """TRK-4: advance exposes exactly one persisted event, in hop order."""
        from app.services.tracking import advance_payment, get_visible_timeline

        self._make_scheduled(db_session)
        status = advance_payment(db_session, self.uetr, now=self.START)
        visible = get_visible_timeline(db_session, self.uetr, now=self.START)
        assert len(visible) == 2
        assert visible[1].status == STATUS_ACCEPTED
        assert status["event_count"] == 2
        assert status["current_status"] == STATUS_ACCEPTED

    def test_complete_reveals_all_remaining_and_terminal(self, db_session):
        """TRK-5: complete exposes the whole plan and the terminal state."""
        from app.services.tracking import complete_payment, get_visible_timeline

        self._make_scheduled(db_session)
        status = complete_payment(db_session, self.uetr, now=self.START)
        visible = get_visible_timeline(db_session, self.uetr, now=self.START)
        assert len(visible) == len(get_timeline(db_session, self.uetr))
        assert visible[-1].status == STATUS_CREDITED
        assert status["is_terminal"] is True
        assert status["current_status"] == STATUS_CREDITED

    def test_complete_on_rejected_scheduled_payment_reveals_rejection(
        self, db_session
    ):
        """TRK-5: a rejected plan completes to REJECTED, never CREDITED."""
        from app.services.tracking import complete_payment, get_visible_timeline

        self._make_scheduled(db_session, outcome="rejected")
        complete_payment(db_session, self.uetr, now=self.START)
        visible = get_visible_timeline(db_session, self.uetr, now=self.START)
        assert visible[-1].status == STATUS_REJECTED
        assert STATUS_CREDITED not in [e.status for e in visible]

    def test_repeat_skip_reveals_one_event_each_time(self, db_session):
        """TRK-6: repeating advance is safe — one new event per call."""
        from app.services.tracking import advance_payment, get_visible_timeline

        self._make_scheduled(db_session)
        advance_payment(db_session, self.uetr, now=self.START)
        advance_payment(db_session, self.uetr, now=self.START)
        visible = get_visible_timeline(db_session, self.uetr, now=self.START)
        assert len(visible) == 3
        assert [e.status for e in visible] == [
            STATUS_INITIATED, STATUS_ACCEPTED, STATUS_IN_PROGRESS,
        ]

    def test_advance_after_terminal_is_a_noop(self, db_session):
        """TRK-6: advancing a fully-revealed payment changes nothing."""
        from app.services.tracking import (
            advance_payment,
            complete_payment,
            get_visible_timeline,
        )

        self._make_scheduled(db_session)
        complete_payment(db_session, self.uetr, now=self.START)
        before = get_timeline(db_session, self.uetr)
        snapshot = [(e.hop, e.status, e.timestamp) for e in before]

        status = advance_payment(db_session, self.uetr, now=self.START)
        after = get_timeline(db_session, self.uetr)
        assert len(after) == len(before)
        assert [(e.hop, e.status, e.timestamp) for e in after] == snapshot
        assert status["is_terminal"] is True
        assert len(get_visible_timeline(db_session, self.uetr, now=self.START)) == len(before)

    def test_advance_and_complete_are_noops_for_instant_timelines(self, db_session):
        """TRK-6: instant timelines are never gated by the controls."""
        from app.services.tracking import (
            advance_payment,
            complete_payment,
            get_visible_timeline,
        )

        uetr = generate_uetr()
        generate_timeline(
            session=db_session, uetr=uetr,
            originator_bic="BOFAUS3NXXX", originator_name="BofA",
            beneficiary_bic="GTBINGLAXXX", beneficiary_name="GTB",
            intermediary_bics=["CITIUS33XXX"], intermediary_names=["Citi"],
            currency="USD", amount=1000.00,
            start_time=self.START,
        )
        before = len(get_timeline(db_session, uetr))
        status = advance_payment(db_session, uetr, now=self.START)
        assert len(get_timeline(db_session, uetr)) == before
        assert status["is_terminal"] is True
        complete_payment(db_session, uetr, now=self.START)
        assert len(get_timeline(db_session, uetr)) == before
        assert len(get_visible_timeline(db_session, uetr, now=self.START)) == before

    def test_controls_never_rewrite_planned_timestamps(self, db_session):
        """TRK-6: skip/complete mutate reveal state, never the plan itself."""
        from app.services.tracking import advance_payment, complete_payment

        self._make_scheduled(db_session)
        snapshot = [
            (e.hop, e.status, e.timestamp)
            for e in get_timeline(db_session, self.uetr)
        ]
        advance_payment(db_session, self.uetr, now=self.START)
        complete_payment(db_session, self.uetr, now=self.START)
        after = get_timeline(db_session, self.uetr)
        assert [(e.hop, e.status, e.timestamp) for e in after] == snapshot

    def test_advance_on_rejected_scheduled_payment_reveals_rejection_in_order(
        self, db_session
    ):
        """TRK-4 rejected path: advancing walks the plan through the REJECTED
        event in planned order, then the controls become no-ops."""
        from app.services.tracking import advance_payment, get_visible_timeline

        self._make_scheduled(db_session, outcome="rejected")
        row_count = len(get_timeline(db_session, self.uetr))

        first = advance_payment(db_session, self.uetr, now=self.START)
        assert first["event_count"] == 2
        assert first["current_status"] == STATUS_ACCEPTED
        assert first["is_terminal"] is False

        second = advance_payment(db_session, self.uetr, now=self.START)
        assert second["event_count"] == 3
        assert second["current_status"] == STATUS_REJECTED
        assert second["is_terminal"] is True

        visible = get_visible_timeline(db_session, self.uetr, now=self.START)
        assert [e.status for e in visible] == [
            STATUS_INITIATED, STATUS_ACCEPTED, STATUS_REJECTED,
        ]
        assert len(visible) == row_count

        noop = advance_payment(db_session, self.uetr, now=self.START)
        assert noop["event_count"] == 3
        assert len(get_timeline(db_session, self.uetr)) == row_count

    def test_repeated_advance_and_complete_do_not_duplicate_rows_or_retime(
        self, db_session
    ):
        """TRK-6: repeating either control never duplicates rows and never
        rewrites planned timestamps — only reveal metadata changes."""
        from app.services.tracking import advance_payment, complete_payment

        self._make_scheduled(db_session)
        snapshot = [
            (e.hop, e.status, e.timestamp)
            for e in get_timeline(db_session, self.uetr)
        ]

        advance_payment(db_session, self.uetr, now=self.START)
        advance_payment(db_session, self.uetr, now=self.START)
        advance_payment(db_session, self.uetr, now=self.START)
        complete_payment(db_session, self.uetr, now=self.START)
        complete_payment(db_session, self.uetr, now=self.START)

        after = get_timeline(db_session, self.uetr)
        assert [(e.hop, e.status, e.timestamp) for e in after] == snapshot
        assert len(after) == len(snapshot)

    def test_hidden_plan_rows_survive_a_fresh_session(self, db_session):
        """TRK-7 (1.2 scope): visibility is a read-time function of persisted
        rows — a brand-new session sees the same plan and the same reveal."""
        from app.services.tracking import (
            generate_timeline,
            get_timeline,
            get_visible_timeline,
        )

        engine = db_session.get_bind()
        SessionLocal = sessionmaker(
            bind=engine, autoflush=False, autocommit=False, future=True
        )
        uetr = generate_uetr()
        first = SessionLocal()
        try:
            generate_timeline(
                session=first, uetr=uetr,
                originator_bic="BOFAUS3NXXX", originator_name="BofA",
                beneficiary_bic="GTBINGLAXXX", beneficiary_name="GTB",
                intermediary_bics=["CITIUS33XXX"], intermediary_names=["Citi"],
                currency="USD", amount=1000.00,
                schedule="scheduled", start_time=self.START,
            )
            first.commit()
        finally:
            first.close()

        second = SessionLocal()
        try:
            visible = get_visible_timeline(second, uetr, now=self.START)
            assert len(visible) == 1
            assert visible[0].status == STATUS_INITIATED
            pending = get_timeline(second, uetr)
            assert len(pending) > 1, "Hidden plan rows must survive the restart"
        finally:
            second.close()

    def test_revealed_events_survive_a_fresh_session(self, db_session):
        """TRK-7: reveal state is persisted — a new session sees it."""
        from app.services.tracking import (
            advance_payment,
            generate_timeline,
            get_timeline,
            get_visible_timeline,
        )

        engine = db_session.get_bind()
        SessionLocal = sessionmaker(
            bind=engine, autoflush=False, autocommit=False, future=True
        )
        uetr = generate_uetr()
        first = SessionLocal()
        try:
            generate_timeline(
                session=first, uetr=uetr,
                originator_bic="BOFAUS3NXXX", originator_name="BofA",
                beneficiary_bic="GTBINGLAXXX", beneficiary_name="GTB",
                intermediary_bics=["CITIUS33XXX"], intermediary_names=["Citi"],
                currency="USD", amount=1000.00,
                schedule="scheduled", start_time=self.START,
            )
            advance_payment(first, uetr, now=self.START)
            first.commit()
        finally:
            first.close()

        second = SessionLocal()
        try:
            visible = get_visible_timeline(second, uetr, now=self.START)
            assert len(visible) == 2, "Revealed event must survive the restart"
            pending = get_timeline(second, uetr)
            assert len(pending) > 2, "Hidden plan rows must survive the restart"
        finally:
            second.close()

    def test_initiated_only_status_hides_final_amount_and_fees(self, db_session):
        """TRK-8: a payment stuck at INITIATED is non-terminal and shows no money."""
        from app.services.tracking import get_payment_status

        self._make_scheduled(db_session)
        status = get_payment_status(db_session, self.uetr, now=self.START)
        assert status["current_status"] == STATUS_INITIATED
        assert status["is_terminal"] is False
        assert status["event_count"] == 1
        assert status["final_amount"] is None
        assert status["total_fees"] is None
        assert len(status["timeline"]) == 1

    def test_status_before_start_leaks_no_money_or_row(self, db_session):
        """TRK-8: a clock read before the initiation timestamp is a graceful,
        cash-less state — no hidden-row amount, no bare last_updated."""
        from app.services.tracking import get_payment_status

        self._make_scheduled(db_session)
        early = get_payment_status(db_session, self.uetr, now=self.START - timedelta(seconds=1))
        assert early["current_status"] == STATUS_INITIATED
        assert early["is_terminal"] is False
        assert early["event_count"] == 0
        assert early["sent_amount"] is None
        assert early["final_amount"] is None
        assert early["total_fees"] is None
        assert early["last_updated"] == self.START.isoformat().replace("+00:00", "Z")
        assert early["timeline"] == []

    def test_status_never_leaks_future_statuses(self, db_session):
        """TRK-8: the status summary is computed only from visible events."""
        from app.services.tracking import get_payment_status

        self._make_scheduled(db_session)
        mid = get_payment_status(db_session, self.uetr, now=self.START + timedelta(seconds=51))
        assert mid["current_status"] == STATUS_ACCEPTED
        assert mid["event_count"] == 2
        assert mid["is_terminal"] is False
        assert [e.status for e in mid["timeline"]] == [
            STATUS_INITIATED, STATUS_ACCEPTED,
        ]


# ===========================================================================
# Scheduled pacing — HTTP endpoints
# ===========================================================================


class TestScheduledTrackEndpoints:
    """TRK-9/10: skips and completions are public, unauthenticated learner
    controls; admin/demo creation stays instant. RED phase — these routes do
    not exist yet and prepared payments are not yet scheduled."""

    def _prepare_scheduled_payment(self, client):
        """The only scheduled flow is prepare-payment (plan task 1.4)."""
        r = client.post("/api/prepare-payment", json={
            "beneficiary_iban": "GB29NWBK60161331926819",
            "beneficiary_name": "John Smith",
            "currency": "USD",
            "amount": 5000,
        })
        assert r.status_code == 200
        return r.json()["uetr"]

    def test_skip_reveals_exactly_one_event(self, client):
        uetr = self._prepare_scheduled_payment(client)
        r = client.post(f"/api/track/{uetr}/skip")
        assert r.status_code == 200
        body = r.json()
        assert body["uetr"] == uetr
        assert body["event_count"] == 2
        assert body["current_status"] == STATUS_ACCEPTED
        assert body["is_terminal"] is False

    def test_complete_reveals_terminal_state(self, client):
        uetr = self._prepare_scheduled_payment(client)
        r = client.post(f"/api/track/{uetr}/complete")
        assert r.status_code == 200
        body = r.json()
        assert body["uetr"] == uetr
        assert body["is_terminal"] is True
        assert body["current_status"] == STATUS_CREDITED
        assert body["timeline"][-1]["status"] == STATUS_CREDITED

    def test_unknown_uetr_skip_and_complete_return_404(self, client):
        for action in ("skip", "complete"):
            r = client.post(f"/api/track/00000000-0000-0000-0000-000000000000/{action}")
            assert r.status_code == 404

    def test_repeated_skip_is_idempotent(self, client):
        uetr = self._prepare_scheduled_payment(client)
        first = client.post(f"/api/track/{uetr}/skip").json()
        second = client.post(f"/api/track/{uetr}/skip").json()
        assert first["event_count"] == 2
        assert second["event_count"] == 3  # one new event per call, no dupes

    def test_repeated_complete_is_idempotent(self, client):
        uetr = self._prepare_scheduled_payment(client)
        client.post(f"/api/track/{uetr}/complete")
        again = client.post(f"/api/track/{uetr}/complete")
        assert again.status_code == 200
        body = again.json()
        assert body["is_terminal"] is True
        assert body["current_status"] == STATUS_CREDITED

    def test_get_advances_visibility_when_clock_passes_planned_timestamps(
        self, client, monkeypatch
    ):
        """TRK-9: GET reads through a clock — when it passes a planned
        timestamp the event turns visible without any mutation request."""
        import datetime as _dt

        from app.services import tracking as tracking_module

        class FrozenClock(_dt.datetime):
            current = _dt.datetime(2026, 8, 13, 9, 0, 0, tzinfo=_dt.timezone.utc)

            @classmethod
            def now(cls, tz=None):
                return cls.current

        monkeypatch.setattr(tracking_module, "datetime", FrozenClock)

        uetr = self._prepare_scheduled_payment(client)
        track = client.get(f"/api/track/{uetr}")
        assert track.status_code == 200
        assert track.json()["current_status"] == STATUS_INITIATED
        assert track.json()["event_count"] == 1

        # Jump the clock past the whole chain. The seeded GB/USD corridor
        # runs through several intermediaries (~10 min incl. fees), so a
        # generous +30 min guarantees every planned timestamp has arrived.
        FrozenClock.current += timedelta(minutes=30)
        later = client.get(f"/api/track/{uetr}")
        assert later.status_code == 200
        assert later.json()["current_status"] == STATUS_CREDITED
        assert later.json()["is_terminal"] is True
        assert later.json()["event_count"] > 1

    def test_instant_admin_create_remains_terminal(self, client):
        """TRK-10 guard: POST /api/track/create must keep returning the full
        terminal timeline — the admin/demo path never becomes scheduled."""
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
