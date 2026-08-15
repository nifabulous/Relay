"""Rate limiting for the tutor: the only thing between a loop and a provider bill.

Every other guard in the tutor protects the learner. This one protects the
deployment: the tutor is the single endpoint in Relay that costs real money per
call, so an unbounded client is a billing incident rather than a slow page.

Two properties matter and are easy to get wrong:

* the limit is checked **before** any provider work, not after
* the key cannot be chosen by the caller
"""
import time
from collections import deque
from concurrent.futures import ThreadPoolExecutor

import pytest

try:
    import tomllib
except ModuleNotFoundError:
    import tomli as tomllib

from app.tutor.limits import (
    InMemoryRateLimiter,
    RateLimiter,
    limiter_key_for,
    production_limiter_is_missing,
)


class _Clock:
    """A hand-cranked clock. Real sleeps would make this suite slow and flaky."""

    def __init__(self):
        self.now = 1000.0

    def __call__(self) -> float:
        return self.now

    def advance(self, seconds: float) -> None:
        self.now += seconds


# ── In-memory limiter ───────────────────────────────────────────────────────


def test_requests_under_the_limit_are_allowed():
    limiter = InMemoryRateLimiter(limit=3, window_seconds=60, clock=_Clock())
    assert [limiter.allow("a") for _ in range(3)] == [True, True, True]


def test_the_request_over_the_limit_is_refused():
    limiter = InMemoryRateLimiter(limit=2, window_seconds=60, clock=_Clock())
    limiter.allow("a")
    limiter.allow("a")
    assert limiter.allow("a") is False


def test_the_window_rolls_forward_rather_than_resetting_on_a_fixed_boundary():
    """A fixed window lets a caller send 2x the limit across a boundary.

    Rolling means the oldest request ages out one at a time, which is what makes
    the ceiling actually hold.
    """
    clock = _Clock()
    limiter = InMemoryRateLimiter(limit=2, window_seconds=60, clock=clock)
    limiter.allow("a")
    clock.advance(59)
    limiter.allow("a")
    assert limiter.allow("a") is False

    clock.advance(2)  # the first request is now outside the window
    assert limiter.allow("a") is True


def test_keys_are_independent():
    limiter = InMemoryRateLimiter(limit=1, window_seconds=60, clock=_Clock())
    assert limiter.allow("a") is True
    assert limiter.allow("b") is True
    assert limiter.allow("a") is False


def test_old_keys_are_evicted_so_the_limiter_does_not_grow_forever():
    """An in-process limiter keyed by address is a memory leak with a schedule.

    Without eviction, one entry per distinct caller accumulates for the life of
    the worker.
    """
    clock = _Clock()
    limiter = InMemoryRateLimiter(limit=5, window_seconds=60, clock=clock)
    for index in range(500):
        limiter.allow(f"key-{index}")
    clock.advance(120)
    limiter.allow("fresh")
    assert limiter.tracked_keys() <= 2


def test_the_in_memory_limiter_satisfies_the_protocol():
    assert isinstance(InMemoryRateLimiter(limit=1, window_seconds=1), RateLimiter)


def test_in_memory_limiter_keeps_its_limit_when_calls_overlap():
    """The async router invokes this synchronous fallback from worker threads."""

    class _SlowDeque(deque):
        def __len__(self):
            size = super().__len__()
            time.sleep(0.002)
            return size

    limiter = InMemoryRateLimiter(limit=1, window_seconds=60, clock=_Clock())
    limiter._hits["same"] = _SlowDeque()
    limiter._evict = lambda cutoff: None

    with ThreadPoolExecutor(max_workers=16) as pool:
        results = list(pool.map(lambda _: limiter.allow("same"), range(16)))

    assert sum(results) == 1


def test_daily_ceiling_keeps_its_limit_when_comparisons_overlap():
    """The deployment-wide fallback must be atomic as well as the per-key one."""

    class _SlowCount(int):
        def __ge__(self, other):
            time.sleep(0.002)
            return super().__ge__(other)

    from app.tutor.limits import DailyRequestCeiling

    ceiling = DailyRequestCeiling(limit=1, clock=_Clock())
    ceiling.used = _SlowCount(0)

    with ThreadPoolExecutor(max_workers=16) as pool:
        results = list(pool.map(lambda _: ceiling.allow(), range(16)))

    assert sum(results) == 1


# ── Key resolution ──────────────────────────────────────────────────────────


