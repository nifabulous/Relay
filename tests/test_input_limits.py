"""Request bodies that describe a correspondent chain are bounded.

Screening fuzzy-matches every intermediary name against the whole watchlist,
so an unbounded list or name let one unauthenticated request hold a function
for its full 30s budget. The same chain shape feeds the fee and tracking
endpoints. A real chain has a handful of hops, so the caps reject only abuse.
"""
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
