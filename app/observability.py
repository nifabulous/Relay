"""Opt-in Sentry configuration for the FastAPI application."""

import logging
import os
from typing import Any
from urllib.parse import urlsplit

import sentry_sdk
from starlette.exceptions import HTTPException as StarletteHTTPException

_TRUE_VALUES = frozenset({"1", "true", "yes", "on"})
_REDACTED_EXCEPTION_VALUE = "[REDACTED_EXCEPTION_VALUE]"
_REDACTED_TRANSACTION = "[REDACTED_TRANSACTION]"
_TUTOR_CHAT_ROUTE = "/api/tutor/chat"
_EXPECTED_HTTP_EXCEPTION_PREFIXES = (
    "The tutor is not enabled.",
    "The tutor provider is not configured.",
    "The tutor requires a shared rate limit",
    "The tutor requires a daily spend ceiling",
)
_SAFE_SPAN_KEYS = frozenset(
    {
        "op",
        "origin",
        "parent_span_id",
        "span_id",
        "start_timestamp",
        "status",
        "timestamp",
        "trace_id",
    }
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


def _exception_from_hint(hint: dict[str, Any]) -> BaseException | None:
    exc_info = hint.get("exc_info")
    if not isinstance(exc_info, tuple) or len(exc_info) < 2:
        return None
    exception = exc_info[1]
    return exception if isinstance(exception, BaseException) else None


def _is_tutor_chat_route(event: dict[str, Any]) -> bool:
    if event.get("transaction") == _TUTOR_CHAT_ROUTE:
        return True

    request = event.get("request")
    if not isinstance(request, dict):
        return False
    url = request.get("url")
    return isinstance(url, str) and urlsplit(url).path == _TUTOR_CHAT_ROUTE


def _is_expected_http_exception(event: dict[str, Any], hint: dict[str, Any]) -> bool:
    exception = _exception_from_hint(hint)
    if not isinstance(exception, StarletteHTTPException):
        return False
    if exception.status_code != 503 or not _is_tutor_chat_route(event):
        return False

    detail = exception.detail
    if not isinstance(detail, str) or not detail.startswith(
        _EXPECTED_HTTP_EXCEPTION_PREFIXES
    ):
        return False

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
    request.pop("url", None)


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
        if not isinstance(value, dict):
            continue
        stacktrace = value.get("stacktrace")
        if not isinstance(stacktrace, dict):
            continue
        frames = stacktrace.get("frames")
        if not isinstance(frames, list):
            continue
        for frame in frames:
            if isinstance(frame, dict):
                frame.pop("vars", None)


def _scrub_logging_fields(event: dict[str, Any]) -> None:
    # Log records can carry the original format arguments in logentry.params,
    # rendered text in breadcrumbs, and arbitrary values in logging extra.
    for field in ("breadcrumbs", "extra", "fingerprint", "logentry", "tags"):
        event.pop(field, None)


def _scrub_spans(event: dict[str, Any]) -> None:
    spans = event.get("spans")
    if not isinstance(spans, list):
        return
    for span in spans:
        if not isinstance(span, dict):
            continue
        safe_span = {
            key: span[key] for key in _SAFE_SPAN_KEYS if key in span
        }
        span.clear()
        span.update(safe_span)


def _scrub_event(event: dict[str, Any]) -> None:
    _scrub_request(event)
    _scrub_exception_values(event)
    _scrub_logging_fields(event)
    if isinstance(event.get("message"), str):
        event["message"] = _REDACTED_EXCEPTION_VALUE


def _before_send(event: dict[str, Any], hint: dict[str, Any]) -> dict[str, Any] | None:
    """Drop expected tutor availability errors and scrub user-provided data."""
    if _is_expected_http_exception(event, hint):
        return None

    _scrub_event(event)
    return event


def _before_breadcrumb(crumb: dict[str, Any], hint: dict[str, Any]) -> None:
    """Do not retain logging, HTTP, or custom breadcrumbs."""
    del crumb, hint
    return None


def _before_send_transaction(
    event: dict[str, Any], hint: dict[str, Any]
) -> dict[str, Any]:
    """Keep performance timing while removing names and span payloads."""
    del hint
    _scrub_event(event)
    _scrub_spans(event)
    if "transaction" in event:
        event["transaction"] = _REDACTED_TRANSACTION
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
        "before_breadcrumb": _before_breadcrumb,
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