class _Request:
    def __init__(self, client_host="203.0.113.7", headers=None):
        self.client = type("Client", (), {"host": client_host})()
        self.headers = headers or {}


def test_the_key_comes_from_the_socket_address_by_default():
    assert limiter_key_for(_Request(client_host="203.0.113.7")) == "ip:203.0.113.7"


def test_a_client_supplied_forwarded_header_is_ignored_by_default():
    """`X-Forwarded-For` is caller-controlled unless a proxy is known to rewrite it.

    Trusting it by default means any client can mint a fresh limit bucket per
    request by changing one header — which is not a partial limit, it is no
    limit at all.
    """
    request = _Request(
        client_host="203.0.113.7", headers={"x-forwarded-for": "198.51.100.1"}
    )
    assert limiter_key_for(request) == "ip:203.0.113.7"


def test_a_trusted_proxy_hop_count_selects_the_right_entry(monkeypatch):
    """With one trusted proxy, the client address is the last entry.

    Taking the *first* entry is the classic mistake: that end of the list is
    exactly the part a caller can prepend to.
    """
    monkeypatch.setenv("TUTOR_TRUSTED_PROXY_HOPS", "1")
    request = _Request(
        client_host="10.0.0.1",
        headers={"x-forwarded-for": "198.51.100.1, 203.0.113.7"},
    )
    assert limiter_key_for(request) == "ip:203.0.113.7"


def test_more_trusted_hops_than_entries_falls_back_to_the_socket(monkeypatch):
    monkeypatch.setenv("TUTOR_TRUSTED_PROXY_HOPS", "4")
    request = _Request(client_host="10.0.0.1", headers={"x-forwarded-for": "198.51.100.1"})
    assert limiter_key_for(request) == "ip:10.0.0.1"


def test_a_missing_client_still_produces_a_usable_key():
    request = _Request()
    request.client = None
    assert limiter_key_for(request) == "ip:unknown"


# ── Production safeguard ────────────────────────────────────────────────────


def test_an_in_process_limiter_is_flagged_as_insufficient_in_production(monkeypatch):
    """In-process buckets reset on every cold start and are per-instance.

    On a platform that runs many short-lived instances, that is a limit in name
    only — which is why enabling the tutor there without the shared limiter is
    refused rather than quietly permitted.
    """
    monkeypatch.setenv("VERCEL", "1")
    monkeypatch.setenv("TUTOR_ENABLED", "true")
    monkeypatch.delenv("TUTOR_RATE_LIMIT_REDIS_URL", raising=False)
    assert production_limiter_is_missing() is True


def test_a_configured_shared_limiter_satisfies_the_production_safeguard(monkeypatch):
    monkeypatch.setenv("VERCEL", "1")
    monkeypatch.setenv("TUTOR_ENABLED", "true")
    monkeypatch.setenv("TUTOR_RATE_LIMIT_REDIS_URL", "https://redis.example")
    monkeypatch.setenv("TUTOR_RATE_LIMIT_REDIS_TOKEN", "token")
    assert production_limiter_is_missing() is False


def test_local_development_needs_no_shared_limiter(monkeypatch):
    monkeypatch.delenv("VERCEL", raising=False)
    monkeypatch.setenv("TUTOR_ENABLED", "true")
    monkeypatch.delenv("TUTOR_RATE_LIMIT_REDIS_URL", raising=False)
    assert production_limiter_is_missing() is False


@pytest.mark.parametrize("limit", [0, -5])
def test_a_non_positive_limit_refuses_everything_rather_than_allowing_everything(limit):
    """Fail closed. A misconfigured ceiling of zero must not mean "no ceiling"."""
    limiter = InMemoryRateLimiter(limit=limit, window_seconds=60, clock=_Clock())
    assert limiter.allow("a") is False


# ── Review fixes: T15, T3, T5, T6, T4 ───────────────────────────────────────


def test_one_predicate_answers_whether_this_is_a_multi_instance_deployment(monkeypatch):
    """T15. Three call sites were each re-deriving "are we in production?" from
    `os.getenv("VERCEL")`. Three copies of a platform assumption drift the moment
    the platform changes, and the drift is silent."""
    from app.config import is_multi_instance_deployment

    monkeypatch.delenv("VERCEL", raising=False)
    assert is_multi_instance_deployment() is False
    monkeypatch.setenv("VERCEL", "1")
    assert is_multi_instance_deployment() is True


