"""Sentry initialization is opt-in and safe for the payment simulation."""

import logging
import os
import subprocess
import sys
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

import sentry_sdk
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from sentry_sdk.utils import BadDsn

from app.observability import (
    _before_breadcrumb,
    _before_send,
    _before_send_transaction,
    init_sentry,
)


@contextmanager
def _sentry_client(**options) -> Iterator[None]:
    global_scope = sentry_sdk.get_global_scope()
    previous_client = global_scope.client
    client = sentry_sdk.Client(**options)
    global_scope.set_client(client)
    try:
        yield
    finally:
        global_scope.set_client(previous_client)
        client.close()


def test_sentry_is_disabled_without_a_dsn(monkeypatch):
    monkeypatch.delenv("SENTRY_DSN", raising=False)
    calls = []
    monkeypatch.setattr(sentry_sdk, "init", lambda **kwargs: calls.append(kwargs))

    assert init_sentry() is False
    assert calls == []


def test_sentry_uses_safe_defaults_and_configured_sampling(monkeypatch):
    monkeypatch.setenv("SENTRY_DSN", "https://public@example.ingest.sentry.io/1")
    monkeypatch.setenv("SENTRY_ENVIRONMENT", "test")
    monkeypatch.setenv("SENTRY_TRACES_SAMPLE_RATE", "0.25")
    monkeypatch.delenv("SENTRY_SEND_DEFAULT_PII", raising=False)
    calls = []
    monkeypatch.setattr(sentry_sdk, "init", lambda **kwargs: calls.append(kwargs))

    assert init_sentry() is True
    assert calls[0]["dsn"] == "https://public@example.ingest.sentry.io/1"
    assert calls[0]["environment"] == "test"
    assert calls[0]["traces_sample_rate"] == 0.25
    assert calls[0]["send_default_pii"] is False
    assert calls[0]["max_request_body_size"] == "never"
    assert calls[0]["include_local_variables"] is False
    assert calls[0]["before_send"] is _before_send
    assert calls[0]["before_send_transaction"] is _before_send_transaction
    assert calls[0]["before_breadcrumb"] is _before_breadcrumb


def test_invalid_sampling_falls_back_to_zero(monkeypatch):
    monkeypatch.setenv("SENTRY_DSN", "https://public@example.ingest.sentry.io/1")
    monkeypatch.setenv("SENTRY_TRACES_SAMPLE_RATE", "not-a-rate")
    calls = []
    monkeypatch.setattr(sentry_sdk, "init", lambda **kwargs: calls.append(kwargs))

    assert init_sentry() is True
    assert calls[0]["traces_sample_rate"] == 0.0


def test_invalid_dsn_does_not_prevent_application_startup(monkeypatch):
    monkeypatch.setenv("SENTRY_DSN", "not-a-valid-dsn")

    def fail_init(**kwargs):
        raise BadDsn("invalid test DSN")

    monkeypatch.setattr(sentry_sdk, "init", fail_init)

    assert init_sentry() is False


