"""Configuration — reads DATABASE_URL from env, defaults to local SQLite."""
import os
from dataclasses import dataclass
from enum import Enum
from pathlib import Path
from typing import Optional

BASE_DIR = Path(__file__).resolve().parent.parent

# On Vercel the project filesystem is read-only and /tmp is the only writable
# path, so the default DB lives there. It is recreated and reseeded on each
# cold start, which suits a simulation whose data all comes from seed.py.
# Setting DATABASE_URL explicitly always wins — prefer that, because the VERCEL
# system variable is opt-in per project.
_DEFAULT_SQLITE_PATH = (
    Path("/tmp/swift_routing.db")
    if os.getenv("VERCEL")
    else BASE_DIR / "swift_routing.db"
)

# Postgres in prod, SQLite for zero-setup local dev.
DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{_DEFAULT_SQLITE_PATH}")

# SQLite needs this flag for cross-connection thread safety under FastAPI.
SQLALCHEMY_ENGINE_OPTIONS = (
    {"connect_args": {"check_same_thread": False}}
    if DATABASE_URL.startswith("sqlite")
    else {}
)


# ── AI tutor ────────────────────────────────────────────────────────────────
#
# The tutor is off by default and the base install carries no provider SDK.
# Everything below is read from the environment *per call* rather than frozen
# into module constants at import time: the flag has to be togglable in a test
# and settable by a platform that injects variables after the module graph has
# already loaded.
#
# The provider API key is deliberately NOT a field on `TutorSettings`. It has
# its own accessor so that no future `asdict()` of the settings — in telemetry,
# an error report, a debug route — can carry the secret by accident. Leaking it
# has to be written on purpose.

_TUTOR_TRUE_VALUES = frozenset({"1", "true", "yes", "on"})

# Mirrors `TutorRequest.history`'s Pydantic cap. A configured value above this
# could only ever be rejected at the request boundary, so it is clamped rather
# than allowed to disagree with the schema.
_TUTOR_MAX_HISTORY_TURNS_CEILING = 8

# Which environment variable holds the key, per provider. Server-only: never
# returned by /health, OpenAPI, telemetry, or any frontend bundle.
_TUTOR_PROVIDER_KEY_ENV = {
    "openai": "OPENAI_API_KEY",
    "anthropic": "ANTHROPIC_API_KEY",
}


def _env_flag(name: str, default: bool = False) -> bool:
    """Fail closed: only an affirmatively true spelling turns something on.

    A typo in a deploy variable must not enable a paid external provider.
    """
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in _TUTOR_TRUE_VALUES


def _env_positive_int(name: str, default: int, maximum: Optional[int] = None) -> int:
    """A malformed limit falls back to the default rather than raising.

    Raising here would take the whole app down over a tutor setting that is off
    by default — an unrelated deployment breaking on a variable it never uses.
    """
    raw = os.getenv(name)
    if raw is None:
        value = default
    else:
        try:
            value = int(raw.strip())
        except (TypeError, ValueError):
            value = default
        if value <= 0:
            value = default
    if maximum is not None:
        value = min(value, maximum)
    return value


@dataclass(frozen=True)
class TutorSettings:
    """Non-secret tutor configuration. Safe to log, dump, and assert against."""

    enabled: bool
    provider: str
    model: str
    max_retrieved_docs: int
    max_history_turns: int
    max_input_tokens: int
    max_output_tokens: int
    rate_limit_redis_url: str
    rate_limit_redis_token: str
    tracing_enabled: bool


class TutorAvailability(str, Enum):
    """Why the tutor can or cannot answer, as three distinct operator states.

    A single boolean would collapse "the operator turned this off" and "the
    operator turned this on but the deploy is missing a key" into one message,
    and those need different fixes.
    """

    DISABLED = "disabled"
    UNCONFIGURED = "unconfigured"
    READY = "ready"


def is_multi_instance_deployment() -> bool:
    """Whether this process is one of many short-lived instances.

    Three call sites were each re-deriving this from `os.getenv("VERCEL")`.
    Three copies of a platform assumption drift the moment the platform
    changes, and they drift silently: a rename would leave the tutor believing
    it was on a single long-lived worker and quietly accepting an in-process
    rate limit that resets on every cold start.

    Extend this predicate, not its callers, when a second platform appears.
    """
    return bool(os.getenv("VERCEL"))


def tutor_settings() -> TutorSettings:
    """Read the current tutor configuration from the environment."""
    return TutorSettings(
        enabled=_env_flag("TUTOR_ENABLED"),
        provider=(os.getenv("TUTOR_PROVIDER") or "openai").strip().lower(),
        model=(os.getenv("TUTOR_MODEL") or "").strip(),
        max_retrieved_docs=_env_positive_int("TUTOR_MAX_RETRIEVED_DOCS", 6),
        max_history_turns=_env_positive_int(
            "TUTOR_MAX_HISTORY_TURNS", 8, maximum=_TUTOR_MAX_HISTORY_TURNS_CEILING
        ),
        max_input_tokens=_env_positive_int("TUTOR_MAX_INPUT_TOKENS", 6000),
        max_output_tokens=_env_positive_int("TUTOR_MAX_OUTPUT_TOKENS", 1200),
        rate_limit_redis_url=(os.getenv("TUTOR_RATE_LIMIT_REDIS_URL") or "").strip(),
        rate_limit_redis_token=(os.getenv("TUTOR_RATE_LIMIT_REDIS_TOKEN") or "").strip(),
        tracing_enabled=_env_flag("TUTOR_TRACING_ENABLED"),
    )


def tutor_provider_api_key(provider: Optional[str] = None) -> str:
    """The provider key, read on demand and never stored on the settings object."""
    provider = (provider or tutor_settings().provider).strip().lower()
    env_name = _TUTOR_PROVIDER_KEY_ENV.get(provider)
    if env_name is None:
        return ""
    return (os.getenv(env_name) or "").strip()


def tutor_availability() -> TutorAvailability:
    """Whether the tutor can serve a request right now, and if not, why."""
    settings = tutor_settings()
    if not settings.enabled:
        return TutorAvailability.DISABLED
    if not settings.model or not tutor_provider_api_key(settings.provider):
        return TutorAvailability.UNCONFIGURED
    return TutorAvailability.READY
