"""Tests for the non-destructive SQLite schema compatibility helper.

Builds raw engines on in-memory SQLite (StaticPool, same convention as
tests/conftest.py) so a "legacy" payment_events table can be simulated
independently of the current ORM model.
"""
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.pool import StaticPool

from app.db import Base
from app.services.schema_compat import ensure_sqlite_schema

LEGACY_DDL = """
CREATE TABLE payment_events (
    id INTEGER PRIMARY KEY,
    uetr VARCHAR(36) NOT NULL,
    status VARCHAR(20) NOT NULL,
    bank_bic VARCHAR(11) NOT NULL,
    bank_name VARCHAR(200),
    hop INTEGER,
    timestamp VARCHAR(30) NOT NULL,
    amount VARCHAR(20),
    currency VARCHAR(3),
    charge_code VARCHAR(3),
    message VARCHAR(500),
    instructing_bic VARCHAR(11),
    instructed_bic VARCHAR(11)
)
"""


def _raw_engine():
    return create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
        future=True,
    )


def _legacy_engine_with_event():
    engine = _raw_engine()
    with engine.begin() as conn:
        conn.execute(text(LEGACY_DDL))
        conn.execute(
            text(
                "INSERT INTO payment_events "
                "(uetr, status, bank_bic, timestamp, amount, currency, charge_code) "
                "VALUES (:uetr, :status, :bic, :ts, :amount, :ccy, :charge)"
            ),
            {
                "uetr": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
                "status": "CREDITED",
                "bic": "GTBINGLAXXX",
                "ts": "2026-08-13T09:00:00+00:00",
                "amount": "4850.50",
                "ccy": "USD",
                "charge": "SHA",
            },
        )
    return engine


class TestLegacyTableGainsColumnsWithoutDataLoss:
    def test_existing_row_survives_and_gets_instant_semantics(self):
        engine = _legacy_engine_with_event()

        ensure_sqlite_schema(engine)

        with engine.connect() as conn:
            row = conn.execute(
                text(
                    "SELECT uetr, status, bank_bic, timestamp, amount, currency, "
                    "charge_code, schedule, revealed_at FROM payment_events"
                )
            ).mappings().one()
        assert row["uetr"] == "f47ac10b-58cc-4372-a567-0e02b2c3d479"
        assert row["status"] == "CREDITED"
        assert row["bank_bic"] == "GTBINGLAXXX"
        assert row["timestamp"] == "2026-08-13T09:00:00+00:00"
        assert row["amount"] == "4850.50"
        assert row["currency"] == "USD"
        assert row["charge_code"] == "SHA"
        assert row["schedule"] == "instant"
        assert row["revealed_at"] is None

    def test_columns_are_added_with_expected_types(self):
        engine = _legacy_engine_with_event()

        ensure_sqlite_schema(engine)

        columns = {c["name"]: c for c in inspect(engine).get_columns("payment_events")}
        assert columns["schedule"]["nullable"] is False
        assert columns["revealed_at"]["nullable"] is True

    def test_missing_table_is_a_noop(self):
        engine = _raw_engine()

        ensure_sqlite_schema(engine)

        assert "payment_events" not in inspect(engine).get_table_names()


class TestCurrentSchemaIsANoop:
    def test_current_schema_unchanged_and_rows_intact(self):
        engine = _raw_engine()
        Base.metadata.create_all(bind=engine)
        from sqlalchemy.orm import sessionmaker

        from app.models import PaymentEvent

        SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)
        with SessionLocal() as session:
            session.add(PaymentEvent(
                uetr="f47ac10b-58cc-4372-a567-0e02b2c3d479",
                status="CREDITED",
                bank_bic="GTBINGLAXXX",
                timestamp="2026-08-13T09:00:00+00:00",
                schedule="scheduled",
                revealed_at="2026-08-13T09:00:10+00:00",
            ))
            session.commit()

        columns_before = {
            c["name"] for c in inspect(engine).get_columns("payment_events")
        }
        ensure_sqlite_schema(engine)
        columns_after = {
            c["name"] for c in inspect(engine).get_columns("payment_events")
        }

        assert columns_after == columns_before
        with engine.connect() as conn:
            row = conn.execute(
                text(
                    "SELECT schedule, revealed_at FROM payment_events "
                    "WHERE uetr = 'f47ac10b-58cc-4372-a567-0e02b2c3d479'"
                )
            ).mappings().one()
        assert row["schedule"] == "scheduled"
        assert row["revealed_at"] == "2026-08-13T09:00:10+00:00"