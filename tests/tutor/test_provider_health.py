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
import logging

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


# ── Review fix: T13 — the engine's use of retry and breaker ─────────────────
#
# The breaker and the retry were tested in isolation, which proves the
# mechanisms and not the wiring. These drive the real adapter with a fake
# provider, because the wiring is where the interesting mistakes live: a retry
# that does not count toward the breaker, or a breaker that opens and is then
# ignored, both pass isolated tests.

import asyncio
from types import SimpleNamespace

import pytest

from app.tutor.engine import TutorProviderError, _PydanticAITutorEngine
from app.tutor.retrieval import retrieve_documents
from app.tutor.schemas import TutorContext, TutorModelOutput, TutorRequest
from app.tutor.tools import RelayTutorTools


def _engine_with(responses):
    """A real _PydanticAITutorEngine with its provider call swapped for a script.

    Subclassed rather than mocked so everything around the provider call — the
    breaker, the retry, the budget, the validation — is the production path.
    """

    class _Scripted(_PydanticAITutorEngine):
        def __init__(self):
            self.attempts = 0
            self._max_input_tokens = 14000
            self._max_history_turns = 8
            from app.tutor.engine import CircuitBreaker

            self._breaker = CircuitBreaker(failure_threshold=2, reset_seconds=60)

        async def _call_provider(self, payload, tools):
            outcome = responses[min(self.attempts, len(responses) - 1)]
            self.attempts += 1
            if isinstance(outcome, Exception):
                raise outcome
            if hasattr(outcome, "output"):
                return outcome
            return type("Result", (), {"output": outcome})()

    return _Scripted()


def _run(engine):
    request = TutorRequest(message="What is an IBAN?", context=TutorContext(surface="global"))
    documents = retrieve_documents(request.message, context=request.context)
    return asyncio.run(engine.answer(request, documents, RelayTutorTools()))


def test_a_single_transient_failure_is_retried_and_succeeds():
    good = TutorModelOutput(answer="An IBAN identifies an account.", citations=[])
    engine = _engine_with([TutorProviderError("blip"), good])
    _run(engine)
    assert engine.attempts == 2, "one retry should have rescued the blip"


def test_provider_failure_logs_the_source_exception_class_without_its_message(caplog):
    class ProviderShapeError(RuntimeError):
        pass

    engine = _engine_with([ProviderShapeError("request secret should not be logged")])
    with caplog.at_level(logging.WARNING, logger="app.tutor.engine"):
        with pytest.raises(TutorProviderError):
            _run(engine)

    assert "tutor provider call failed: ProviderShapeError" in caplog.text
    assert "request secret should not be logged" not in caplog.text


def test_provider_success_logs_bounded_usage_and_finish_reason(caplog):
    good = TutorModelOutput(answer="An IBAN identifies an account.", citations=[])
    result = SimpleNamespace(
        output=good,
        usage=SimpleNamespace(input_tokens=123, output_tokens=45, requests=1, tool_calls=0),
        response=SimpleNamespace(finish_reason="stop"),
    )
    engine = _engine_with([result])

    with caplog.at_level(logging.INFO, logger="app.tutor.engine"):
        _run(engine)

    assert "input_tokens=123" in caplog.text
    assert "output_tokens=45" in caplog.text
    assert "requests=1" in caplog.text
    assert "tool_calls=0" in caplog.text
    assert "finish_reason=stop" in caplog.text
    assert "elapsed_ms=" in caplog.text


def test_diagnostics_access_failures_do_not_break_a_valid_provider_response():
    good = TutorModelOutput(answer="An IBAN identifies an account.", citations=[])

    class _DiagnosticsUnavailable:
        output = good

        @property
        def usage(self):
            raise RuntimeError("usage metadata unavailable")

        @property
        def response(self):
            raise RuntimeError("response metadata unavailable")

    engine = _engine_with([_DiagnosticsUnavailable()])
    response = _run(engine)

    assert response.turn_id
    assert response.grounded is False


def test_the_retry_is_bounded_to_one_extra_attempt():
    """A third attempt mostly triples the latency of an outage the learner is
    already waiting through, and triples the spend on a call that will fail."""
    engine = _engine_with([TutorProviderError("down")])
    with pytest.raises(TutorProviderError):
        _run(engine)
    assert engine.attempts == 2


def test_repeated_failures_open_the_breaker_and_stop_calling_the_provider():
    """The point of the breaker: once it is open, the provider is not called at
    all, so an outage stops costing money and stops making learners wait."""
    engine = _engine_with([TutorProviderError("down")])
    for _ in range(2):
        with pytest.raises(TutorProviderError):
            _run(engine)
    attempts_before = engine.attempts

    with pytest.raises(TutorProviderError):
        _run(engine)
    assert engine.attempts == attempts_before, "an open breaker must not call the provider"
