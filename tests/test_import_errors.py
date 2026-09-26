"""The SSI upload separates the uploader's mistakes from server faults.

A malformed file is the uploader's to fix, so it answers 400 with the parse
error. A database failure is not: answering it as a 400 "Parse error" handed
raw SQLAlchemy text (statements, parameters) to the caller and blamed the file.
"""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.exc import OperationalError


def _upload(client, name, body):
    return client.post("/api/import/ssi", files={"file": (name, body, "application/octet-stream")})


@pytest.mark.parametrize(
    "name, body",
    [
        ("ssi.json", b'{"not": "a list"}'),
        ("ssi.json", b"[1, 2]"),
        ("ssi.json", b"{broken"),
    ],
)
def test_a_malformed_file_is_a_400_parse_error(client, name, body):
    response = _upload(client, name, body)
    assert response.status_code == 400, response.text
    assert response.json()["detail"].startswith("Parse error:")


def test_a_database_failure_is_a_500_without_the_sql(client, monkeypatch):
    def fail(*args, **kwargs):
        raise OperationalError(
            "INSERT INTO ssi (beneficiary_account) VALUES (?)", ("SECRET-ROW",), Exception("disk I/O error")
        )

    monkeypatch.setattr("app.services.ssi_importer.import_ssi_file", fail)
    server_errors_as_responses = TestClient(client.app, raise_server_exceptions=False)
    response = _upload(server_errors_as_responses, "ssi.csv", b"beneficiary_bic,currency\n")
    assert response.status_code == 500, response.text
    assert "INSERT" not in response.text and "SECRET-ROW" not in response.text
