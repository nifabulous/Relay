"""
Tests for the telemetry/learning-analytics service (Phase 0).

The telemetry service processes anonymous lab interaction events to compute
learning-loop metrics: completion rate, drop-off point, average time-on-task.
Events are collected client-side (localStorage) and sent to the server for
aggregation in the progress endpoint.

5 event types: lab_viewed, lab_started, lab_completed, exercise_attempted,
exercise_solved.
"""


class TestTelemetryEventProcessing:
    """The telemetry service processes raw events into derived metrics."""

    def test_compute_completion_rate_from_events(self):
        """lab_completed / lab_started = completion rate."""
        from app.services.telemetry import compute_metrics

        events = [
            {"type": "lab_started", "lab_id": "1", "ts": "2026-07-16T10:00:00Z"},
            {"type": "lab_completed", "lab_id": "1", "ts": "2026-07-16T10:08:00Z"},
            {"type": "lab_started", "lab_id": "2", "ts": "2026-07-16T10:10:00Z"},
            # Lab 2 was started but never completed — dropped off
        ]
        metrics = compute_metrics(events)
        assert metrics["completion_rate"] == 0.5  # 1 completed of 2 started

    def test_compute_drop_off_point(self):
        """The last lab started but not completed is the drop-off point."""
        from app.services.telemetry import compute_metrics

        events = [
            {"type": "lab_started", "lab_id": "1", "ts": "2026-07-16T10:00:00Z"},
            {"type": "lab_completed", "lab_id": "1", "ts": "2026-07-16T10:08:00Z"},
            {"type": "lab_started", "lab_id": "2", "ts": "2026-07-16T10:10:00Z"},
            {"type": "lab_completed", "lab_id": "2", "ts": "2026-07-16T10:20:00Z"},
            {"type": "lab_started", "lab_id": "3", "ts": "2026-07-16T10:25:00Z"},
            # Lab 3 started but never completed
        ]
        metrics = compute_metrics(events)
        assert metrics["drop_off_lab"] == "3"

    def test_compute_avg_time_per_lab(self):
        """Average time from lab_started to lab_completed, per lab."""
        from app.services.telemetry import compute_metrics

        events = [
            {"type": "lab_started", "lab_id": "1", "ts": "2026-07-16T10:00:00Z"},
            {"type": "lab_completed", "lab_id": "1", "ts": "2026-07-16T10:08:00Z"},  # 8 min
            {"type": "lab_started", "lab_id": "2", "ts": "2026-07-16T10:10:00Z"},
            {"type": "lab_completed", "lab_id": "2", "ts": "2026-07-16T10:22:00Z"},  # 12 min
        ]
        metrics = compute_metrics(events)
        assert metrics["avg_lab_duration_seconds"] == 600  # avg(480 + 720) = 600

    def test_no_events_returns_empty_metrics(self):
        from app.services.telemetry import compute_metrics

        metrics = compute_metrics([])
        assert metrics["completion_rate"] is None
        assert metrics["drop_off_lab"] is None
        assert metrics["avg_lab_duration_seconds"] is None

    def test_drop_off_none_if_all_started_are_completed(self):
        from app.services.telemetry import compute_metrics

        events = [
            {"type": "lab_started", "lab_id": "1", "ts": "2026-07-16T10:00:00Z"},
            {"type": "lab_completed", "lab_id": "1", "ts": "2026-07-16T10:08:00Z"},
        ]
        metrics = compute_metrics(events)
        assert metrics["drop_off_lab"] is None

    def test_exercise_metrics_computed(self):
        """exercise_solved / exercise_attempted = exercise success rate."""
        from app.services.telemetry import compute_metrics

        events = [
            {"type": "exercise_attempted", "lab_id": "1", "ts": "2026-07-16T10:03:00Z"},
            {"type": "exercise_attempted", "lab_id": "1", "ts": "2026-07-16T10:04:00Z"},
            {"type": "exercise_solved", "lab_id": "1", "ts": "2026-07-16T10:04:30Z"},
        ]
        metrics = compute_metrics(events)
        assert metrics["exercise_success_rate"] == 0.5  # 1 solved of 2 attempted

    def test_labs_viewed_count(self):
        """lab_viewed events track unique lab visits (for drop-off analysis)."""
        from app.services.telemetry import compute_metrics

        events = [
            {"type": "lab_viewed", "lab_id": "1", "ts": "2026-07-16T10:00:00Z"},
            {"type": "lab_viewed", "lab_id": "2", "ts": "2026-07-16T10:10:00Z"},
            {"type": "lab_viewed", "lab_id": "1", "ts": "2026-07-16T11:00:00Z"},  # repeat visit
        ]
        metrics = compute_metrics(events)
        assert metrics["labs_viewed"] == 2  # unique labs viewed
        assert metrics["total_views"] == 3  # total view events


class TestProgressEndpointWithTelemetry:
    """The /api/progress endpoint optionally accepts telemetry events
    and returns derived metrics alongside the existing progress summary."""

    def test_progress_without_telemetry_works_as_before(self, client):
        """Existing callers who don't send telemetry get the same response."""
        r = client.get("/api/progress", params={"completed": "1,2"})
        assert r.status_code == 200
        body = r.json()
        assert body["completed_count"] == 2
        # No telemetry fields if no events sent
        assert "telemetry" not in body or body.get("telemetry") is None

    def test_progress_with_telemetry_returns_metrics(self, client):
        """Telemetry events sent to POST /api/telemetry return derived metrics."""
        events = [
            {"type": "lab_started", "lab_id": "1", "ts": "2026-07-16T10:00:00Z"},
            {"type": "lab_completed", "lab_id": "1", "ts": "2026-07-16T10:08:00Z"},
            {"type": "lab_started", "lab_id": "2", "ts": "2026-07-16T10:10:00Z"},
        ]
        r = client.post("/api/telemetry", json=events)
        assert r.status_code == 200
        body = r.json()
        assert body["completion_rate"] == 0.5
        assert body["drop_off_lab"] == "2"

    def test_telemetry_post_endpoint(self, client):
        """POST /api/telemetry accepts events and returns computed metrics."""
        events = [
            {"type": "lab_started", "lab_id": "1", "ts": "2026-07-16T10:00:00Z"},
            {"type": "lab_completed", "lab_id": "1", "ts": "2026-07-16T10:08:00Z"},
            {"type": "lab_started", "lab_id": "2", "ts": "2026-07-16T10:10:00Z"},
        ]
        r = client.post("/api/telemetry", json=events)
        assert r.status_code == 200
        body = r.json()
        assert body["completion_rate"] == 0.5
        assert body["drop_off_lab"] == "2"
