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

# Imported rather than restated: the same trigger text defined twice is how
# the model and the migration drifted apart once already in this branch.
from app.models import SSI_AS_OF_POSTGRES, SSI_AS_OF_SQLITE  # noqa: E402

_SQLITE_DROP = [
    "DROP TRIGGER IF EXISTS ssi_as_of_insert",
    "DROP TRIGGER IF EXISTS ssi_as_of_update",
]
_POSTGRES_DROP = [
    "DROP TRIGGER IF EXISTS ssi_as_of_insert ON ssi",
    "DROP TRIGGER IF EXISTS ssi_as_of_update ON ssi",
    "DROP FUNCTION IF EXISTS ssi_as_of_is_real_and_past()",
]


def _is_a_real_past_date(value: str) -> bool:
    from datetime import date

    try:
        parsed = date.fromisoformat(value)
    except (TypeError, ValueError):
        return False
    return parsed.isoformat() == value and parsed <= date.today()


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

    op.add_column("ssi", sa.Column("verified_by", sa.String(length=120), nullable=True))
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
