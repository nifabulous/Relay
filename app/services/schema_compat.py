"""Non-destructive SQLite schema compatibility for the zero-setup dev path.

New databases are still created by ``Base.metadata.create_all``. For an
existing dev SQLite file, this helper brings compatibility tables up to the
current model — it only adds what is missing, and it never loses data.
Columns are added with plain ``ALTER TABLE``; the constraints SQLite cannot
add that way (the bic_only CHECKs) are installed with a table rebuild that
preserves every column and row — and puts the original table back, by name,
if any step of the swap fails. Production uses Alembic
(``alembic upgrade head``); this path exists solely so the dev file does not
need to be deleted to gain the current schema.
"""
import logging

from sqlalchemy import MetaData, inspect, text

from app.models import SSI

logger = logging.getLogger(__name__)

# The rebuild installs every CHECK the current model carries, so a legacy
# table is only "done" when all of them are present. Testing a single name
# would let a dev database rebuilt by an older revision of this code skip
# the rebuild and keep running without a constraint the model now asserts.
_REQUIRED_SSI_CHECKS = frozenset({
    "ck_ssi_bic_only_has_no_accounts",
    "ck_ssi_ordinary_has_settlement_terms",
})

_TABLE_PATCHES = {
    "payment_events": (
        ("schedule VARCHAR(10) NOT NULL DEFAULT 'instant'", "schedule"),
        ("revealed_at VARCHAR(30)", "revealed_at"),
    ),
    "ssi": (
        ("as_of VARCHAR(10)", "as_of"),
        ("verified_by VARCHAR(120)", "verified_by"),
        ("status VARCHAR(12) NOT NULL DEFAULT 'illustrative'", "status"),
        # These columns are nullable because an old table may have rows whose
        # settlement terms were never established. The compatibility path
        # refuses such populated rows before rebuilding; it must not invent
        # SHA/spot values just to satisfy the current CHECK.
        ("charge_code VARCHAR(3)", "charge_code"),
        ("value_date VARCHAR(10)", "value_date"),
        # bic_only rows carry no accounts, charge code, or value date. The
        # CHECK itself cannot be added with ALTER TABLE in SQLite (it would
        # require a table rebuild); _ensure_ssi_bic_only_check performs that
        # rebuild after the columns land.
        ("bic_only BOOLEAN NOT NULL DEFAULT 0", "bic_only"),
        ("seed_fingerprint VARCHAR(64)", "seed_fingerprint"),
    ),
}


def _quote_sqlite_identifier(name: str) -> str:
    """Quote a SQLite identifier, including legacy names containing quotes."""
    return '"' + name.replace('"', '""') + '"'


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


def _ssi_index_sql(engine) -> list[tuple[str, str]]:
    """Capture the named indexes attached to the ssi table, verbatim.

    sqlite_master carries NULL sql for the implicit indexes a UNIQUE
    constraint creates, so ``sql IS NOT NULL`` selects exactly the CREATE
    INDEX statements someone chose to name — the ones the rebuild drops for
    name availability, and has to put back on the original table if it
    fails."""
    with engine.connect() as conn:
        return [
            (name, sql)
            for name, sql in conn.execute(
                text(
                    "SELECT name, sql FROM sqlite_master "
                    "WHERE type='index' AND tbl_name='ssi' AND sql IS NOT NULL"
                )
            )
        ]


def _recreate_triggers(conn, triggers: list[tuple[str, str]]) -> None:
    """Re-create triggers captured before a rebuild, in capture order, on the
    given connection. DROP IF EXISTS first makes it idempotent: the recovery
    path runs it against a table whose triggers may be intact, renamed
    along, or half-recreated, and must end with exactly the captured set
    either way."""
    for name, sql in triggers:
        conn.execute(
            text(f"DROP TRIGGER IF EXISTS {_quote_sqlite_identifier(name)}")
        )
        conn.execute(text(sql))


def _recreate_indexes(conn, indexes: list[tuple[str, str]]) -> None:
    """Re-create the captured named indexes on the ssi table, in capture
    order. Idempotent for the same reason as _recreate_triggers."""
    for name, sql in indexes:
        conn.execute(
            text(f"DROP INDEX IF EXISTS {_quote_sqlite_identifier(name)}")
        )
        conn.execute(text(sql))


def _table_exists(conn, name: str) -> bool:
    return bool(
        conn.execute(
            text(
                "SELECT name FROM sqlite_master "
                "WHERE type='table' AND name = :name"
            ),
            {"name": name},
        ).scalar()
    )


