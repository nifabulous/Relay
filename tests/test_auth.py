"""
Tests for the admin authentication dependency (implementation-plan item 0.3).

Verifies:
  - When ADMIN_API_KEY is set, mutating endpoints reject requests without
    the X-Admin-Key header (401).
  - Requests with the correct header succeed.
  - Dev mode (no key configured) allows access without a header.
"""
import os
from unittest import mock

import pytest
from fastapi.testclient import TestClient


@pytest.fixture(autouse=True)
def reset_auth_state():
    """Ensure _admin_api_key is reset to None after each auth test.

    The mock.patch context managers in client_with_auth/client_dev_mode
    should restore the value, but TestClient lifespan startup can
    re-read module state, causing leaks into subsequent test files.
    This autouse fixture guarantees a clean state.
    """
    yield
    import app.auth
    app.auth._admin_api_key = None


@pytest.fixture
def client_with_auth():
    """A client where ADMIN_API_KEY is set (prod-like auth enforced)."""
    with mock.patch.dict(os.environ, {"ADMIN_API_KEY": "test-secret-key-123"}):
        from app.db import get_db
        from app.main import app

        # Force re-evaluation of config by patching the settings the auth dep reads
        with mock.patch("app.auth._admin_api_key", "test-secret-key-123"):
            from tests.conftest import _client_get_db
            # Save and RESTORE the override map instead of clear(): the
            # session-scoped `client` fixture registered the same get_db
            # override, and clearing it here would silently point every
            # later client-fixture test at the real dev database.
            previous_overrides = dict(app.dependency_overrides)
            app.dependency_overrides[get_db] = _client_get_db
            with TestClient(app) as c:
                yield c
            app.dependency_overrides.clear()
            app.dependency_overrides.update(previous_overrides)


@pytest.fixture
def client_dev_mode():
    """A client where no ADMIN_API_KEY is set (dev mode — open access)."""
    env_without_key = {k: v for k, v in os.environ.items() if k != "ADMIN_API_KEY"}
    with mock.patch.dict(os.environ, env_without_key, clear=True):
        with mock.patch("app.auth._admin_api_key", None):
            from app.db import get_db
            from app.main import app
            from tests.conftest import _client_get_db
            previous_overrides = dict(app.dependency_overrides)
            app.dependency_overrides[get_db] = _client_get_db
            with TestClient(app) as c:
                yield c
            app.dependency_overrides.clear()
            app.dependency_overrides.update(previous_overrides)


class TestImportEndpointAuth:
    """The /import/* endpoints must require X-Admin-Key when configured."""

    def test_import_fedwire_rejected_without_key(self, client_with_auth):
        r = client_with_auth.post("/api/import/fedwire")
        assert r.status_code == 401, (
            f"Unauthenticated /import/fedwire must be 401 when ADMIN_API_KEY is set, "
            f"got {r.status_code}"
        )

    def test_import_ssi_rejected_without_key(self, client_with_auth):
        r = client_with_auth.post(
            "/api/import/ssi",
            files={"file": ("test.csv", "beneficiary_bic,currency,intermediary_bic\n", "text/csv")},
        )
        assert r.status_code == 401, (
            f"Unauthenticated /import/ssi must be 401, got {r.status_code}"
        )

    def test_import_fedwire_accepted_with_correct_key(self, client_with_auth):
        # Auth passes (not 401). With no FEDWIRE_URL configured, the endpoint
        # returns 400 (configuration error) — proving the request got past auth.
        r = client_with_auth.post(
            "/api/import/fedwire",
            headers={"X-Admin-Key": "test-secret-key-123"},
        )
        assert r.status_code != 401, (
            f"Authenticated /import/fedwire must not be 401, got {r.status_code}"
        )

    def test_import_rejected_with_wrong_key(self, client_with_auth):
        r = client_with_auth.post(
            "/api/import/fedwire",
            headers={"X-Admin-Key": "wrong-key"},
        )
        assert r.status_code == 401, (
            f"Wrong key must be 401, got {r.status_code}"
        )


class TestTrackCreateIsALearnerEndpoint:
    """/track/create backs Lab 6, the capstone and Exceptions & Returns.

    The labs call it without an admin key, so gating it answered them 401 in
    production. It writes only simulated timelines, like the open
    /prepare-payment, and stays open when a key is configured.
    """

    def test_track_create_accepts_a_request_without_a_key(self, client_with_auth):
        r = client_with_auth.post("/api/track/create", json={
            "originator_bic": "CITIUS33XXX",
            "originator_name": "Citibank",
            "beneficiary_bic": "GTBINGLAXXX",
            "beneficiary_name": "GTBank",
            "currency": "USD",
            "amount": 100,
        })
        assert r.status_code == 200, r.text


class TestDevModeOpenAccess:
    """In dev mode (no ADMIN_API_KEY set), endpoints remain open for local dev."""

    def test_import_fedwire_open_in_dev(self, client_dev_mode):
        # In dev mode, auth is not enforced (not 401). The import itself
        # returns 400 because no FEDWIRE_URL is configured — that's the
        # fail-closed supply-chain guard, separate from auth.
        r = client_dev_mode.post("/api/import/fedwire")
        assert r.status_code != 401, (
            f"In dev mode (no key set), /import/fedwire must not be 401, got {r.status_code}"
        )
        assert r.status_code != 503, "local SQLite dev mode must stay open"


class TestDeployedEnvironmentsFailClosed:
    """Without ADMIN_API_KEY, only local development may run the admin API open.

    A deploy that loses the key must not silently expose the importers, so on
    Vercel or against a non-SQLite database the admin API answers 503 instead.
    """

    def test_admin_api_is_unavailable_on_vercel_without_a_key(self, client_dev_mode, monkeypatch):
        monkeypatch.setenv("VERCEL", "1")
        r = client_dev_mode.post("/api/import/fedwire")
        assert r.status_code == 503, r.text

    def test_admin_api_is_unavailable_on_a_non_sqlite_database_without_a_key(
        self, client_dev_mode, monkeypatch
    ):
        monkeypatch.setattr("app.config.DATABASE_URL", "postgresql://db.example/relay")
        r = client_dev_mode.post("/api/import/fedwire")
        assert r.status_code == 503, r.text


class TestKeyComparison:
    def test_a_key_differing_only_in_its_last_character_is_rejected(self, client_with_auth):
        r = client_with_auth.post(
            "/api/import/fedwire", headers={"X-Admin-Key": "test-secret-key-124"}
        )
        assert r.status_code == 401, r.text

    def test_a_non_ascii_key_is_rejected_rather_than_crashing(self, client_with_auth):
        r = client_with_auth.post(
            "/api/import/fedwire", headers={"X-Admin-Key": "clé".encode("latin-1")}
        )
        assert r.status_code == 401, r.text


class TestReadEndpointsUnaffected:
    """Read endpoints (/health, /validate, /route) must never require auth."""

    def test_health_open(self, client_with_auth):
        r = client_with_auth.get("/api/health")
        assert r.status_code == 200

    def test_validate_open(self, client_with_auth):
        r = client_with_auth.get("/api/validate", params={"value": "GB29NWBK60161331926819"})
        assert r.status_code == 200

    def test_route_open(self, client_with_auth):
        r = client_with_auth.get("/api/route", params={"bic": "GTBINGLAXXX", "currency": "USD"})
        assert r.status_code == 200
