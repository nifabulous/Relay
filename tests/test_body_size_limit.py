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
    if rejected:
        assert response.status_code == 413, response.text
    else:
        # The body reached the importer, which answers for the file itself
        # (the csv module rejects a 1 MB field); not a limit, auth or server error.
        assert response.status_code in (200, 400), response.text
        if response.status_code == 400:
            assert response.json()["detail"].startswith("Parse error:"), response.text


def _drive(chunks, path="/api/screen"):
    """Send a streamed body through the middleware straight into a reading app.

    The test client flattens a streamed body into one message, so the byte count
    across several http.request messages is only exercised here.
    """
    import asyncio

    from app.request_limits import BodySizeLimitMiddleware

    messages = [
        {"type": "http.request", "body": chunk, "more_body": index < len(chunks) - 1}
        for index, chunk in enumerate(chunks)
    ]
    sent = []

    async def reading_app(scope, receive, send):
        while (await receive()).get("more_body"):
            pass
        await send({"type": "http.response.start", "status": 200, "headers": []})
        await send({"type": "http.response.body", "body": b"ok"})

    async def receive():
        return messages.pop(0)

    async def send(message):
        sent.append(message)

    scope = {"type": "http", "path": path, "headers": []}
    asyncio.run(BodySizeLimitMiddleware(reading_app)(scope, receive, send))
    return sent


def test_streamed_chunks_are_counted_together_against_the_limit():
    from starlette.exceptions import HTTPException

    chunk = b"x" * (50 * 1024)  # each chunk alone is far under the 128 KiB default
    with pytest.raises(HTTPException) as raised:
        _drive([chunk, chunk, chunk])
    assert raised.value.status_code == 413


def test_streamed_chunks_under_the_limit_pass_through():
    chunk = b"x" * (40 * 1024)
    sent = _drive([chunk, chunk, chunk])
    assert sent[0]["status"] == 200