def _normalise_constraint_sql(sql: object) -> str:
    return "".join(str(sql if sql is not None else "").split()).lower()


def _model_check_constraints() -> dict[str, str]:
    return {
        constraint.name: _normalise_constraint_sql(constraint.sqltext)
        for constraint in SSI.__table__.constraints
        if constraint.name and getattr(constraint, "sqltext", None) is not None
    }


def _foreign_key_signature(foreign_key: dict) -> tuple:
    return (
        foreign_key.get("name"),
        tuple(foreign_key.get("constrained_columns") or ()),
        foreign_key.get("referred_table"),
        tuple(foreign_key.get("referred_columns") or ()),
        foreign_key.get("onupdate"),
        foreign_key.get("ondelete"),
        foreign_key.get("deferrable"),
        foreign_key.get("initially"),
    )


def _model_foreign_key_signatures() -> set[tuple]:
    signatures = set()
    for constraint in SSI.__table__.foreign_key_constraints:
        elements = list(constraint.elements)
        signatures.add((
            constraint.name,
            tuple(element.parent.name for element in elements),
            elements[0].column.table.name,
            tuple(element.column.name for element in elements),
            constraint.onupdate,
            constraint.ondelete,
            constraint.deferrable,
            constraint.initially,
        ))
    return signatures


def _refuse_unknown_ssi_constraints(inspector) -> None:
    """Refuse a rebuild that would silently drop legacy integrity rules."""
    expected_checks = _model_check_constraints()
    unknown_checks = []
    for check in inspector.get_check_constraints("ssi"):
        name = check.get("name")
        if expected_checks.get(name) != _normalise_constraint_sql(check.get("sqltext")):
            unknown_checks.append(name or check.get("sqltext") or "<unnamed CHECK>")

    expected_foreign_keys = _model_foreign_key_signatures()
    unknown_foreign_keys = [
        foreign_key.get("name") or _foreign_key_signature(foreign_key)
        for foreign_key in inspector.get_foreign_keys("ssi")
        if _foreign_key_signature(foreign_key) not in expected_foreign_keys
    ]

    details = []
    if unknown_checks:
        details.append(f"CHECK constraints {unknown_checks}")
    if unknown_foreign_keys:
        details.append(f"foreign keys {unknown_foreign_keys}")
    if details:
        raise ValueError(
            "Refusing to rebuild legacy ssi table: constraints not in the "
            "current model would be dropped: " + "; ".join(details)
        )


def _ordinary_ssi_rows_missing_settlement_terms(engine, existing_columns: set[str]) -> list[int]:
    """Return ids that would fail the ordinary-row settlement CHECK."""
    if "charge_code" not in existing_columns or "value_date" not in existing_columns:
        terms = "1 = 1"
    else:
        terms = (
            "(charge_code IS NULL OR charge_code = '' OR "
            "value_date IS NULL OR value_date = '')"
        )
    if "bic_only" in existing_columns:
        terms = f"NOT bic_only AND ({terms})"
    with engine.connect() as conn:
        return [
            row[0]
            for row in conn.execute(
                text(f"SELECT id FROM ssi WHERE {terms} ORDER BY id")
            ).fetchall()
        ]


def _refuse_missing_settlement_terms(engine, existing_columns: set[str]) -> None:
    missing = _ordinary_ssi_rows_missing_settlement_terms(engine, existing_columns)
    if missing:
        raise ValueError(
            "Refusing to rebuild legacy ssi table: ordinary SSI rows have "
            "missing settlement terms (charge_code/value_date); repair row "
            f"id(s) from source data before startup: {missing}"
        )


