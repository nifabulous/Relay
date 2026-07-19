"""
Tests for the progress/badge system — TDD: these are written FIRST.
They define the contract for a progress service that tracks module completion,
computes badges, and returns a dashboard summary.

The service takes a list of completed module IDs (from localStorage via the
frontend, or from a query param) and returns:
- completion stats (completed / total, percentage)
- earned badges (with names + descriptions)
- next recommended module
"""


class TestProgressService:
    """Unit tests for the progress computation logic."""

    def test_empty_progress_returns_zero_completion(self):
        from app.services.progress import get_progress_summary
        result = get_progress_summary([])
        assert result.completed_count == 0
        assert result.total_count > 0
        assert result.percentage == 0
        assert result.earned_badges == []

    def test_all_modules_completed(self):
        from app.services.progress import ALL_MODULE_IDS, get_progress_summary
        result = get_progress_summary(ALL_MODULE_IDS)
        assert result.completed_count == result.total_count
        assert result.percentage == 100
        assert len(result.earned_badges) > 0

    def test_partial_completion(self):
        from app.services.progress import get_progress_summary
        result = get_progress_summary(["1", "2", "3"])
        assert result.completed_count == 3
        assert result.percentage > 0
        assert result.percentage < 100

    def test_unknown_module_ids_ignored(self):
        from app.services.progress import get_progress_summary
        result = get_progress_summary(["1", "FAKE", "2"])
        assert result.completed_count == 2

    def test_duplicate_ids_counted_once(self):
        from app.services.progress import get_progress_summary
        result = get_progress_summary(["1", "1", "1"])
        assert result.completed_count == 1

    def test_core_labs_badge_earned(self):
        """'Payment Fundamentals' badge: complete Labs 1-3."""
        from app.services.progress import get_progress_summary
        result = get_progress_summary(["1", "2", "3"])
        badge_names = [b.name for b in result.earned_badges]
        assert "Payment Fundamentals" in badge_names

    def test_core_labs_badge_not_earned_with_partial(self):
        from app.services.progress import get_progress_summary
        result = get_progress_summary(["1", "2"])
        badge_names = [b.name for b in result.earned_badges]
        assert "Payment Fundamentals" not in badge_names

    def test_operator_badge_earned_on_capstone(self):
        """'Payment Operator' badge: complete all 8 labs + capstone."""
        from app.services.progress import get_progress_summary
        result = get_progress_summary(
            ["1", "2", "3", "4", "5", "6", "7", "8", "capstone"]
        )
        badge_names = [b.name for b in result.earned_badges]
        assert "Payment Operator" in badge_names

    def test_fee_badge_earned(self):
        """'Fee Forensics' badge: complete the Fee Calculator."""
        from app.services.progress import get_progress_summary
        result = get_progress_summary(["fees"])
        badge_names = [b.name for b in result.earned_badges]
        assert "Fee Forensics" in badge_names

    def test_fx_badge_earned(self):
        """'FX Sharp' badge: complete the FX Calculator."""
        from app.services.progress import get_progress_summary
        result = get_progress_summary(["fx"])
        badge_names = [b.name for b in result.earned_badges]
        assert "FX Sharp" in badge_names

    def test_compliance_badge_earned(self):
        """'Compliance Aware' badge: complete Sanctions Screening."""
        from app.services.progress import get_progress_summary
        result = get_progress_summary(["sanctions"])
        badge_names = [b.name for b in result.earned_badges]
        assert "Compliance Aware" in badge_names

    def test_completionist_badge_earned(self):
        """'Wire Wizard' badge: complete ALL modules."""
        from app.services.progress import ALL_MODULE_IDS, get_progress_summary
        result = get_progress_summary(ALL_MODULE_IDS)
        badge_names = [b.name for b in result.earned_badges]
        assert "Wire Wizard" in badge_names

    def test_completionist_badge_not_earned_partial(self):
        from app.services.progress import ALL_MODULE_IDS, get_progress_summary
        partial = ALL_MODULE_IDS[:-1]  # all except last
        result = get_progress_summary(partial)
        badge_names = [b.name for b in result.earned_badges]
        assert "Wire Wizard" not in badge_names

    def test_next_recommended_when_not_done(self):
        """When incomplete, next_recommended should be the first uncompleted module."""
        from app.services.progress import get_progress_summary
        result = get_progress_summary(["1", "2"])
        assert result.next_recommended is not None
        assert result.next_recommended not in ["1", "2"]

    def test_next_recommended_none_when_all_done(self):
        from app.services.progress import ALL_MODULE_IDS, get_progress_summary
        result = get_progress_summary(ALL_MODULE_IDS)
        assert result.next_recommended is None

    def test_badge_has_description(self):
        from app.services.progress import get_progress_summary
        result = get_progress_summary(["fees"])
        for badge in result.earned_badges:
            assert len(badge.description) > 10

    def test_all_module_ids_nonempty(self):
        from app.services.progress import ALL_MODULE_IDS
        assert len(ALL_MODULE_IDS) >= 10

    def test_all_module_ids_are_strings(self):
        from app.services.progress import ALL_MODULE_IDS
        for mid in ALL_MODULE_IDS:
            assert isinstance(mid, str)


class TestProgressEndpoint:
    """HTTP tests for GET /api/progress."""

    def test_empty_progress(self, client):
        r = client.get("/api/progress")
        assert r.status_code == 200
        body = r.json()
        assert body["completed_count"] == 0
        assert body["total_count"] > 0
        assert body["percentage"] == 0
        assert body["earned_badges"] == []
        assert "next_recommended" in body

    def test_with_completed_param(self, client):
        r = client.get("/api/progress", params={"completed": "1,2,3"})
        assert r.status_code == 200
        body = r.json()
        assert body["completed_count"] == 3
        assert len(body["earned_badges"]) > 0

    def test_all_modules(self, client):
        from app.services.progress import ALL_MODULE_IDS
        completed = ",".join(ALL_MODULE_IDS)
        r = client.get("/api/progress", params={"completed": completed})
        assert r.status_code == 200
        body = r.json()
        assert body["percentage"] == 100

    def test_badge_structure(self, client):
        r = client.get("/api/progress", params={"completed": "fees"})
        body = r.json()
        for badge in body["earned_badges"]:
            assert "name" in badge
            assert "description" in badge

    def test_all_badges_listed(self, client):
        """GET /api/progress returns all possible badges, earned or not."""
        r = client.get("/api/progress")
        body = r.json()
        assert "all_badges" in body
        assert len(body["all_badges"]) >= 6
        for badge in body["all_badges"]:
            assert "name" in badge
            assert "description" in badge
            assert "requirement" in badge


def test_all_module_ids_includes_lab_8():
    from app.services.progress import ALL_MODULE_IDS
    assert "8" in ALL_MODULE_IDS


def test_payment_operator_badge_requires_all_eight_labs():
    from app.services.progress import get_progress_summary
    # Labs 1-7 + capstone but NOT lab-8 -> operator badge not yet earned.
    seven = get_progress_summary(["1", "2", "3", "4", "5", "6", "7", "capstone"])
    assert "payment-operator" not in {b.id for b in seven.earned_badges}
    # All 8 labs + capstone -> earned.
    eight = get_progress_summary(["1", "2", "3", "4", "5", "6", "7", "8", "capstone"])
    assert "payment-operator" in {b.id for b in eight.earned_badges}