def test_the_production_gate_requires_the_redis_token_not_just_the_url(monkeypatch):
    """T3. A URL with no token cannot authenticate, so the limiter would build,
    fail every call, and fail open — advertising a limit that never applies."""
    monkeypatch.setenv("VERCEL", "1")
    monkeypatch.setenv("TUTOR_ENABLED", "true")
    monkeypatch.setenv("TUTOR_RATE_LIMIT_REDIS_URL", "https://redis.example")
    monkeypatch.delenv("TUTOR_RATE_LIMIT_REDIS_TOKEN", raising=False)
    assert production_limiter_is_missing() is True

    monkeypatch.setenv("TUTOR_RATE_LIMIT_REDIS_TOKEN", "tok")
    assert production_limiter_is_missing() is False


def test_the_ceiling_fails_closed_when_its_backend_errors():
    """T5. The limiter protects latency; the ceiling protects the bill.

    A limiter that fails open costs a slow minute. A ceiling that fails open
    costs money with no bound, which is the one failure nobody notices until it
    appears on an invoice.
    """
    from app.tutor.limits import RedisDailyCeiling

    class _Broken:
        def incr(self, key):
            raise RuntimeError("redis down")

    ceiling = RedisDailyCeiling(limit=100, client=_Broken())
    assert ceiling.allow() is False


def test_the_limiter_keeps_failing_open_when_its_backend_errors():
    """T5, the other half. Availability beats strictness for the rate limit."""
    from app.tutor.limits import RedisRateLimiter

    limiter = RedisRateLimiter(url="https://x", token="y", limit=5)

    class _Broken:
        def incr(self, key):
            raise RuntimeError("redis down")

    limiter._client = _Broken()
    assert limiter.allow("k") is True


def test_proxy_hops_default_to_one_on_a_known_platform(monkeypatch):
    """T6. Requiring an operator to hand-set TUTOR_TRUSTED_PROXY_HOPS on Vercel
    means the default deploy silently rate-limits every learner as one bucket,
    because the socket peer is the platform's proxy."""
    from app.tutor.limits import _trusted_proxy_hops

    monkeypatch.delenv("TUTOR_TRUSTED_PROXY_HOPS", raising=False)
    monkeypatch.setenv("VERCEL", "1")
    assert _trusted_proxy_hops() == 1

    monkeypatch.delenv("VERCEL", raising=False)
    assert _trusted_proxy_hops() == 0


def test_an_explicit_hop_count_still_overrides_the_platform_default(monkeypatch):
    monkeypatch.setenv("VERCEL", "1")
    monkeypatch.setenv("TUTOR_TRUSTED_PROXY_HOPS", "2")
    from app.tutor.limits import _trusted_proxy_hops

    assert _trusted_proxy_hops() == 2


def test_the_daily_ceiling_is_shared_across_instances_when_redis_is_configured(
    monkeypatch,
):
    """T4. An in-process daily ceiling on a platform that runs many short-lived
    instances is per-instance and resets on every cold start, so the deployment
    ceiling is really `instances x limit` with no upper bound."""
    monkeypatch.setenv("TUTOR_RATE_LIMIT_REDIS_URL", "https://redis.example")
    monkeypatch.setenv("TUTOR_RATE_LIMIT_REDIS_TOKEN", "tok")
    monkeypatch.setenv("TUTOR_DAILY_REQUEST_CEILING", "500")
    from app.tutor.limits import RedisDailyCeiling, build_daily_ceiling

    assert isinstance(build_daily_ceiling(), RedisDailyCeiling)


def test_an_unconfigured_daily_ceiling_stays_in_process(monkeypatch):
    monkeypatch.delenv("TUTOR_RATE_LIMIT_REDIS_URL", raising=False)
    monkeypatch.setenv("TUTOR_DAILY_REQUEST_CEILING", "500")
    from app.tutor.limits import DailyRequestCeiling, build_daily_ceiling

    assert isinstance(build_daily_ceiling(), DailyRequestCeiling)


def test_upstash_redis_is_declared_so_the_production_limiter_can_import():
    """T2. RedisRateLimiter imports `upstash_redis`, which appeared in no extra.

    Every production call would raise ImportError, get swallowed by the
    fail-open handler, and allow. The limit would be silently absent.
    """
    from app.config import BASE_DIR

    with open(BASE_DIR / "pyproject.toml", "rb") as handle:
        extras = tomllib.load(handle)["project"]["optional-dependencies"]
    assert "upstash-redis" in " ".join(extras["ai"]).lower()
