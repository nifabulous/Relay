"""Sentry initialization is opt-in and safe for the payment simulation."""

from contextlib import contextmanager
from typing import Iterator

import sentry_sdk
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from sentry_sdk.utils import BadDsn

from app.observability import (
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


def test_sentry_event_scrubber_removes_request_and_exception_values():
    event = {
        "request": {
            "url": "https://relay.example/api/validate?value=sensitive",
            "query_string": "value=sensitive&bic=private",
            "data": {"beneficiary_iban": "sensitive", "name": "Learner"},
        },
        "exception": {
            "values": [{"type": "RuntimeError", "value": "sensitive prompt"}]
        },
    }

    scrubbed = _before_send(event, {})

    assert scrubbed is event
    assert scrubbed["request"] == {"url": "https://relay.example/api/validate"}
    assert scrubbed["exception"]["values"][0]["value"] == "[REDACTED_EXCEPTION_VALUE]"


def test_expected_tutor_http_errors_are_not_reported():
    event = {
        "exception": {
            "values": [
                {
                    "type": "HTTPException",
                    "value": "The tutor requires a shared rate limit in this environment.",
                }
            ]
        }
    }

    assert _before_send(event, {}) is None


def test_expected_tutor_http_error_is_dropped_from_fastapi_capture():
    captured = []

    def capture_scrubbed(event, hint):
        scrubbed = _before_send(event, hint)
        if scrubbed is not None:
            captured.append(scrubbed)
        return None

    app = FastAPI()

    @app.get("/expected-503")
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
        response = TestClient(app, raise_server_exceptions=False).get("/expected-503")

    assert response.status_code == 503
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
    assert captured[0]["request"]["url"] == "http://testserver/boom"
    assert set(captured[0]["request"]) == {"method", "url"}
    assert captured[0]["exception"]["values"][-1]["value"] == "[REDACTED_EXCEPTION_VALUE]"


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
    assert captured[0]["request"]["url"] == "http://testserver/ok"
    assert set(captured[0]["request"]) == {"method", "url"}
