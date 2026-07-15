"""
Tests for the Fedwire/FedACH import HTTP endpoints — mocked to avoid network calls.
"""
from unittest.mock import patch
import pytest
from app.services.fed_importer import ImportResult


class TestImportEndpoints:
    @patch("app.routers.lookup.import_fedwire")
    def test_import_fedwire_success(self, mock_fn, client):
        """POST /api/import/fedwire returns correct response shape."""
        mock_fn.return_value = ImportResult(
            source="fedwire", inserted=7693, skipped=0, total_lines=7693,
        )
        r = client.post("/api/import/fedwire")
        assert r.status_code == 200
        body = r.json()
        assert body["source"] == "fedwire"
        assert body["inserted"] == 7693
        assert "message" in body
        assert "Fedwire" in body["message"]

    @patch("app.routers.lookup.import_fedach")
    def test_import_fedach_success(self, mock_fn, client):
        """POST /api/import/fedach returns correct response shape."""
        mock_fn.return_value = ImportResult(
            source="fedach", inserted=18198, skipped=0, total_lines=18198,
        )
        r = client.post("/api/import/fedach")
        assert r.status_code == 200
        body = r.json()
        assert body["source"] == "fedach"
        assert body["inserted"] == 18198
        assert "message" in body
        assert "FedACH" in body["message"]


class TestFedImporterFailClosed:
    """
    Supply-chain safety: import_fedwire/import_fedach must NOT silently
    fetch from a third-party GitHub repo by default. When no FEDWIRE_URL /
    FEDACH_URL is configured, they must raise a clear error directing the
    operator to set a trusted URL.

    The old default (raw.githubusercontent.com/moov-io/fed) is a supply-chain
    risk: a compromised mirror or MITM silently injects malicious routing data.
    """

    def test_import_fedwire_raises_without_url(self, db_session):
        from app.services.fed_importer import import_fedwire

        with pytest.raises(ValueError, match="FEDWIRE_URL"):
            import_fedwire(db_session, url=None)

    def test_import_fedach_raises_without_url(self, db_session):
        from app.services.fed_importer import import_fedach

        with pytest.raises(ValueError, match="FEDACH_URL"):
            import_fedach(db_session, url=None)

    def test_default_url_is_none_not_github(self):
        """The module-level default must be None (fail-closed), not a GitHub URL."""
        import os
        from app.services import fed_importer

        # Verify the source code does NOT contain the old GitHub default.
        # We check the module attribute directly — when no env var is set
        # at import time, it must be None. Since we can't control what env
        # was set when the module first loaded, we verify by checking that
        # os.getenv returns None for these (no hardcoded fallback in the source).
        import inspect
        source = inspect.getsource(fed_importer)
        assert "raw.githubusercontent.com" not in source, (
            "fed_importer source must not reference raw.githubusercontent.com — "
            "no third-party remote default for supply-chain safety."
        )
        # Verify the getenv calls have NO second argument (no fallback default)
        assert 'os.getenv("FEDWIRE_URL")' in source or "os.getenv('FEDWIRE_URL')" in source
        assert 'os.getenv("FEDACH_URL")' in source or "os.getenv('FEDACH_URL')" in source
