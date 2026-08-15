"""Rate limiting for the tutor endpoint.

Every other guard in the tutor protects the learner. This one protects the
deployment: `/api/tutor/chat` is the only endpoint in Relay that costs real
money per call, so an unbounded client is a billing incident rather than a slow
page.

Two properties carry the whole design:

**The limit is checked before any provider work.** Checking afterwards bills for
the request it was meant to prevent.

**The key cannot be chosen by the caller.** `X-Forwarded-For` is
caller-controlled unless a proxy is known to rewrite it, so trusting it by
default lets any client mint a fresh bucket per request by changing one header.
That is not a weakened limit; it is no limit. The header is consulted only when
`TUTOR_TRUSTED_PROXY_HOPS` says how many proxies sit in front, and then the
entry is counted **from the right** — the left end of that list is exactly the
part a caller can prepend to.

The in-process limiter is a local and single-worker fallback. On a platform that
runs many short-lived instances, per-instance buckets that reset on every cold
start are a limit in name only, which is why `production_limiter_is_missing()`
exists and the router refuses to serve rather than quietly pretending.
"""
import os
import time
from collections import deque
from typing import Callable, Deque, Dict, Optional, Protocol, runtime_checkable

from app.config import tutor_settings

# Deliberately conservative. A learner asking questions in a lesson does not
# approach this; a script does immediately.
DEFAULT_LIMIT = 20
DEFAULT_WINDOW_SECONDS = 60


@runtime_checkable
class RateLimiter(Protocol):
    def allow(self, key: str) -> bool: ...


class InMemoryRateLimiter:
    """A rolling-window limiter for local development and single-worker runs.

    Rolling rather than fixed-window: a fixed window lets a caller send twice
    the limit by straddling a boundary, so the advertised ceiling never actually
    holds. Here the oldest request ages out one at a time.
    """

    def __init__(
        self,
        limit: int = DEFAULT_LIMIT,
        window_seconds: int = DEFAULT_WINDOW_SECONDS,
        clock: Optional[Callable[[], float]] = None,
    ) -> None:
        self._limit = limit
        self._window = window_seconds
        self._clock = clock or time.monotonic
        self._hits: Dict[str, Deque[float]] = {}

    def allow(self, key: str) -> bool:
        # Fail closed: a misconfigured ceiling of zero means "nothing", not
        # "everything".
        if self._limit <= 0:
            return False

        now = self._clock()
        cutoff = now - self._window
        self._evict(cutoff)

        hits = self._hits.setdefault(key, deque())
        while hits and hits[0] <= cutoff:
            hits.popleft()
        if len(hits) >= self._limit:
            return False
        hits.append(now)
        return True

    def _evict(self, cutoff: float) -> None:
        """Drop keys with no recent activity.

        Without this, an in-process limiter keyed by address is a memory leak
        with a schedule: one entry per distinct caller, kept for the life of the
        worker.
        """
        stale = [
            key
            for key, hits in self._hits.items()
            if not hits or hits[-1] <= cutoff
        ]
        for key in stale:
            del self._hits[key]

    def tracked_keys(self) -> int:
        return len(self._hits)


class RedisRateLimiter:
    """A shared limiter for multi-instance deployments.

    Imported lazily so the base install needs no Redis client. Any client error
    is treated as *allow*: an observability or cache outage must not take down
    the tutor, and the provider's own quota remains the backstop.
    """

    def __init__(
        self,
        url: str,
        token: str,
        limit: int = DEFAULT_LIMIT,
        window_seconds: int = DEFAULT_WINDOW_SECONDS,
    ) -> None:
        self._url = url
        self._token = token
        self._limit = limit
        self._window = window_seconds
        self._client = None

    def _connect(self):
        if self._client is None:
            from upstash_redis import Redis  # noqa: PLC0415

            self._client = Redis(url=self._url, token=self._token)
        return self._client

    def allow(self, key: str) -> bool:
        if self._limit <= 0:
            return False
        try:
            client = self._connect()
            namespaced = f"tutor:rl:{key}"
            count = client.incr(namespaced)
            if count == 1:
                client.expire(namespaced, self._window)
            return int(count) <= self._limit
        except Exception:  # noqa: BLE001 - availability beats strictness here
            return True


