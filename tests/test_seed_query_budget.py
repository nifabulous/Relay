"""Seeding must not issue one SELECT per seed row.

Every Vercel cold start seeds a fresh /tmp SQLite database inside the
function's 30s ``maxDuration``. Looking up each SSI, bank and corridor-rule
row with its own query issued 14,387 SELECTs against ssi alone; removing the
SSI lookups took a fresh seed on a file-backed SQLite database from 4.0s to
1.7s locally. Existing rows have to be read once per table, on both the fresh
path and the reseed (reconciliation) path.
"""
import re

import pytest
from sqlalchemy import UniqueConstraint, create_engine, event, text
from sqlalchemy.exc import MultipleResultsFound
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db import Base
from app.models import SSI
from app.services.seed import SEED_BIC_ALIASES, SSI_RECORDS, seed_if_empty

# Reads per curated BIC alias, plus the whole-table reads (SSI retirement and
# the route-key index; one index read each for banks and corridor rules), plus
# a little headroom. Thousands of times below one-per-seed-row.
_ALIAS_READS = {"ssi": 2, "banks": 1, "corridor_rules": 1}
_WHOLE_TABLE_READS = {"ssi": 2, "banks": 1, "corridor_rules": 1}
_HEADROOM = 3
_MAX_SELECTS = {
    table: per_alias * len(SEED_BIC_ALIASES) + _WHOLE_TABLE_READS[table] + _HEADROOM
    for table, per_alias in _ALIAS_READS.items()
}
_SELECT_FROM = re.compile(r"^\s*SELECT\b.*?\bFROM (\w+)\b", re.IGNORECASE | re.DOTALL)


def _memory_engine():
    return create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
        future=True,
    )


def _session_factory(engine):
    return sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)


def _seed_counting_selects(engine, session_factory):
    counts = dict.fromkeys(_MAX_SELECTS, 0)

    def record(conn, cursor, statement, parameters, context, executemany):
        match = _SELECT_FROM.search(statement)
        if match and match.group(1) in counts:
            counts[match.group(1)] += 1

    event.listen(engine, "before_cursor_execute", record)
    try:
        with session_factory() as session:
            inserted = seed_if_empty(session)
    finally:
        event.remove(engine, "before_cursor_execute", record)
    return inserted, counts


def _assert_within_budget(phase, counts):
    over = {
        table: count for table, count in counts.items() if count > _MAX_SELECTS[table]
    }
    assert not over, f"{phase} seed exceeded the SELECT budget {_MAX_SELECTS}: {over}"


def test_seed_reads_each_table_once_instead_of_a_select_per_row():
    engine = _memory_engine()
    Base.metadata.create_all(bind=engine)
    session_factory = _session_factory(engine)

    fresh, fresh_counts = _seed_counting_selects(engine, session_factory)
    assert fresh["ssi"] == len(SSI_RECORDS)
    assert fresh["banks"] > 0 and fresh["corridor_rules"] > 0
    _assert_within_budget("fresh", fresh_counts)

    reseed, reseed_counts = _seed_counting_selects(engine, session_factory)
    assert reseed["ssi"] == reseed["banks"] == reseed["corridor_rules"] == 0
    _assert_within_budget("reseed", reseed_counts)


def test_seed_still_rejects_a_duplicated_ssi_route_key():
    """A catalog holding two rows for one route key must fail the seed loudly.

    uq_ssi_composite normally makes this impossible, so the table is built
    without it to stand in for a hand-built or migrated database.
    """
    engine = _memory_engine()
    Base.metadata.create_all(
        bind=engine,
        tables=[table for table in Base.metadata.sorted_tables if table.name != "ssi"],
    )
    ssi_table = SSI.__table__
    route_key_constraint = next(
        constraint
        for constraint in ssi_table.constraints
        if isinstance(constraint, UniqueConstraint)
        and constraint.name == "uq_ssi_composite"
    )
    ssi_table.constraints.discard(route_key_constraint)
    try:
        ssi_table.create(bind=engine)
    finally:
        ssi_table.constraints.add(route_key_constraint)

    session_factory = _session_factory(engine)
    with session_factory() as session:
        seed_if_empty(session)
    columns = [column.name for column in ssi_table.columns if column.name != "id"]
    with engine.begin() as connection:
        connection.execute(
            text(
                f"INSERT INTO ssi ({', '.join(columns)}) "
                f"SELECT {', '.join(columns)} FROM ssi ORDER BY id LIMIT 1"
            )
        )

    with session_factory() as session:
        with pytest.raises(MultipleResultsFound):
            seed_if_empty(session)
