"""Opt-in Sentry configuration for the FastAPI application."""

import logging
import os
from typing import Any
from urllib.parse import urlsplit, urlunsplit

import sentry_sdk

_TRUE_VALUES = frozenset({"1", "true", "yes", "on"})
_REDACTED_EXCEPTION_VALUE = "[REDACTED_EXCEPTION_VALUE]"
_EXPECTED_HTTP_EXCEPTION_PREFIXES = (
    "The tutor is not enabled.",
    "The tutor provider is not configured.",
    "The tutor requires a shared rate limit",
    "The tutor requires a daily spend ceiling",
)

logger = logging.getLogger(__name__)


def _env_flag(name: str, default: bool = False) -> bool:
    """Read a boolean environment variable without enabling it by accident."""
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in _TRUE_VALUES


def _sample_rate() -> float:
    """Return a valid trace sample rate, defaulting to no performance tracing."""
    try:
        value = float(os.getenv("SENTRY_TRACES_SAMPLE_RATE", "0"))
    except (TypeError, ValueError):
        return 0.0
    return value if 0.0 <= value <= 1.0 else 0.0


def _is_expected_http_exception(event: dict[str, Any]) -> bool:
    exception = event.get("exception")
    if not isinstance(exception, dict):
        return False
    values = exception.get("values")
    if not isinstance(values, list):
        return False

    return any(
        isinstance(value, dict)
        and value.get("type") == "HTTPException"
        and isinstance(value.get("value"), str)
        and value["value"].startswith(_EXPECTED_HTTP_EXCEPTION_PREFIXES)
        for value in values
    )


def _scrub_request(event: dict[str, Any]) -> None:
    request = event.get("request")
    if not isinstance(request, dict):
        return

    # FastAPI integrations can attach bodies, query strings, cookies, headers,
    # and client IPs. The payment/tutor inputs must not leave this process.
    request.pop("data", None)
    request.pop("query_string", None)
    request.pop("cookies", None)
    request.pop("headers", None)
    request.pop("env", None)

    url = request.get("url")
    if isinstance(url, str):
        parsed = urlsplit(url)
        request["url"] = urlunsplit(
            (parsed.scheme, parsed.netloc, parsed.path, "", "")
        )


def _scrub_exception_values(event: dict[str, Any]) -> None:
    exception = event.get("exception")
    if not isinstance(exception, dict):
        return
    values = exception.get("values")
    if not isinstance(values, list):
        return

    for value in values:
        if isinstance(value, dict) and "value" in value:
            value["value"] = _REDACTED_EXCEPTION_VALUE


def _before_send(event: dict[str, Any], hint: dict[str, Any]) -> dict[str, Any] | None:
    """Drop expected tutor availability errors and scrub user-provided data."""
    del hint
    if _is_expected_http_exception(event):
        return None

    _scrub_request(event)
    _scrub_exception_values(event)
    if isinstance(event.get("message"), str):
        event["message"] = _REDACTED_EXCEPTION_VALUE
    logentry = event.get("logentry")
    if isinstance(logentry, dict) and isinstance(logentry.get("message"), str):
        logentry["message"] = _REDACTED_EXCEPTION_VALUE
    return event


def _before_send_transaction(
    event: dict[str, Any], hint: dict[str, Any]
) -> dict[str, Any]:
    """Remove request input from performance transactions before sending."""
    del hint
    _scrub_request(event)
    return event


def init_sentry() -> bool:
    """Initialize Sentry when a DSN is configured, otherwise do nothing."""
    dsn = (os.getenv("SENTRY_DSN") or "").strip()
    if not dsn:
        return False

    options = {
        "dsn": dsn,
        "traces_sample_rate": _sample_rate(),
        # Payment and learner data should not be attached by default.
        "send_default_pii": _env_flag("SENTRY_SEND_DEFAULT_PII"),
        "max_request_body_size": "never",
        "include_local_variables": False,
        "before_send": _before_send,
        "before_send_transaction": _before_send_transaction,
    }
    environment = (os.getenv("SENTRY_ENVIRONMENT") or "").strip()
    if environment:
        options["environment"] = environment

    try:
        sentry_sdk.init(**options)
    except Exception as error:  # noqa: BLE001 - observability cannot take down the app
        logger.warning(
            "Sentry initialization failed; continuing without Sentry (%s)",
            type(error).__name__,
        )
        return False
    return True
