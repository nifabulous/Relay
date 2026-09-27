"""Request bodies that describe a correspondent chain are bounded.

Screening fuzzy-matches every intermediary name against the whole watchlist,
so an unbounded list or name let one unauthenticated request hold a function
for its full 30s budget. The same chain shape feeds the fee and tracking
endpoints. A real chain has a handful of hops, so the caps reject only abuse.
"""
import json

import pytest

MAX_CHAIN_HOPS = 10

_SCREEN = {"sender_name": "Acme Trading Ltd", "beneficiary_name": "Globex GmbH"}
_FEES = {"amount": 1000, "currency": "USD", "charge_code": "SHA"}
_TRACK = {
    "originator_bic": "DEUTDEFF",
    "originator_name": "Deutsche Bank",
    "beneficiary_bic": "NWBKGB2L",
    "beneficiary_name": "NatWest",
    "currency": "GBP",
    "amount": 1000,
    "charge_code": "SHA",
    "outcome": "credited",
}
_CHAIN_ENDPOINTS = [
    ("/api/screen", _SCREEN),
    ("/api/fees/simulate", _FEES),
    ("/api/track/create", _TRACK),
]


def _chain(hops, name="Citibank N.A.", bic="CITIUS33"):
    return {"intermediary_bics": [bic] * hops, "intermediary_names": [name] * hops}


@pytest.mark.parametrize("path, body", _CHAIN_ENDPOINTS)
def test_a_chain_longer_than_the_cap_is_rejected(client, path, body):
    response = client.post(path, json={**body, **_chain(MAX_CHAIN_HOPS + 1)})
    assert response.status_code == 422, response.text


@pytest.mark.parametrize("path, body", _CHAIN_ENDPOINTS)
def test_an_intermediary_name_longer_than_200_characters_is_rejected(client, path, body):
    response = client.post(path, json={**body, **_chain(1, name="A" * 201)})
    assert response.status_code == 422, response.text


@pytest.mark.parametrize("path, body", _CHAIN_ENDPOINTS)
def test_an_intermediary_bic_longer_than_11_characters_is_rejected(client, path, body):
    response = client.post(path, json={**body, **_chain(1, bic="C" * 12)})
    assert response.status_code == 422, response.text


@pytest.mark.parametrize("path, body", _CHAIN_ENDPOINTS)
def test_a_chain_at_the_cap_is_accepted(client, path, body):
    response = client.post(path, json={**body, **_chain(MAX_CHAIN_HOPS, name="B" * 200)})
    assert response.status_code == 200, response.text


_PREPARE = {
    "beneficiary_iban": "GB29NWBK60161331926819",
    "beneficiary_name": "Jane Doe",
    "currency": "GBP",
}
MAX_PAYMENT_AMOUNT = 1_000_000_000_000


@pytest.mark.parametrize("path, body", [("/api/track/create", _TRACK), ("/api/prepare-payment", _PREPARE)])
def test_an_amount_above_the_cap_is_rejected(client, path, body):
    """Timelines store the amount as text in a 20-character column."""
    response = client.post(path, json={**body, "amount": MAX_PAYMENT_AMOUNT * 10})
    assert response.status_code == 422, response.text


@pytest.mark.parametrize("path, body", [("/api/track/create", _TRACK), ("/api/prepare-payment", _PREPARE)])
def test_an_amount_at_the_cap_is_accepted(client, path, body):
    response = client.post(path, json={**body, "amount": MAX_PAYMENT_AMOUNT})
    assert response.status_code == 200, response.text


def test_track_create_rejects_an_unknown_charge_code(client):
    response = client.post("/api/track/create", json={**_TRACK, "charge_code": "XXXX"})
    assert response.status_code == 422, response.text


def test_track_create_normalizes_the_charge_code(client):
    """With OUR the sender pays every fee, so the beneficiary receives the full amount."""
    response = client.post(
        "/api/track/create", json={**_TRACK, **_chain(1), "charge_code": " our "}
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["final_amount"] == body["sent_amount"], body


_AMOUNT_ENDPOINTS = [
    ("/api/track/create", _TRACK),
    ("/api/prepare-payment", _PREPARE),
    ("/api/fees/simulate", _FEES),
]


@pytest.mark.parametrize("path, body", _AMOUNT_ENDPOINTS)
@pytest.mark.parametrize("literal", ["Infinity", "1e13"])
def test_a_non_finite_or_oversized_amount_is_rejected(client, path, body, literal):
    """json.loads accepts the Infinity literal, and gt=0 alone lets it through."""
    payload = json.dumps({key: value for key, value in body.items() if key != "amount"})
    raw = payload[:-1] + f', "amount": {literal}' + "}"
    response = client.post(path, content=raw, headers={"content-type": "application/json"})
    assert response.status_code == 422, response.text


def test_fee_simulation_already_normalizes_the_charge_code(client):
    response = client.post("/api/fees/simulate", json={**_FEES, "charge_code": " our "})
    assert response.status_code == 200, response.text
    assert response.json()["charge_code"] == "OUR"
