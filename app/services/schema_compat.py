"""Non-destructive SQLite schema compatibility for the zero-setup dev path.

New databases are still created by ``Base.metadata.create_all``. For an
existing dev SQLite file, this helper brings ``payment_events`` up to the
current model with plain ``ALTER TABLE`` — it never drops or rewrites data,
and it only adds columns that are missing. Production uses Alembic
(``alembic upgrade head``); this path exists solely so the dev file does not
need to be deleted to gain the scheduling columns.
"""
import logging

from sqlalchemy import inspect, text

logger = logging.getLogger(__name__)

_PAYMENT_EVENTS = "payment_events"
_NEW_COLUMNS = (
    # (column sql, human-readable description)
    ("schedule VARCHAR(10) NOT NULL DEFAULT 'instant'", "schedule"),
    ("revealed_at VARCHAR(30)", "revealed_at"),
)


def ensure_sqlite_schema(engine) -> None:
    """Add missing ``payment_events`` columns to an existing SQLite DB.

    Additive-only: inspects the current table and issues ``ALTER TABLE``
    solely for columns the table lacks. Existing rows are preserved; the
    ``DEFAULT 'instant'`` on ``schedule`` backfills legacy rows so the
    public contract (admin/demo timelines stay instant) holds. If the
    table does not exist yet, ``create_all`` owns that case — this is a no-op.
    """
    inspector = inspect(engine)
    if not inspector.has_table(_PAYMENT_EVENTS):
        return

    existing = {c["name"] for c in inspector.get_columns(_PAYMENT_EVENTS)}
    with engine.begin() as conn:
        for ddl, name in _NEW_COLUMNS:
            if name in existing:
                continue
            conn.execute(text(f"ALTER TABLE {_PAYMENT_EVENTS} ADD COLUMN {ddl}"))
            logger.info("Added payment_events.%s to legacy SQLite DB", name)