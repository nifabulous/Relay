"""Require a named verifier for "published", and enforce as_of at the database.

Two gaps this closes, both reported against the previous revisions:

1. Any caller could assert `published` by supplying a date. There was nothing
   to distinguish "research checked the bank's page today" from "a service
   copied a field forward". `verified_by` is that distinction, and the CHECK
   makes it mandatory, so a generic writer cannot produce the claim.

2. The recency and calendar rules lived only in Python, so Core inserts, bulk
   operations and raw SQL bypassed them. They are triggers now. A CHECK cannot
   host them — SQLite refuses `date('now')` as non-deterministic and Postgres
   requires CHECK functions to be IMMUTABLE — but a trigger may, on both.

DIALECT_SPECIFIC_SQL: trigger bodies have no portable form, so both branches
are written out and the portability test requires the pair.

Revision ID: 20260816_ssi_verifiedby
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "20260816_ssi_verifiedby"
down_revision: Union[str, Sequence[str], None] = "20260816_ssi_asofshape"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

DIALECT_SPECIFIC_SQL = True

# Copied, not imported. A migration has to keep doing what it did the day it
# was written: importing app.models would mean a later edit there silently
# changed how an old database upgrades. The duplication that creates is real —
# it is how the model and the migration drifted apart earlier in this branch —
# so a test pins these strings to the model's, which catches drift without
# making history mutable.
_MESSAGE = "as_of must be a real calendar date, in the past, written YYYY-MM-DD"
SSI_AS_OF_MESSAGE = _MESSAGE

_SQLITE_AS_OF_CONDITION = (
    "NEW.as_of IS NOT NULL AND ("
    "date(NEW.as_of) IS NULL OR date(NEW.as_of) != NEW.as_of "
    "OR NEW.as_of < '0001-01-01' OR NEW.as_of > date('now'))"
)

SSI_AS_OF_SQLITE = [
    f"""CREATE TRIGGER ssi_as_of_insert BEFORE INSERT ON ssi
        WHEN {_SQLITE_AS_OF_CONDITION}
        BEGIN SELECT RAISE(ABORT, '{SSI_AS_OF_MESSAGE}'); END""",
    f"""CREATE TRIGGER ssi_as_of_update BEFORE UPDATE ON ssi
        WHEN {_SQLITE_AS_OF_CONDITION}
        BEGIN SELECT RAISE(ABORT, '{SSI_AS_OF_MESSAGE}'); END""",
]

SSI_AS_OF_POSTGRES = [
    f"""CREATE OR REPLACE FUNCTION ssi_as_of_is_real_and_past() RETURNS trigger AS $$
        BEGIN
          IF NEW.as_of IS NOT NULL THEN
            IF NEW.as_of !~ '^[0-9]{{4}}-[0-9]{{2}}-[0-9]{{2}}$' THEN
              RAISE EXCEPTION '{SSI_AS_OF_MESSAGE}';
            END IF;
            BEGIN
              IF NEW.as_of < '0001-01-01'
                 OR to_char(NEW.as_of::date, 'YYYY-MM-DD') <> NEW.as_of
                 OR NEW.as_of::date > ((CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date) THEN
                RAISE EXCEPTION '{SSI_AS_OF_MESSAGE}';
              END IF;
            EXCEPTION WHEN others THEN
              RAISE EXCEPTION '{SSI_AS_OF_MESSAGE}';
            END;
          END IF;
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql""",
    """CREATE TRIGGER ssi_as_of_insert BEFORE INSERT ON ssi
       FOR EACH ROW EXECUTE FUNCTION ssi_as_of_is_real_and_past()""",
    """CREATE TRIGGER ssi_as_of_update BEFORE UPDATE ON ssi
       FOR EACH ROW EXECUTE FUNCTION ssi_as_of_is_real_and_past()""",
]

_SQLITE_DROP = [
    "DROP TRIGGER IF EXISTS ssi_as_of_insert",
    "DROP TRIGGER IF EXISTS ssi_as_of_update",
]
_POSTGRES_DROP = [
    "DROP TRIGGER IF EXISTS ssi_as_of_insert ON ssi",
    "DROP TRIGGER IF EXISTS ssi_as_of_update ON ssi",
    "DROP FUNCTION IF EXISTS ssi_as_of_is_real_and_past()",
]


def _has_column(bind, name: str) -> bool:
    return name in {
        column["name"] for column in sa.inspect(bind).get_columns("ssi")
    }


def _is_a_real_past_date(value: str) -> bool:
    # UTC, matching the triggers this migration installs and the ORM
    # validators. date.today() is local, and near a timezone boundary it would
    # either block a deploy over a value the trigger accepts or wave through
    # one the trigger will not.
    from datetime import date, datetime, timezone

    try:
        parsed = date.fromisoformat(value)
    except (TypeError, ValueError):
        return False
    return parsed.isoformat() == value and parsed <= datetime.now(timezone.utc).date()


def upgrade() -> None:
    bind = op.get_bind()

    # Preflight: the triggers only police new writes, but a row already holding
    # a future or impossible date would then be un-updatable — any UPDATE would
    # re-run the trigger against it. Surface those before creating them.
    stale = [
        (row_id, value)
        for row_id, value in bind.execute(
            sa.text("SELECT id, as_of FROM ssi WHERE as_of IS NOT NULL")
        )
        if not _is_a_real_past_date(value)
    ]
    if stale:
        raise RuntimeError(
            f"{len(stale)} ssi row(s) hold an as_of that is not a real past "
            f"date (e.g. id={stale[0][0]} as_of={stale[0][1]!r}). The triggers "
            f"added here would make those rows impossible to update.\n"
            f"Inspect:  SELECT id, beneficiary_bic, status, as_of FROM ssi "
            f"WHERE id IN ({', '.join(str(i) for i, _ in stale[:20])});\n"
            f"Clear them where the status permits it:\n"
            f"    UPDATE ssi SET as_of = NULL WHERE id IN (...) "
            f"AND status != 'published';\n"
            f"For status='published' rows, supply the real date or downgrade:\n"
            f"    UPDATE ssi SET status = 'unverified', as_of = NULL, "
            f"verified_by = NULL WHERE id IN (...);\n"
            f"then re-run this migration."
        )

    # This preflight runs before any schema change, and its remediation is
    # written against the schema the operator still has.
    #
    # An earlier version added the column first so the message could name
    # verified_by. That works on SQLite, where the column survives the abort,
    # and fails on PostgreSQL, where DDL is transactional and the failed
    # migration rolls the column back — leaving the operator with repair
    # instructions naming a column that no longer exists. Hence: no schema
    # change until the data is known to fit, and no remediation that depends
    # on one.
    unattributed = list(
        bind.execute(
            sa.text(
                "SELECT id, beneficiary_bic, currency FROM ssi "
                "WHERE status = 'published'"
            )
        )
    )
    if unattributed:
        ids = ", ".join(str(row[0]) for row in unattributed[:20])
        raise RuntimeError(
            f"{len(unattributed)} ssi row(s) are status='published' from before "
            f"provenance required a named verifier "
            f"(e.g. id={unattributed[0][0]} {unattributed[0][1]}/"
            f"{unattributed[0][2]}).\n"
            f"Inspect:  SELECT id, beneficiary_bic, currency, as_of FROM ssi "
            f"WHERE id IN ({ids});\n"
            f"Record that currency was never confirmed:\n"
            f"    UPDATE ssi SET status = 'unverified' WHERE id IN ({ids});\n"
            f"then re-run this migration. To publish them again afterwards, use "
            f"record_verified_publication(), which names the verifier and the "
            f"date it was checked.\n"
            f"(This statement is deliberately valid against the current schema: "
            f"verified_by does not exist yet, and on PostgreSQL a failed "
            f"migration rolls back any column it added.)"
        )

    if not _has_column(bind, "verified_by"):
        op.add_column(
            "ssi", sa.Column("verified_by", sa.String(length=120), nullable=True)
        )

    with op.batch_alter_table("ssi") as batch:
        batch.create_check_constraint(
            "ck_ssi_published_names_a_verifier",
            "status != 'published' OR (verified_by IS NOT NULL AND TRIM(verified_by) != '')",
        )

    statements = SSI_AS_OF_SQLITE if bind.dialect.name == "sqlite" else SSI_AS_OF_POSTGRES
    for statement in statements:
        op.execute(statement)


def downgrade() -> None:
    bind = op.get_bind()
    for statement in (_SQLITE_DROP if bind.dialect.name == "sqlite" else _POSTGRES_DROP):
        op.execute(statement)
    with op.batch_alter_table("ssi") as batch:
        batch.drop_constraint("ck_ssi_published_names_a_verifier", type_="check")
        batch.drop_column("verified_by")
