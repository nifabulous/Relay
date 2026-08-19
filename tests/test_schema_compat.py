"""Tests for the non-destructive SQLite schema compatibility helper.

Builds raw engines on in-memory SQLite (StaticPool, same convention as
tests/conftest.py) so a "legacy" payment_events table can be simulated
independently of the current ORM model.
"""
import pytest
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.exc import IntegrityError
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

LEGACY_SSI_DDL = """
CREATE TABLE ssi (
    id INTEGER PRIMARY KEY,
    beneficiary_bic VARCHAR(11) NOT NULL,
    currency VARCHAR(3) NOT NULL,
    intermediary_bic VARCHAR(11) NOT NULL,
    notes VARCHAR(500)
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


def test_legacy_ssi_gains_provenance_columns_without_data_loss():
    engine = _raw_engine()
    with engine.begin() as conn:
        conn.execute(text(LEGACY_SSI_DDL))
        conn.execute(text(
            "INSERT INTO ssi (beneficiary_bic, currency, intermediary_bic, notes) "
            "VALUES ('CITIUS33XXX', 'USD', 'CHASUS33XXX', 'legacy row')"
        ))

    ensure_sqlite_schema(engine)

    with engine.connect() as conn:
        row = conn.execute(text(
            "SELECT beneficiary_bic, currency, intermediary_bic, notes, as_of, "
            "verified_by, status FROM ssi"
        )).mappings().one()
    assert row["beneficiary_bic"] == "CITIUS33XXX"
    assert row["notes"] == "legacy row"
    assert row["as_of"] is None
    assert row["verified_by"] is None
    assert row["status"] == "illustrative"


def test_legacy_schema_repair_is_idempotent():
    engine = _raw_engine()
    with engine.begin() as conn:
        conn.execute(text(LEGACY_SSI_DDL))

    ensure_sqlite_schema(engine)
    columns_after_first = {
        column["name"] for column in inspect(engine).get_columns("ssi")
    }

    ensure_sqlite_schema(engine)
    columns_after_second = {
        column["name"] for column in inspect(engine).get_columns("ssi")
    }

    assert columns_after_second == columns_after_first


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
        columns_after_first = {
            c["name"] for c in inspect(engine).get_columns("payment_events")
        }
        ensure_sqlite_schema(engine)
        columns_after_second = {
            c["name"] for c in inspect(engine).get_columns("payment_events")
        }

        assert columns_after_first == columns_before
        assert columns_after_second == columns_after_first
        with engine.connect() as conn:
            row = conn.execute(
                text(
                    "SELECT schedule, revealed_at FROM payment_events "
                    "WHERE uetr = 'f47ac10b-58cc-4372-a567-0e02b2c3d479'"
                )
            ).mappings().one()
        assert row["schedule"] == "scheduled"
        assert row["revealed_at"] == "2026-08-13T09:00:10+00:00"

    def test_current_ssi_schema_unchanged_and_provenance_intact(self):
        from sqlalchemy.orm import sessionmaker

        from app.models import SSI

        engine = _raw_engine()
        Base.metadata.create_all(bind=engine)

        SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)
        with SessionLocal() as session:
            session.add(SSI(
                beneficiary_bic="CITIUS33XXX",
                beneficiary_bank_name="Citibank N.A.",
                currency="USD",
                intermediary_bic="CHASUS33XXX",
                intermediary_bank_name="JPMorgan Chase Bank",
                intermediary_account="ACCT-USD-0001",
                beneficiary_account="ACCT-USD-0002",
                charge_code="SHA",
                value_date="spot",
                notes="Source: https://bank.example/ssi (as of 2026-08-16).",
                as_of="2026-08-16",
                verified_by="Treasury Operations",
                status="published",
            ))
            session.commit()

        expected_columns = {
            "id",
            "beneficiary_bic",
            "beneficiary_bank_name",
            "currency",
            "intermediary_bic",
            "intermediary_bank_name",
            "intermediary_account",
            "beneficiary_account",
            "charge_code",
            "value_date",
            "notes",
            "as_of",
            "verified_by",
            "status",
            "bic_only",
        }
        columns_before = {c["name"]: c for c in inspect(engine).get_columns("ssi")}
        assert set(columns_before) == expected_columns
        assert columns_before["as_of"]["type"].length == 10
        assert columns_before["as_of"]["nullable"] is True
        assert columns_before["verified_by"]["type"].length == 120
        assert columns_before["verified_by"]["nullable"] is True
        assert columns_before["status"]["type"].length == 12
        assert columns_before["status"]["nullable"] is False
        assert columns_before["bic_only"]["type"].python_type is bool
        assert columns_before["bic_only"]["nullable"] is False
        expected_provenance_metadata = {
            "as_of": (10, True),
            "verified_by": (120, True),
            "status": (12, False),
        }

        def provenance_metadata(columns):
            return {
                name: (columns[name]["type"].length, columns[name]["nullable"])
                for name in expected_provenance_metadata
            }

        assert provenance_metadata(columns_before) == expected_provenance_metadata

        def read_ssi_row():
            with engine.connect() as conn:
                return conn.execute(
                    text(
                        "SELECT beneficiary_bic, currency, intermediary_bic, "
                        "intermediary_account, beneficiary_account, charge_code, "
                        "value_date, notes, as_of, verified_by, status FROM ssi"
                    )
                ).mappings().one()

        row_before = read_ssi_row()
        ensure_sqlite_schema(engine)
        columns_after_first = {c["name"]: c for c in inspect(engine).get_columns("ssi")}
        row_after_first = read_ssi_row()
        ensure_sqlite_schema(engine)
        columns_after_second = {c["name"]: c for c in inspect(engine).get_columns("ssi")}
        row_after_second = read_ssi_row()

        assert set(columns_after_first) == expected_columns
        assert set(columns_after_second) == set(columns_after_first)
        assert provenance_metadata(columns_after_first) == expected_provenance_metadata
        assert provenance_metadata(columns_after_second) == expected_provenance_metadata
        assert row_after_first == row_before
        assert row_after_second == row_after_first

    def test_legacy_ssi_rebuild_enforces_the_bic_only_check(self):
        """The rebuild is not just cosmetic: a legacy table that gains the
        CHECK must reject a violating direct insert afterwards — raw SQL,
        deliberately, because the ORM would normalize first."""
        import pytest

        engine = _raw_engine()
        with engine.begin() as conn:
            conn.execute(text(LEGACY_SSI_DDL))
            conn.execute(text(
                "INSERT INTO ssi (beneficiary_bic, currency, intermediary_bic, notes) "
                "VALUES ('SICOTHBKXXX', 'USD', 'MRMDUS33XXX', 'legacy row')"
            ))

        ensure_sqlite_schema(engine)

        with engine.connect() as conn:
            checks = {
                c["name"] for c in inspect(engine).get_check_constraints("ssi")
            }
            assert "ck_ssi_bic_only_has_no_accounts" in checks
            row = conn.execute(text(
                "SELECT beneficiary_bic, bic_only, status FROM ssi"
            )).mappings().one()
        assert row["bic_only"] == 0
        assert row["status"] == "illustrative"

        with pytest.raises(IntegrityError):
            with engine.begin() as conn:
                conn.execute(text(
                    "INSERT INTO ssi (beneficiary_bic, currency, intermediary_bic, "
                    "status, notes, bic_only, intermediary_account) "
                    "VALUES ('EBILAEADXXX', 'USD', 'EBILAEADXXX', 'unverified', "
                    "'Source: https://bank.example/charges (as of 2026-05-01).', "
                    "1, 'ACCT-91001629')"
                ))
    def test_legacy_rebuild_refuses_to_drop_unknown_columns(self):
        """A legacy ssi table carrying columns the current model does not know
        must be refused, not silently rebuilt: the rebuild copies only model
        columns and then DROPs the old table, which would permanently discard
        the extra column from a dev database the helper promises never to lose
        data from. The refusal must happen before any DDL runs."""
        engine = _raw_engine()
        with engine.begin() as conn:
            conn.execute(text(LEGACY_SSI_DDL))
            conn.execute(text("ALTER TABLE ssi ADD COLUMN operator_tag VARCHAR(40)"))
            conn.execute(text(
                "INSERT INTO ssi (beneficiary_bic, currency, intermediary_bic, "
                "notes, operator_tag) "
                "VALUES ('SICOTHBKXXX', 'USD', 'MRMDUS33XXX', 'legacy', 'keep-me')"
            ))

        with pytest.raises(ValueError, match="operator_tag"):
            ensure_sqlite_schema(engine)

        with engine.connect() as conn:
            columns = {c["name"] for c in inspect(engine).get_columns("ssi")}
            assert "operator_tag" in columns
            row = conn.execute(text(
                "SELECT beneficiary_bic, operator_tag FROM ssi"
            )).mappings().one()
            assert row["operator_tag"] == "keep-me"

    def test_legacy_rebuild_failure_rolls_back_the_whole_swap(self):
        """Index drop + rebuild + row copy + table swap + trigger restore run
        in ONE transaction. A row that violates the rebuild's unique composite
        key must abort everything and leave the original table (name, data,
        and no half-built ssi__bic_only_rebuild) untouched."""
        from sqlalchemy.exc import IntegrityError

        engine = _raw_engine()
        with engine.begin() as conn:
            conn.execute(text(LEGACY_SSI_DDL))
            conn.execute(text(
                "INSERT INTO ssi (beneficiary_bic, currency, intermediary_bic, notes) "
                "VALUES ('CITIUS33XXX', 'USD', 'CHASUS33XXX', 'a')"
            ))
            conn.execute(text(
                "INSERT INTO ssi (beneficiary_bic, currency, intermediary_bic, notes) "
                "VALUES ('CITIUS33XXX', 'USD', 'CHASUS33XXX', 'b')"
            ))

        with pytest.raises(IntegrityError):
            ensure_sqlite_schema(engine)

        with engine.connect() as conn:
            tables = [r[0] for r in conn.execute(text(
                "SELECT name FROM sqlite_master WHERE type='table'"
            ))]
            assert "ssi" in tables
            assert "ssi__bic_only_rebuild" not in tables
            notes = conn.execute(
                text("SELECT notes FROM ssi ORDER BY notes")
            ).scalars().all()
            assert notes == ["a", "b"]
        checks = {c["name"] for c in inspect(engine).get_check_constraints("ssi")}
        assert "ck_ssi_bic_only_has_no_accounts" not in checks
