"""The SSI upload separates the uploader's mistakes from server faults.

A malformed file is the uploader's to fix, so it answers 400 with the parse
error. A database failure is not: answering it as a 400 "Parse error" handed
raw SQLAlchemy text (statements, parameters) to the caller and blamed the file.
"""
import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.exc import OperationalError

ROOT = Path(__file__).resolve().parents[1]


def _upload(client, name, body):
    return client.post("/api/import/ssi", files={"file": (name, body, "application/octet-stream")})


@pytest.mark.parametrize(
    "name, body",
    [
        ("ssi.json", b'{"not": "a list"}'),
        ("ssi.json", b"[1, 2]"),
        ("ssi.json", b"{broken"),
        ("ssi.json", b'[{"beneficiary_bic": "DEUTDEFFXXX", "currency": 840}]'),
        ("ssi.json", b'[{"beneficiary_bic": "DEUTDEFFXXX", "notes": []}]'),
        ("ssi.json", b"[" * 50_000),
    ],
    ids=["object", "scalars", "broken", "number-value", "list-value", "deep-nesting"],
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


@pytest.mark.parametrize("suffix", [".csv", ".json"])
def test_an_upload_naming_a_server_file_is_not_read_as_that_file(client, tmp_path, suffix):
    """The upload body is file content, never a path on the server.

    The parsers accept a str as either a path or raw content and open it when
    os.path.isfile says it exists, so a body naming a server file imported
    that file.
    """
    server_file = tmp_path / f"server-side{suffix}"
    row = {
        "beneficiary_bic": "DEUTDEFFXXX",
        "currency": "NOK",
        "intermediary_bic": "CITIUS33XXX",
        "intermediary_account": "ACCT-1",
        "beneficiary_account": "ACCT-2",
    }
    if suffix == ".csv":
        server_file.write_text(",".join(row) + "\n" + ",".join(row.values()) + "\n")
    else:
        server_file.write_text(json.dumps([row]))

    response = _upload(client, f"ssi{suffix}", str(server_file).encode())
    if response.status_code == 200:
        body = response.json()
        assert body["inserted"] == 0 and body["updated"] == 0, body
    else:
        assert response.status_code == 400, response.text


@pytest.mark.parametrize("newline", ["\n", "\r\n", "\r"], ids=["lf", "crlf", "cr"])
def test_the_sample_csv_parses_with_any_line_ending(client, newline):
    """The upload reaches the parser as a stream; every line ending must still split rows."""
    rows = (ROOT / "samples" / "ssi_sample.csv").read_text(encoding="utf-8").splitlines()
    body = newline.join(rows).encode()
    response = _upload(client, "ssi.csv", body)
    assert response.status_code == 200, response.text
    result = response.json()
    assert result["inserted"] + result["updated"] + result["rejected"] == len(rows) - 1, result
