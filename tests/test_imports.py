"""
Tests for the Fedwire/FedACH import HTTP endpoints — mocked to avoid network calls.
"""
from unittest.mock import patch
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