def _trusted_proxy_hops() -> int:
    raw = os.getenv("TUTOR_TRUSTED_PROXY_HOPS")
    if not raw:
        return 0
    try:
        hops = int(raw.strip())
    except (TypeError, ValueError):
        return 0
    return max(0, hops)


def limiter_key_for(request) -> str:
    """The bucket this request counts against.

    Relay has no learner authentication, so the address is all there is. When an
    authenticated learner ID exists, it should be preferred here — an address is
    shared by everyone behind one NAT.
    """
    socket_host = getattr(getattr(request, "client", None), "host", None) or "unknown"

    hops = _trusted_proxy_hops()
    if hops:
        forwarded = request.headers.get("x-forwarded-for", "")
        entries = [entry.strip() for entry in forwarded.split(",") if entry.strip()]
        # Count from the right: with one trusted proxy the client address is the
        # last entry. Anything further left was supplied by the caller.
        if len(entries) >= hops:
            return f"ip:{entries[-hops]}"

    return f"ip:{socket_host}"


class DailyRequestCeiling:
    """A hard cap on tutor requests per day for the whole deployment.

    A per-caller rate limit stops one client from looping; it does nothing about
    a thousand clients each behaving reasonably. This is the ceiling on the
    *bill*, and it is a request count rather than a currency amount because a
    request count is something the application can actually observe — per-call
    cost is a provider-side figure that arrives later, if at all.

    The provider's own quota is not a substitute: it is set per organisation,
    so a runaway preview deployment would exhaust the budget production depends
    on, and the first symptom would be production failing.
    """

    def __init__(
        self,
        limit: Optional[int] = None,
        clock: Optional[Callable[[], float]] = None,
    ) -> None:
        self._limit = limit
        self._clock = clock or time.time
        self._window_start = self._clock()
        self.used = 0

    def allow(self) -> bool:
        # Unset means local development, where requiring a budget to run the
        # tutor at all would be friction with no upside.
        if self._limit is None:
            return True

        now = self._clock()
        if now - self._window_start >= 86_400:
            self._window_start = now
            self.used = 0

        if self.used >= self._limit:
            return False
        self.used += 1
        return True


def configured_daily_ceiling() -> Optional[int]:
    """The configured ceiling, or None when unset or malformed.

    Malformed reads as absent rather than unlimited, which is what makes the
    production safeguard below fail closed on a typo.
    """
    raw = os.getenv("TUTOR_DAILY_REQUEST_CEILING")
    if not raw:
        return None
    try:
        value = int(raw.strip())
    except (TypeError, ValueError):
        return None
    return value if value > 0 else None


def production_spend_ceiling_is_missing() -> bool:
    """True when the tutor is enabled in production with no spend ceiling."""
    if not tutor_settings().enabled:
        return False
    if not os.getenv("VERCEL"):
        return False
    return configured_daily_ceiling() is None


def build_daily_ceiling() -> DailyRequestCeiling:
    return DailyRequestCeiling(limit=configured_daily_ceiling())


def production_limiter_is_missing() -> bool:
    """True when the tutor is enabled on a multi-instance platform with no shared limiter."""
    if not tutor_settings().enabled:
        return False
    if not os.getenv("VERCEL"):
        return False
    return not tutor_settings().rate_limit_redis_url


def build_rate_limiter() -> RateLimiter:
    """The shared limiter when configured, otherwise the in-process fallback."""
    settings = tutor_settings()
    if settings.rate_limit_redis_url and settings.rate_limit_redis_token:
        return RedisRateLimiter(
            settings.rate_limit_redis_url, settings.rate_limit_redis_token
        )
    return InMemoryRateLimiter()
