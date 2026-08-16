"""Non-destructive SQLite schema compatibility for the zero-setup dev path.

New databases are still created by ``Base.metadata.create_all``. For an
existing dev SQLite file, this helper brings compatibility tables up to the
current model with plain ``ALTER TABLE`` — it never drops or rewrites data,
and it only adds columns that are missing. Production uses Alembic
(``alembic upgrade head``); this path exists solely so the dev file does not
need to be deleted to gain the current columns.
"""
import logging

from sqlalchemy import inspect, text

logger = logging.getLogger(__name__)

_TABLE_PATCHES = {
    "payment_events": (
        ("schedule VARCHAR(10) NOT NULL DEFAULT 'instant'", "schedule"),
        ("revealed_at VARCHAR(30)", "revealed_at"),
    ),
    "ssi": (
        ("as_of VARCHAR(10)", "as_of"),
        ("verified_by VARCHAR(120)", "verified_by"),
        ("status VARCHAR(12) NOT NULL DEFAULT 'illustrative'", "status"),
    ),
}


def ensure_sqlite_schema(engine) -> None:
    """Add missing compatibility columns to an existing SQLite DB.

    Additive-only: inspects the current table and issues ``ALTER TABLE``
    solely for columns the table lacks. Existing rows are preserved; the
    defaults backfill legacy rows where the current model requires a value.
    If a table does not exist yet, ``create_all`` owns that case — this is a
    no-op.
    """
    inspector = inspect(engine)
    for table_name, patches in _TABLE_PATCHES.items():
        if not inspector.has_table(table_name):
            continue

        existing = {column["name"] for column in inspector.get_columns(table_name)}
        with engine.begin() as conn:
            for ddl, name in patches:
                if name in existing:
                    continue
                conn.execute(text(f"ALTER TABLE {table_name} ADD COLUMN {ddl}"))
                logger.info("Added %s.%s to legacy SQLite DB", table_name, name)