def test_importing_application_with_invalid_dsn_does_not_fail(monkeypatch):
    environment = os.environ.copy()
    environment["SENTRY_DSN"] = "not-a-valid-dsn"

    result = subprocess.run(
        [sys.executable, "-c", "import app.main"],
        cwd=Path(__file__).parents[1],
        env=environment,
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode == 0, result.stderr


def test_before_breadcrumb_drops_logging_metadata():
    breadcrumb = {
        "message": "provider response secret-log-value",
        "data": {"secret": "secret-log-value"},
    }

    assert _before_breadcrumb(breadcrumb, {}) is None


def test_sentry_event_scrubber_removes_request_and_exception_values():
    event = {
        "request": {
            "method": "POST",
            "url": "https://relay.example/api/validate?value=sensitive",
            "query_string": "value=sensitive&bic=private",
            "data": {"beneficiary_iban": "sensitive", "name": "Learner"},
        },
        "exception": {
            "values": [{"type": "RuntimeError", "value": "sensitive prompt"}]
        },
        "breadcrumbs": {"values": [{"message": "sensitive breadcrumb"}]},
        "extra": {"provider_response": "sensitive extra"},
        "logentry": {
            "message": "provider response %s",
            "params": ["sensitive log value"],
        },
        "tags": {"sensitive_tag": "sensitive tag"},
        "message": "sensitive message",
    }

    scrubbed = _before_send(event, {})

    assert scrubbed is event
    assert scrubbed["request"] == {"method": "POST"}
    assert scrubbed["exception"]["values"][0]["value"] == "[REDACTED_EXCEPTION_VALUE]"
    assert "sensitive" not in repr(scrubbed)
    assert "breadcrumbs" not in scrubbed
    assert "extra" not in scrubbed
    assert "logentry" not in scrubbed
    assert "tags" not in scrubbed


def test_expected_tutor_http_errors_are_not_reported():
    event = {
        "transaction": "/api/tutor/chat",
        "exception": {
            "values": [
                {
                    "type": "HTTPException",
                    "value": "The tutor requires a shared rate limit in this environment.",
                }
            ]
        }
    }
    error = HTTPException(
        status_code=503,
        detail="The tutor requires a shared rate limit in this environment.",
    )

    assert _before_send(event, {"exc_info": (type(error), error, None)}) is None


def test_expected_tutor_message_with_non_503_status_is_retained():
    event = {
        "transaction": "/api/tutor/chat",
        "exception": {
            "values": [
                {
                    "type": "HTTPException",
                    "value": "The tutor requires a shared rate limit in this environment.",
                }
            ]
        },
    }
    error = HTTPException(
        status_code=502,
        detail="The tutor requires a shared rate limit in this environment.",
    )

    assert _before_send(event, {"exc_info": (type(error), error, None)}) is event


def test_expected_tutor_exception_chained_into_unexpected_error_is_retained():
    event = {
        "transaction": "/api/tutor/chat",
        "exception": {
            "values": [
                {
                    "type": "HTTPException",
                    "value": "The tutor requires a shared rate limit in this environment.",
                },
                {"type": "RuntimeError", "value": "unexpected provider failure"},
            ]
        },
    }
    error = RuntimeError("unexpected provider failure")

    assert _before_send(event, {"exc_info": (type(error), error, None)}) is event


def test_expected_tutor_exception_with_unexpected_cause_is_retained():
    error = HTTPException(
        status_code=503,
        detail="The tutor requires a shared rate limit in this environment.",
    )
    error.__cause__ = RuntimeError("unexpected provider failure")
    event = {
        "transaction": "/api/tutor/chat",
        "exception": {
            "values": [
                {
                    "type": "HTTPException",
                    "value": "The tutor requires a shared rate limit in this environment.",
                },
                {"type": "RuntimeError", "value": "unexpected provider failure"},
            ]
        },
    }

    assert _before_send(event, {"exc_info": (type(error), error, None)}) is event


def test_formatted_log_event_has_no_logging_payload_after_scrubbing():
    captured = []

    def capture_scrubbed(event, hint):
        scrubbed = _before_send(event, hint)
        captured.append(scrubbed)
        return scrubbed

    with _sentry_client(
        dsn="https://public@example.ingest.sentry.io/1",
        send_default_pii=False,
        traces_sample_rate=0,
        before_send=capture_scrubbed,
    ):
        logging.getLogger("sentry-test-provider").error(
            "provider response %s",
            "secret-log-value",
            extra={"secret_extra": "secret-extra-value"},
        )
        sentry_sdk.flush(timeout=1)

    assert len(captured) == 1
    assert captured[0] is not None
    assert "secret-log-value" not in repr(captured[0])
    assert "secret-extra-value" not in repr(captured[0])
    assert "logentry" not in captured[0]
    assert "extra" not in captured[0]
    assert "breadcrumbs" not in captured[0]


def test_expected_tutor_http_error_is_dropped_from_fastapi_capture():
    captured = []
    callbacks = []

    def capture_scrubbed(event, hint):
        callbacks.append((event, hint))
        scrubbed = _before_send(event, hint)
        if scrubbed is not None:
            captured.append(scrubbed)
        return scrubbed

    app = FastAPI()

    @app.get("/api/tutor/chat")
    def expected_503():
        raise HTTPException(
            status_code=503,
            detail="The tutor requires a shared rate limit in this environment.",
        )

    with _sentry_client(
        dsn="https://public@example.ingest.sentry.io/1",
        send_default_pii=False,
        traces_sample_rate=0,
        before_send=capture_scrubbed,
    ):
        response = TestClient(app, raise_server_exceptions=False).get("/api/tutor/chat")

    assert response.status_code == 503
    assert len(callbacks) == 1
    assert callbacks[0][0]["transaction"] == "/api/tutor/chat"
    assert callbacks[0][1]["exc_info"][1].status_code == 503
    assert captured == []


def test_fastapi_error_event_is_scrubbed_before_capture():
    captured = []

    def capture_scrubbed(event, hint):
        scrubbed = _before_send(event, hint)
        if scrubbed is not None:
            captured.append(scrubbed)
        return None

    app = FastAPI()

    @app.post("/boom")
    def boom(payload: dict):
        raise RuntimeError(payload["secret"])

    with _sentry_client(
        dsn="https://public@example.ingest.sentry.io/1",
        send_default_pii=False,
        traces_sample_rate=0,
        before_send=capture_scrubbed,
        max_request_body_size="medium",
    ):
        response = TestClient(app, raise_server_exceptions=False).post(
            "/boom?value=query-secret",
            json={"secret": "body-secret", "beneficiary_iban": "sensitive"},
        )

    assert response.status_code == 500
    assert len(captured) == 1
    assert captured[0]["request"]["method"] == "POST"
    assert set(captured[0]["request"]) == {"method"}
    assert captured[0]["exception"]["values"][-1]["value"] == "[REDACTED_EXCEPTION_VALUE]"
    assert "vars" not in repr(captured[0]["exception"])


def test_fastapi_transaction_is_scrubbed_before_capture():
    captured = []

    def capture_scrubbed(event, hint):
        scrubbed = _before_send_transaction(event, hint)
        if scrubbed is not None:
            captured.append(scrubbed)
        return None

    app = FastAPI()

    @app.get("/ok")
    def ok(value: str):
        return {"value": value}

    with _sentry_client(
        dsn="https://public@example.ingest.sentry.io/1",
        send_default_pii=False,
        traces_sample_rate=1.0,
        before_send_transaction=capture_scrubbed,
    ):
        response = TestClient(app, raise_server_exceptions=False).get(
            "/ok?value=query-secret"
        )

    assert response.status_code == 200
    assert len(captured) == 1
    assert captured[0]["request"]["method"] == "GET"
    assert set(captured[0]["request"]) == {"method"}
    assert captured[0]["transaction"] == "[REDACTED_TRANSACTION]"


def test_error_scrubber_removes_dynamic_transaction_and_span_payloads():
    event = {
        "transaction": "/api/tutor/user-secret",
        "exception": {"values": [{"type": "RuntimeError", "value": "boom"}]},
        "spans": [
            {
                "op": "http.client",
                "description": "https://provider.example/user-secret",
                "data": {"token": "span-secret"},
                "span_id": "abc123",
            }
        ],
    }

    scrubbed = _before_send(event, {})

    assert scrubbed is event
    assert scrubbed["transaction"] == "[REDACTED_TRANSACTION]"
    assert scrubbed["spans"] == [{"op": "http.client", "span_id": "abc123"}]
    assert "secret" not in repr(scrubbed)


def test_transaction_scrubber_removes_names_and_nested_span_payloads():
    event = {
        "transaction": "/api/tutor/chat/user-secret?token=query-secret",
        "request": {
            "method": "GET",
            "url": "https://provider.example/users/user-secret?token=query-secret",
            "query_string": "token=query-secret",
        },
        "spans": [
            {
                "op": "http.client",
                "description": "GET https://provider.example/user-secret",
                "data": {"url": "https://provider.example?token=query-secret"},
                "tags": {"provider_request": "secret-span-tag"},
                "span_id": "abc123",
            }
        ],
    }

    scrubbed = _before_send_transaction(event, {})

    assert scrubbed is event
    assert scrubbed["request"] == {"method": "GET"}
    assert scrubbed["transaction"] == "[REDACTED_TRANSACTION]"
    assert scrubbed["spans"] == [{"op": "http.client", "span_id": "abc123"}]
    assert "secret" not in repr(scrubbed)


def test_init_sentry_registers_callbacks_with_the_real_sdk(monkeypatch):
    monkeypatch.setenv("SENTRY_DSN", "https://public@example.ingest.sentry.io/1")
    monkeypatch.setenv("SENTRY_TRACES_SAMPLE_RATE", "0")
    global_scope = sentry_sdk.get_global_scope()
    previous_client = global_scope.client

    try:
        assert init_sentry() is True
        client = global_scope.client
        assert client is not None
        assert client.options["dsn"] == "https://public@example.ingest.sentry.io/1"
        assert client.options["before_send"] is _before_send
        assert client.options["before_send_transaction"] is _before_send_transaction
        assert client.options["before_breadcrumb"] is _before_breadcrumb
    finally:
        current_client = global_scope.client
        if current_client is not previous_client and current_client is not None:
            current_client.close()
        global_scope.set_client(previous_client)
