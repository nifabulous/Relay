from pathlib import Path

from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db import Base
from app.models import SSI
from app.routers._shared import _SSI_DISCLAIMER
from app.schemas import SSI_STATUSES
from app.services.atlas import build_country, build_network


def test_network_returns_complete_scoped_contract(client):
    response = client.get("/api/atlas/network")

    assert response.status_code == 200
    body = response.json()
    assert body["scope"] == "all"
    assert body["totals"]["ssi_rows"] == 7083
    assert body["totals"]["beneficiary_banks"] == 451
    assert body["totals"]["correspondents"] == 960
    assert len(body["by_status_and_tier"]) == len(SSI_STATUSES) * 2
    assert sum(item["count"] for item in body["by_status_and_tier"]) == 7083
    assert body["hub_countries"]
    assert body["hubs"]
    assert all("evidence" not in item for item in body["hubs"])
    assert body["disclaimer"] != _SSI_DISCLAIMER
    assert set(body) == {
        "scope",
        "totals",
        "by_status_and_tier",
        "spokes",
        "hub_countries",
        "hubs",
        "observed_beneficiary_country_codes",
        "observed_intermediary_country_codes",
        "disclaimer",
    }


def test_network_recomputes_settleable_rollups(client):
    response = client.get("/api/atlas/network", params={"scope": "settleable"})

    assert response.status_code == 200
    body = response.json()
    assert body["scope"] == "settleable"
    assert body["totals"]["ssi_rows"] == 4967
    assert body["totals"]["beneficiary_banks"] == 329
    assert body["totals"]["correspondents"] < 960


def test_country_unknown_well_formed_code_is_an_explicit_empty(client):
    response = client.get("/api/atlas/country/AD")

    assert response.status_code == 200
    body = response.json()
    assert body["iso2"] == "AD"
    assert body["collected"] is False
    assert body["in_scope"] == {
        "beneficiary_banks": 0,
        "beneficiary_banks_total": 451,
        "rows": 0,
        "ssi_rows_total": 7083,
    }
    assert body["correspondents"] == []


def test_country_scope_keeps_corpus_fact_and_uses_scoped_denominators(client):
    response = client.get("/api/atlas/country/CA", params={"scope": "settleable"})

    assert response.status_code == 200
    body = response.json()
    assert body["collected"] is True
    assert body["in_scope"] == {
        "beneficiary_banks": 0,
        "beneficiary_banks_total": 329,
        "rows": 0,
        "ssi_rows_total": 4967,
    }
    assert body["all_scopes"]["beneficiary_banks"] == 2
    assert body["all_scopes"]["beneficiary_banks_total"] == 451
    assert body["all_scopes"]["rows"] == 15


def test_country_malformed_code_is_rejected(client):
    assert client.get("/api/atlas/country/FRA").status_code == 422


def test_network_unknown_scope_is_rejected(client):
    assert client.get("/api/atlas/network", params={"scope": "everything"}).status_code == 422


def test_built_topology_asset_is_json_on_the_relay_mount(client):
    assets = sorted(Path("app/static/relay/assets").glob("countries-50m-*.json"))
    if not assets:
        return
    response = client.get(f"/app/assets/{assets[0].name}")
    assert response.status_code == 200
    assert response.json()["type"] == "Topology"


def test_overlapping_correspondents_are_distinct_in_each_scope():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool, future=True)
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine, future=True)
    session = Session()
    try:
        session.add_all([
            SSI(beneficiary_bic="BANKUS33XXX", beneficiary_bank_name="Bank", currency="USD", intermediary_bic="CITIUS33XXX", intermediary_bank_name="Citi", intermediary_account="ACCT-1", beneficiary_account="ACCT-2", charge_code="SHA", value_date="spot", notes="Source: test", status="unverified", bic_only=False),
            SSI(beneficiary_bic="BANKCA33XXX", beneficiary_bank_name="Canada Bank", currency="EUR", intermediary_bic="CHASUS33XXX", intermediary_bank_name="Chase", notes="Source: test", status="unverified", bic_only=True),
            SSI(beneficiary_bic="BANKGB22XXX", beneficiary_bank_name="GB Bank", currency="USD", intermediary_bic="CITIUS33XXX", intermediary_bank_name="Citi", intermediary_account="ACCT-3", beneficiary_account="ACCT-4", charge_code="SHA", value_date="spot", notes="Source: test", status="unverified", bic_only=False),
        ])
        session.commit()

        all_data = build_network(session, "all")
        settleable_data = build_network(session, "settleable")
        assert all_data.totals.beneficiary_banks == 3
        assert next(item for item in all_data.hub_countries if item.iso2 == "US").banks_served == 3
        assert next(item for item in settleable_data.hub_countries if item.iso2 == "US").banks_served == 2
        assert next(item for item in settleable_data.hub_countries if item.iso2 == "US").currencies == 1
    finally:
        session.close()
        engine.dispose()


def test_atlas_names_and_disclosures_are_canonical_and_deterministic():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool, future=True)
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine, future=True)
    session = Session()
    try:
        session.add_all([
            SSI(beneficiary_bic="BANKUS33XXX", beneficiary_bank_name="Zulu Bank", currency="USD", intermediary_bic="CITIUS33XXX", intermediary_bank_name="Zulu Correspondent", intermediary_account="ACCOUNT-1", beneficiary_account="ACCOUNT-2", charge_code="SHA", value_date="spot", notes="Source: test", status="unverified"),
            SSI(beneficiary_bic="BANKUS33XXX", beneficiary_bank_name="Alpha Bank", currency="EUR", intermediary_bic="CITIUS33XXX", intermediary_bank_name="Alpha Correspondent", intermediary_account="ACCOUNT-3", beneficiary_account="ACCOUNT-4", charge_code="SHA", value_date="spot", notes="Source: test", status="unverified"),
        ])
        session.commit()

        network = build_network(session)
        assert network.hubs[0].name == "Alpha Correspondent"
        country = build_country(session, "US")
        assert country.correspondents[0].name == "Alpha Correspondent"
        assert [(item.beneficiary_bic, item.beneficiary_bank_name) for item in country.correspondents[0].disclosures] == [("BANKUS33XXX", "Alpha Bank")]
    finally:
        session.close()
        engine.dispose()


def test_network_uses_one_snapshot_query(db_session_clean):
    statements = []

    def count_select(_conn, _cursor, statement, _parameters, _context, _executemany):
        if statement.lstrip().upper().startswith("SELECT"):
            statements.append(statement)

    event.listen(db_session_clean.bind, "before_cursor_execute", count_select)
    try:
        build_network(db_session_clean)
    finally:
        event.remove(db_session_clean.bind, "before_cursor_execute", count_select)

    assert len(statements) == 1
