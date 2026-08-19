"""Non-destructive SQLite schema compatibility for the zero-setup dev path.

New databases are still created by ``Base.metadata.create_all``. For an
existing dev SQLite file, this helper brings compatibility tables up to the
current model — it only adds what is missing, and it never loses data.
Columns are added with plain ``ALTER TABLE``; the one constraint that SQLite
cannot add that way (the bic_only CHECK) is installed with a table rebuild
that preserves every column and row. Production uses Alembic
(``alembic upgrade head``); this path exists solely so the dev file does not
need to be deleted to gain the current schema.
"""
import logging

from sqlalchemy import MetaData, inspect, text

from app.models import SSI

logger = logging.getLogger(__name__)

_BIC_ONLY_CHECK_NAME = "ck_ssi_bic_only_has_no_accounts"

_TABLE_PATCHES = {
    "payment_events": (
        ("schedule VARCHAR(10) NOT NULL DEFAULT 'instant'", "schedule"),
        ("revealed_at VARCHAR(30)", "revealed_at"),
    ),
    "ssi": (
        ("as_of VARCHAR(10)", "as_of"),
        ("verified_by VARCHAR(120)", "verified_by"),
        ("status VARCHAR(12) NOT NULL DEFAULT 'illustrative'", "status"),
        # bic_only rows carry no accounts, charge code, or value date. The
        # CHECK itself cannot be added with ALTER TABLE in SQLite (it would
        # require a table rebuild); _ensure_ssi_bic_only_check performs that
        # rebuild after the columns land.
        ("bic_only BOOLEAN NOT NULL DEFAULT 0", "bic_only"),
    ),
}


def _ssi_trigger_sql(engine) -> list[tuple[str, str]]:
    """Capture the as_of triggers attached to the ssi table, verbatim."""
    with engine.connect() as conn:
        return [
            (name, sql)
            for name, sql in conn.execute(
                text(
                    "SELECT name, sql FROM sqlite_master "
                    "WHERE type='trigger' AND tbl_name='ssi'"
                )
            )
        ]


def _recreate_triggers(conn, triggers: list[tuple[str, str]]) -> None:
    """Re-create triggers captured before a rebuild, in capture order, on the
    given connection — the caller decides the transaction boundaries so the
    whole swap (table drop/rename plus trigger restore) is one atomic unit."""
    for name, sql in triggers:
        conn.execute(text(f"DROP TRIGGER IF EXISTS {name}"))
        conn.execute(text(sql))


def _ensure_ssi_bic_only_check(engine, inspector) -> None:
    """Install ck_ssi_bic_only_has_no_accounts on a legacy SQLite ssi table.

    SQLite cannot ADD a CHECK constraint to an existing table, so the only way
    a dev database that predates bic_only can enforce the invariant is a
    table rebuild: create a new table from the current model schema (columns
    plus every constraint), copy the columns the legacy table actually holds,
    drop the old table, and rename.

    Two safety properties are deliberate:

      * A legacy table carrying columns the current model does not know is
        REFUSED, not rebuilt. The compatibility path promises the dev file
        "never loses data", and dropping unknown columns on startup would
        break that promise silently; failing with the column names lets the
        operator decide (drop them, or recreate the dev database) instead.
        This is checked before any DDL runs.

      * The whole swap — dropping the canonical-named indexes, creating the
        rebuild table, copying the rows, dropping the old table, renaming,
        and restoring the as_of triggers 20260816_ssi_verifiedby attached —
        runs inside ONE transaction. A failure anywhere (e.g. a row that
        violates the new unique constraint) rolls everything back and leaves
        the original table intact rather than stranding a half-built state.
    """
    existing_checks = {
        c["name"] for c in inspector.get_check_constraints("ssi")
    }
    if _BIC_ONLY_CHECK_NAME in existing_checks:
        return

    existing_columns = [c["name"] for c in inspector.get_columns("ssi")]
    triggers = _ssi_trigger_sql(engine)
    meta = MetaData()
    rebuild = SSI.__table__.to_metadata(
        meta, name="ssi__bic_only_rebuild"
    )
    # to_metadata re-derives auto-named indexes (index=True columns) from the
    # new table name; after RENAME TO ssi they would stay ix_ssi__bic_only_*
    # forever. Restore the canonical names so the dev DB matches a fresh
    # create_all, then drop the old table's same-named indexes (SQLite index
    # names are database-global, so the rebuilt table could not be created
    # while they exist).
    for index in rebuild.indexes:
        index.name = index.name.replace("ssi__bic_only_rebuild", "ssi")
    unknown = sorted(set(existing_columns) - set(rebuild.c.keys()))
    if unknown:
        raise ValueError(
            "Refusing to rebuild legacy ssi table: columns not in the current "
            f"model would be dropped: {unknown}. Drop them, or recreate the "
            "dev database, instead of letting the compatibility path discard "
            "data on startup."
        )
    common = [name for name in existing_columns if name in rebuild.c]
    column_list = ", ".join(f'"{name}"' for name in common)

    try:
        with engine.begin() as conn:
            conn.execute(text("DROP TABLE IF EXISTS ssi__bic_only_rebuild"))
            for index in rebuild.indexes:
                conn.execute(
                    text(f'DROP INDEX IF EXISTS "{index.name}"')
                )
            rebuild.create(bind=conn)
            conn.execute(
                text(
                    f"INSERT INTO ssi__bic_only_rebuild ({column_list}) "
                    f"SELECT {column_list} FROM ssi"
                )
            )
            # The copy above is the only step that can fail on data
            # (e.g. a duplicate-key row). Every statement after it is DDL and
            # runs only once the data has copied successfully, so a failure
            # never drops the canonical table beneath live data.
            conn.execute(text("DROP TABLE ssi"))
            conn.execute(text("ALTER TABLE ssi__bic_only_rebuild RENAME TO ssi"))
            _recreate_triggers(conn, triggers)
    except Exception:
        # SQLite's sqlite3 driver auto-commits DDL, so engine.begin()'s
        # transaction rollback does not remove the staging table. Drop the
        # leftover ssi__bic_only_rebuild so the dev DB never observes a
        # half-built state; the canonical ``ssi`` table is untouched because
        # the only data-destructive step (DROP TABLE ssi) runs AFTER the row
        # copy that raised. On PostgreSQL the whole block is transactional and
        # this cleanup is a no-op there.
        with engine.begin() as cleanup:
            cleanup.execute(text("DROP TABLE IF EXISTS ssi__bic_only_rebuild"))
        logger.warning(
            "Rolled back partial ssi rebuild; original ssi table preserved"
        )
        raise
    logger.info("Rebuilt legacy ssi table with the bic_only CHECK")
    logger.info("Rebuilt legacy ssi table with the bic_only CHECK")


def ensure_sqlite_schema(engine) -> None:
    """Bring an existing SQLite DB up to the current schema.

    Additive-only for columns: inspects the current table and issues
    ``ALTER TABLE`` solely for columns the table lacks. The bic_only CHECK is
    the one structural exception — see _ensure_ssi_bic_only_check.
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

    if inspector.has_table("ssi"):
        _ensure_ssi_bic_only_check(engine, inspect(engine))
