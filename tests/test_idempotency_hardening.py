"""Idempotency keys are bounded, scoped to one endpoint, and race-safe.

Both endpoints that take an Idempotency-Key are open to learners, and every
new key adds a row. An unvalidated key could be arbitrarily long (SQLite
ignores the String(200) limit; Postgres would raise a 500 past it), a key used
on one endpoint silently replayed the other endpoint's UETR, and two
concurrent first uses of a key collided on the unique index as a 500.
"""
import uuid

import pytest
from sqlalchemy import select

from app.models import IdempotencyKey
from app.services.idempotency import (
    IdempotencyKeyConflict,
    IdempotencyKeyInFlight,
    resolve_uetr,
)

_TRACK = (
    "/api/track/create",
    {
        "originator_bic": "DEUTDEFF",
        "originator_name": "Deutsche Bank",
        "beneficiary_bic": "NWBKGB2L",
        "beneficiary_name": "NatWest",
        "currency": "GBP",
        "amount": 1000,
    },
)
_PREPARE = (
    "/api/prepare-payment",
    {
        "beneficiary_iban": "GB29NWBK60161331926819",
        "beneficiary_name": "Jane Doe",
        "currency": "GBP",
        "amount": 1000,
    },
)


@pytest.mark.parametrize("path, body", [_TRACK, _PREPARE])
@pytest.mark.parametrize("key", ["k" * 201, "has space", "café".encode("latin-1")])
def test_a_malformed_key_is_rejected(client, path, body, key):
    response = client.post(path, json=body, headers={"Idempotency-Key": key})
    assert response.status_code == 422, response.text


@pytest.mark.parametrize("path, body", [_TRACK, _PREPARE])
def test_a_200_character_key_is_accepted(client, path, body):
    key = f"{uuid.uuid4()}".ljust(200, "x")
    response = client.post(path, json=body, headers={"Idempotency-Key": key})
    assert response.status_code == 200, response.text


def test_a_key_reused_on_another_endpoint_is_a_409(client):
    key = f"cross-endpoint-{uuid.uuid4()}"
    first = client.post(_TRACK[0], json=_TRACK[1], headers={"Idempotency-Key": key})
    assert first.status_code == 200, first.text
    second = client.post(_PREPARE[0], json=_PREPARE[1], headers={"Idempotency-Key": key})
    assert second.status_code == 409, second.text


def test_a_concurrent_first_use_is_refused_as_in_progress(db_session_clean, monkeypatch):
    """Another request inserts the key between our lookup and our insert.

    The winner has committed its key but, most likely, not its timeline yet.
    Replaying its UETR would let this request see no events and write a second
    timeline for the same UETR, so it is refused as in progress (a 409) and
    writes nothing.
    """
    winner = "11111111-1111-4111-8111-111111111111"
    db_session_clean.add(IdempotencyKey(key="raced-key", uetr=winner, endpoint="track/create"))
    db_session_clean.commit()

    real_execute = db_session_clean.execute
    calls = {"n": 0}

    def first_lookup_misses(statement, *args, **kwargs):
        calls["n"] += 1
        if calls["n"] == 1:
            return real_execute(select(IdempotencyKey).where(IdempotencyKey.key == "absent"))
        return real_execute(statement, *args, **kwargs)

    monkeypatch.setattr(db_session_clean, "execute", first_lookup_misses)
    with pytest.raises(IdempotencyKeyInFlight):
        resolve_uetr(
            db_session_clean, "raced-key", "track/create", lambda: "22222222-2222-4222-8222-222222222222"
        )
    monkeypatch.undo()
    stored = db_session_clean.execute(select(IdempotencyKey)).scalars().all()
    assert [(row.key, row.uetr) for row in stored] == [("raced-key", winner)]
    assert issubclass(IdempotencyKeyInFlight, IdempotencyKeyConflict)


def test_the_service_refuses_a_key_owned_by_another_endpoint(db_session_clean):
    db_session_clean.add(IdempotencyKey(key="owned", uetr="u", endpoint="prepare-payment"))
    db_session_clean.commit()
    with pytest.raises(IdempotencyKeyConflict):
        resolve_uetr(db_session_clean, "owned", "track/create", lambda: "x")