def _ensure_ssi_bic_only_check(engine, inspector) -> None:
    """Install the model's ssi CHECK constraints on a legacy SQLite ssi table.

    SQLite cannot ADD a CHECK constraint to an existing table, so the only
    way a dev database that predates them can enforce the invariants is a
    table rebuild: create a new table from the current model schema (columns
    plus every constraint), copy the columns the legacy table actually holds,
    and swap it in.

    Three safety properties are deliberate:

      * A legacy table carrying columns the current model does not know is
        REFUSED, not rebuilt. The compatibility path promises the dev file
        "never loses data", and dropping unknown columns on startup would
        break that promise silently; failing with the column names lets the
        operator decide (drop them, or recreate the dev database) instead.
        This is checked before any DDL runs.

      * The canonical table is never dropped. It is renamed aside and kept
        as a restorable backup until the replacement is fully in place —
        rows copied, renamed to ``ssi``, and the as_of triggers
        20260816_ssi_verifiedby attached re-created. SQLite's driver
        auto-commits DDL, so no transaction can make the swap atomic; the
        backup is what makes it recoverable instead. Any failure after the
        copy puts the original back by name, with its triggers and its
        named indexes, so startup fails on a database that is whole rather
        than one whose ssi table — or its triggers — are gone.

      * Row data moves exactly once, into the staging table, before anything
        destructive happens; a failure there leaves the original untouched.
    """
    existing_checks = {
        c["name"] for c in inspector.get_check_constraints("ssi")
    }
    if _REQUIRED_SSI_CHECKS <= existing_checks:
        return

    existing_columns = [c["name"] for c in inspector.get_columns("ssi")]
    _refuse_missing_settlement_terms(engine, set(existing_columns))
    _refuse_unknown_ssi_constraints(inspector)
    triggers = _ssi_trigger_sql(engine)
    indexes = _ssi_index_sql(engine)
    meta = MetaData()
    rebuild = SSI.__table__.to_metadata(
        meta, name="ssi__bic_only_rebuild"
    )
    # to_metadata re-derives auto-named indexes (index=True columns) from the
    # new table name; after RENAME TO ssi they would stay ix_ssi__bic_only_*
    # forever. Restore the canonical names so the dev DB matches a fresh
    # create_all, then drop the old table's same-named indexes (SQLite index
    # names are database-global, so the rebuilt table could not be created
    # while they exist) — keeping their SQL, because a failed rebuild has to
    # put them back on the original table.
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
                    text(
                        "DROP INDEX IF EXISTS "
                        f"{_quote_sqlite_identifier(index.name)}"
                    )
                )
            rebuild.create(bind=conn)
            conn.execute(
                text(
                    f"INSERT INTO ssi__bic_only_rebuild ({column_list}) "
                    f"SELECT {column_list} FROM ssi"
                )
            )
            # The swap, through a backup that can be put back by name. Every
            # statement from here on is DDL that the driver auto-commits, so
            # a failure between statements cannot be rolled back — only
            # restored from. The backup is dropped last, after the
            # replacement table is fully in place and its triggers restored.
            conn.execute(text("ALTER TABLE ssi RENAME TO ssi__bic_only_backup"))
            conn.execute(text("ALTER TABLE ssi__bic_only_rebuild RENAME TO ssi"))
            _recreate_triggers(conn, triggers)
            model_index_names = {index.name for index in rebuild.indexes}
            _recreate_indexes(
                conn,
                [
                    (name, sql)
                    for name, sql in indexes
                    if name not in model_index_names
                ],
            )
            conn.execute(text("DROP TABLE ssi__bic_only_backup"))
    except Exception:
        # Put the original back. The staging table goes first; if the backup
        # exists, the canonical name was moved away from the original, so
        # whatever holds it now is the half-built replacement and is
        # discarded. Triggers and named indexes are re-created from the
        # verbatim captures — the swap may have dropped or renamed them — so
        # the restored table is the original in full, not merely its rows.
        with engine.begin() as cleanup:
            cleanup.execute(text("DROP TABLE IF EXISTS ssi__bic_only_rebuild"))
            if _table_exists(cleanup, "ssi__bic_only_backup"):
                cleanup.execute(text("DROP TABLE IF EXISTS ssi"))
                cleanup.execute(
                    text("ALTER TABLE ssi__bic_only_backup RENAME TO ssi")
                )
            _recreate_triggers(cleanup, triggers)
            _recreate_indexes(cleanup, indexes)
        logger.warning(
            "Rolled back partial ssi rebuild; original ssi table restored"
        )
        raise
    logger.info("Rebuilt legacy ssi table with the model's CHECK constraints")


def ensure_sqlite_schema(engine) -> None:
    """Bring an existing SQLite DB up to the current schema.

    Additive-only for columns: inspects the current table and issues
    ``ALTER TABLE`` solely for columns the table lacks. The ssi CHECK
    constraints are the one structural exception — see
    _ensure_ssi_bic_only_check.
    """
    inspector = inspect(engine)
    if inspector.has_table("ssi"):
        existing_columns = {
            column["name"] for column in inspector.get_columns("ssi")
        }
        unknown = sorted(existing_columns - set(SSI.__table__.c.keys()))
        if unknown:
            raise ValueError(
                "Refusing to rebuild legacy ssi table: columns not in the current "
                f"model would be dropped: {unknown}. Drop them, or recreate the "
                "dev database, instead of letting the compatibility path discard "
                "data on startup."
            )
        _refuse_missing_settlement_terms(engine, existing_columns)
        _refuse_unknown_ssi_constraints(inspector)
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
