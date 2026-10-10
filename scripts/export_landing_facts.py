#!/usr/bin/env python3
"""Export the facts the landing page states about Relay.

Every count on the landing page comes from here. The export seeds a private
in-memory SQLite database with the app's own seed code and queries it, so the
numbers describe the reference data shipped at this commit. It never opens
config.DATABASE_URL, whatever that points at.

Usage: python scripts/export_landing_facts.py [--out PATH]
"""
from __future__ import annotations

import argparse
import json
import sys
from contextlib import contextmanager
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
# Resolve `app` from this checkout, not from wherever an editable install points.
sys.path.insert(0, str(REPO_ROOT))

from sqlalchemy import create_engine, distinct, func, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.data.landing_corridors import LANDING_CORRIDORS
from app.data.payment_schemes import (
    get_international_schemes,
    get_schemes_for_currency,
    list_currencies_with_schemes,
)
from app.data.sanctions_watchlist import WATCHLIST
from app.db import Base
from app.models import SSI, Bank, CorridorRule
from app.services.atlas import build_network
from app.services.recommendation import Recommendation
from app.services.seed import seed_if_empty
from app.services.stp_checker import RULES as STP_RULES
from app.services.value_date import DEFAULT_LAG_BY_CURRENCY, HOLIDAYS, SCHEME_LAGS

DEFAULT_OUT = REPO_ROOT / "frontend" / "src" / "landing" / "generated" / "facts.json"
SCHEMA_VERSION = 1


@contextmanager
def seeded_session():
    """A session on a fresh, private, seeded in-memory database."""
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
        future=True,
    )
    try:
        Base.metadata.create_all(bind=engine)
        factory = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)
        with factory() as session:
            seed_if_empty(session)
            yield session
    finally:
        engine.dispose()


def _count(session: Session, statement) -> int:
    return int(session.scalar(statement) or 0)


def _scheme(entry: dict) -> dict:
    return {
        "name": entry["name"],
        "speed": entry["speed"],
        "limit": entry["limit"],
        "cost": entry["cost"],
    }


def _rails() -> dict:
    currencies = []
    for code in list_currencies_with_schemes():
        data = get_schemes_for_currency(code)
        currencies.append(
            {
                "code": code,
                "country": data["country"],
                "verifiedAsOf": data["verifiedAsof"],
                "schemes": [_scheme(s) for s in data["schemes"]],
            }
        )
    international = get_international_schemes()
    domestic = sum(len(c["schemes"]) for c in currencies)
    # The international catalogue is one entry; it counts as a rail only when present.
    international_rails = 1 if international.get("name") else 0
    return {
        "currencyCount": len(currencies),
        "domesticSchemeCount": domestic,
        "totalRailCount": domestic + international_rails,
        "currencies": currencies,
        "international": {**_scheme(international), "verifiedAsOf": international["verifiedAsof"]},
    }


def _tools() -> dict:
    lags = set(SCHEME_LAGS.values()) | set(DEFAULT_LAG_BY_CURRENCY.values())
    return {
        "verdicts": len(Recommendation),
        "watchlistEntries": len(WATCHLIST),
        "holidayCalendars": len(HOLIDAYS),
        "settlementLagDays": {"min": min(lags), "max": max(lags)},
        "stpRules": len(STP_RULES),
    }


def _corridors() -> list:
    out = []
    for corridor in LANDING_CORRIDORS:
        out.append(
            {
                "currency": corridor["currency"],
                "origin": dict(corridor["origin"]),
                "destination": dict(corridor["destination"]),
                # Only the kind reaches the page: rule sources name real banks.
                "source": corridor["source"]["kind"],
            }
        )
    return out


def build_facts(session: Session) -> dict:
    network = build_network(session)
    return {
        "schemaVersion": SCHEMA_VERSION,
        "directory": {
            "banks": _count(session, select(func.count()).select_from(Bank)),
            "countries": _count(session, select(func.count(distinct(Bank.country_code)))),
        },
        "ssi": {
            "rows": _count(session, select(func.count()).select_from(SSI)),
            "settleableRows": _count(
                session, select(func.count()).select_from(SSI).where(SSI.bic_only.is_(False))
            ),
            "beneficiaryBanks": _count(session, select(func.count(distinct(SSI.beneficiary_bic)))),
            "correspondents": _count(session, select(func.count(distinct(SSI.intermediary_bic)))),
        },
        "atlas": {"beneficiaryCountries": len(network.observed_beneficiary_country_codes)},
        "corridorRules": {
            "rows": _count(session, select(func.count()).select_from(CorridorRule)),
            "corridors": _count(
                session,
                select(func.count()).select_from(
                    select(CorridorRule.destination_currency, CorridorRule.destination_country)
                    .distinct()
                    .subquery()
                ),
            ),
        },
        "rails": _rails(),
        "tools": _tools(),
        "corridors": _corridors(),
    }


def render(facts: dict) -> str:
    return json.dumps(facts, indent=2, sort_keys=True, ensure_ascii=False) + "\n"


def export(out: Path) -> dict:
    with seeded_session() as session:
        facts = build_facts(session)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(render(facts), encoding="utf-8")
    return facts


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    args = parser.parse_args(argv)
    export(args.out)
    print(f"landing facts written to {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
