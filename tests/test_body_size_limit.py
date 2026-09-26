"""Request bodies are size-limited before any handler parses them.

Many request fields have no length limit of their own, so the body size is the
backstop that bounds per-request work. The default comfortably fits the largest
legitimate JSON body (a legacy telemetry flush of up to 500 events); the tutor
and the admin SSI upload get the larger budgets their schemas need.
"""
import json

import pytest

DEFAULT_LIMIT = 128 * 1024
TUTOR_LIMIT = 256 * 1024
IMPORT_LIMIT = 1024 * 1024


def _json_of_size(size):
    """A JSON object whose encoded length is exactly ``size`` bytes."""
    skeleton = json.dumps({"sender_name": "", "beneficiary_name": "x"})
    return skeleton.replace('""', '"' + "a" * (size - len(skeleton)) + '"', 1).encode()


def _chunks(body, size=16 * 1024):
    for start in range(0, len(body), size):
        yield body[start:start + size]


def test_a_body_over_the_default_limit_is_rejected_with_413(client):
    response = client.post(
        "/api/screen",
        content=_json_of_size(DEFAULT_LIMIT + 1),
        headers={"content-type": "application/json"},
    )
    assert response.status_code == 413, response.text


def test_a_streamed_body_without_content_length_is_still_limited(client):
    response = client.post(
        "/api/screen",
        content=_chunks(_json_of_size(DEFAULT_LIMIT + 1)),
        headers={"content-type": "application/json"},
    )
    assert response.status_code == 413, response.text


def test_a_body_at_the_default_limit_reaches_the_handler(client):
    response = client.post(
        "/api/screen",
        content=_json_of_size(DEFAULT_LIMIT),
        headers={"content-type": "application/json"},
    )
    # The handler's own validation (sender_name max_length) answers, not the limit.
    assert response.status_code == 422, response.text


def test_the_tutor_accepts_bodies_above_the_default_limit(client):
    body = _json_of_size(DEFAULT_LIMIT + 1)
    response = client.post(
        "/api/tutor/chat", content=body, headers={"content-type": "application/json"}
    )
    assert response.status_code != 413, response.text


def test_the_tutor_rejects_bodies_over_its_own_limit(client):
    response = client.post(
        "/api/tutor/chat",
        content=_json_of_size(TUTOR_LIMIT + 1),
        headers={"content-type": "application/json"},
    )
    assert response.status_code == 413, response.text


@pytest.mark.parametrize(
    "size, rejected", [(IMPORT_LIMIT - 4096, False), (IMPORT_LIMIT + 1, True)]
)
def test_the_ssi_upload_has_a_one_mebibyte_limit(client, size, rejected):
    csv = b"beneficiary_bic,currency\n" + b"x" * size
    response = client.post(
        "/api/import/ssi", files={"file": ("ssi.csv", csv, "text/csv")}
    )
    assert (response.status_code == 413) is rejected, response.text
