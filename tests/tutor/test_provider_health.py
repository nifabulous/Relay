"""Provider health: retry, circuit breaking, and the spend ceiling.

The tutor is the only endpoint in Relay that spends money per call and depends
on a third party to answer at all. Two failure shapes matter, and they pull in
opposite directions:

* **A blip.** One request fails and a retry would have worked. Not retrying
  turns a recoverable hiccup into a visible outage.
* **A sustained outage.** The provider is down or over quota. Retrying every
  request doubles the load and the bill while making every learner wait twice as
  long for the same failure.

A bounded retry handles the first; a circuit breaker handles the second. Without
the breaker, the retry actively makes an outage worse.
"""
import pytest

from app.tutor.engine import CircuitBreaker
from app.tutor.limits import (
    DailyRequestCeiling,
    production_spend_ceiling_is_missing,
)


class _Clock:
    def __init__(self):
        self.now = 1000.0

    def __call__(self) -> float:
        return self.now

    def advance(self, seconds: float) -> None:
        self.now += seconds


# ── Circuit breaker ─────────────────────────────────────────────────────────


def test_a_closed_breaker_allows_requests():
    assert CircuitBreaker(failure_threshold=3, reset_seconds=60, clock=_Clock()).allow() is True


def test_the_breaker_opens_after_consecutive_failures():
    breaker = CircuitBreaker(failure_threshold=3, reset_seconds=60, clock=_Clock())
    for _ in range(3):
        breaker.record_failure()
    assert breaker.allow() is False


def test_a_success_resets_the_failure_count():
    """Counting *consecutive* failures is the point.

    A cumulative count would eventually open the breaker on a healthy provider
    that has been serving for a month, which is an outage we caused ourselves.
    """
    breaker = CircuitBreaker(failure_threshold=3, reset_seconds=60, clock=_Clock())
    breaker.record_failure()
    breaker.record_failure()
    breaker.record_success()
    breaker.record_failure()
    breaker.record_failure()
    assert breaker.allow() is True


def test_the_breaker_half_opens_after_the_reset_window():
    """It has to let one request through to discover the provider recovered.

    A breaker that never retests stays open forever and needs a human to notice
    and redeploy.
    """
    clock = _Clock()
    breaker = CircuitBreaker(failure_threshold=2, reset_seconds=60, clock=clock)
    breaker.record_failure()
    breaker.record_failure()
    assert breaker.allow() is False

    clock.advance(61)
    assert breaker.allow() is True


def test_a_failure_while_half_open_re_opens_the_breaker():
    clock = _Clock()
    breaker = CircuitBreaker(failure_threshold=2, reset_seconds=60, clock=clock)
    breaker.record_failure()
    breaker.record_failure()
    clock.advance(61)
    breaker.allow()
    breaker.record_failure()
    assert breaker.allow() is False


def test_a_success_while_half_open_closes_the_breaker():
    clock = _Clock()
    breaker = CircuitBreaker(failure_threshold=2, reset_seconds=60, clock=clock)
    breaker.record_failure()
    breaker.record_failure()
    clock.advance(61)
    breaker.allow()
    breaker.record_success()
    assert breaker.allow() is True
    assert breaker.state == "closed"


def test_the_breaker_reports_its_state_for_telemetry():
    breaker = CircuitBreaker(failure_threshold=1, reset_seconds=60, clock=_Clock())
    assert breaker.state == "closed"
    breaker.record_failure()
    assert breaker.state == "open"


# ── Spend ceiling ───────────────────────────────────────────────────────────


def test_requests_under_the_daily_ceiling_are_allowed():
    ceiling = DailyRequestCeiling(limit=3, clock=_Clock())
    assert [ceiling.allow() for _ in range(3)] == [True, True, True]


def test_the_request_over_the_daily_ceiling_is_refused():
    ceiling = DailyRequestCeiling(limit=2, clock=_Clock())
    ceiling.allow()
    ceiling.allow()
    assert ceiling.allow() is False


def test_the_ceiling_resets_after_a_day():
    clock = _Clock()
    ceiling = DailyRequestCeiling(limit=1, clock=clock)
    assert ceiling.allow() is True
    assert ceiling.allow() is False
    clock.advance(86_401)
    assert ceiling.allow() is True


def test_a_retry_consumes_the_ceiling_too():
    """Otherwise the ceiling counts learner requests while the bill counts
    provider calls, and a retrying deployment silently spends twice its cap."""
    ceiling = DailyRequestCeiling(limit=2, clock=_Clock())
    ceiling.allow()
    ceiling.allow()
    assert ceiling.allow() is False


def test_an_unset_ceiling_allows_everything_locally():
    """Local development must not need a budget configured to run the tutor."""
    assert DailyRequestCeiling(limit=None, clock=_Clock()).allow() is True


def test_the_ceiling_reports_what_it_has_spent():
    ceiling = DailyRequestCeiling(limit=10, clock=_Clock())
    ceiling.allow()
    ceiling.allow()
    assert ceiling.used == 2


# ── Production safeguards ───────────────────────────────────────────────────


def test_production_without_a_spend_ceiling_is_refused(monkeypatch):
    """A tutor enabled in production with no cap is an unbounded bill.

    The provider's own quota is not a substitute: it is set per organisation,
    not per deployment, so a runaway preview environment would exhaust the
    budget the production app depends on.
    """
    monkeypatch.setenv("VERCEL", "1")
    monkeypatch.setenv("TUTOR_ENABLED", "true")
    monkeypatch.delenv("TUTOR_DAILY_REQUEST_CEILING", raising=False)
    assert production_spend_ceiling_is_missing() is True


def test_a_configured_ceiling_satisfies_the_production_safeguard(monkeypatch):
    monkeypatch.setenv("VERCEL", "1")
    monkeypatch.setenv("TUTOR_ENABLED", "true")
    monkeypatch.setenv("TUTOR_DAILY_REQUEST_CEILING", "5000")
    assert production_spend_ceiling_is_missing() is False


def test_local_development_needs_no_spend_ceiling(monkeypatch):
    monkeypatch.delenv("VERCEL", raising=False)
    monkeypatch.setenv("TUTOR_ENABLED", "true")
    monkeypatch.delenv("TUTOR_DAILY_REQUEST_CEILING", raising=False)
    assert production_spend_ceiling_is_missing() is False


def test_a_disabled_tutor_needs_no_ceiling_even_in_production(monkeypatch):
    monkeypatch.setenv("VERCEL", "1")
    monkeypatch.delenv("TUTOR_ENABLED", raising=False)
    assert production_spend_ceiling_is_missing() is False


@pytest.mark.parametrize("raw", ["0", "-1", "not-a-number"])
def test_a_malformed_ceiling_counts_as_missing_rather_than_unlimited(
    monkeypatch, raw
):
    """Fail closed. A typo in the budget variable must not mean "no budget"."""
    monkeypatch.setenv("VERCEL", "1")
    monkeypatch.setenv("TUTOR_ENABLED", "true")
    monkeypatch.setenv("TUTOR_DAILY_REQUEST_CEILING", raw)
    assert production_spend_ceiling_is_missing() is True
