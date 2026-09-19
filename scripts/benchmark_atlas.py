#!/usr/bin/env python3
"""Measure the atlas snapshot boundary and record a reproducible baseline.

The endpoint intentionally executes one SSI snapshot query and does the small
rollup in Python. This script is evidence for that boundary, not a CI timing
threshold: run it against the current database and with ``--synthetic 20000``
when evaluating corpus growth.
"""

from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db import Base, SessionLocal, engine
from app.models import SSI
from app.services.atlas import build_network


def measure(scope: str, session_factory=SessionLocal, target_engine=engine) -> dict[str, object]:
    statements = 0

    def count_select(_conn, _cursor, statement, _parameters, _context, _executemany):
        nonlocal statements
        if statement.lstrip().upper().startswith("SELECT"):
            statements += 1

    event.listen(target_engine, "before_cursor_execute", count_select)
    started = time.perf_counter()
    try:
        with session_factory() as session:
            response = build_network(session, scope)  # type: ignore[arg-type]
    finally:
        elapsed_ms = (time.perf_counter() - started) * 1000
        event.remove(target_engine, "before_cursor_execute", count_select)
    return {
        "scope": scope,
        "rows": response.totals.ssi_rows,
        "beneficiary_banks": response.totals.beneficiary_banks,
        "correspondents": response.totals.correspondents,
        "sql_selects": statements,
        "elapsed_ms": round(elapsed_ms, 2),
    }


def make_synthetic_database(row_count: int):
    """Build a disposable SSI corpus so ``--synthetic`` measures real work."""
    if row_count < 0:
        raise ValueError("synthetic row count must be non-negative")
    synthetic_engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
        future=True,
    )
    Base.metadata.create_all(bind=synthetic_engine)
    synthetic_sessions = sessionmaker(bind=synthetic_engine, autoflush=False, future=True)
    session = synthetic_sessions()
    countries = ("US", "GB", "DE", "CA", "SG", "JP")
    currencies = ("USD", "EUR", "GBP", "CAD", "SGD", "JPY")
    try:
        for index in range(row_count):
            country = countries[index % len(countries)]
            currency = currencies[index % len(currencies)]
            bic_only = index % 4 == 0
            session.add(SSI(
                beneficiary_bic=f"BANK{country}{index:05d}",
                beneficiary_bank_name=f"Synthetic beneficiary {index:05d}",
                currency=currency,
                intermediary_bic=f"HUBS{country}{index % 37:05d}",
                intermediary_bank_name=f"Synthetic correspondent {index % 37:02d}",
                intermediary_account=None if bic_only else f"INTERMEDIARY-{index:05d}",
                beneficiary_account=None if bic_only else f"BENEFICIARY-{index:05d}",
                charge_code=None if bic_only else "SHA",
                value_date=None if bic_only else "spot",
                notes="Synthetic benchmark row",
                status="unverified",
                bic_only=bic_only,
            ))
        session.commit()
    finally:
        session.close()
    return synthetic_engine, synthetic_sessions


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--synthetic", type=int, default=0, help="document the intended growth corpus size")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    result: dict[str, object] = {
        "database": str(engine.url),
        "current": [measure("all"), measure("settleable")],
        "synthetic_target_rows": args.synthetic or None,
        "note": "Timing is evidence, not a flaky CI assertion; synthetic runs use a disposable in-memory copy.",
    }
    if args.synthetic:
        synthetic_engine, synthetic_sessions = make_synthetic_database(args.synthetic)
        try:
            result["synthetic"] = [
                measure("all", synthetic_sessions, synthetic_engine),
                measure("settleable", synthetic_sessions, synthetic_engine),
            ]
        finally:
            synthetic_engine.dispose()
    rendered = json.dumps(result, indent=2)
    if args.output:
        args.output.write_text(rendered + "\n", encoding="utf-8")
    else:
        print(rendered)


if __name__ == "__main__":
    main()
