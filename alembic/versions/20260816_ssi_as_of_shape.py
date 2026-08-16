"""Make the database itself reject a malformed or future as_of.

The earlier constraint only required as_of to be present. Mapper events cover
ORM writes, but Core inserts, bulk operations and raw SQL bypass them, so a
future or malformed date could still be persisted — verified before writing
this: raw SQL accepted '2999-01-01', 'garbage' and '   '.

This constrains the *shape* only. "Not in the future" cannot be expressed as a
CHECK in either engine: SQLite refuses `date('now')` with "non-deterministic
use of date() in a CHECK constraint", and Postgres requires functions in a
CHECK to be IMMUTABLE, which CURRENT_DATE is not. A trigger is the only
database-level option, and a caller with raw SQL access can drop a trigger as
easily as write a row, so the recency rule stays in the ORM listener and the
Pydantic validators. Malformed and whitespace values are caught here, which is
what a CHECK can actually promise.

The expression uses LIKE with `_`, the strictest shape test both engines share.
A dialect-specific version (GLOB / POSIX regex) was stricter but diverged from
the model, which emitted the SQLite form on Postgres where GLOB is not an
operator. One portable expression in both places cannot drift.

It follows that the constraint accepts letters in the digit positions and
impossible calendar dates such as 2024-02-30; `date.fromisoformat` in the ORM
listener and the Pydantic validators are what reject those.

Revision ID: 20260816_ssi_asofshape
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "20260816_ssi_asofshape"
down_revision: Union[str, Sequence[str], None] = "20260816_ssi_pubdate"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

CONSTRAINT = "ck_ssi_as_of_is_a_past_iso_date"

SHAPE = "as_of IS NULL OR as_of LIKE '____-__-__'"


def upgrade() -> None:
    # Preflight. The constraint applies to every row, and the schema this
    # replaces accepted any non-empty as_of, so a populated database can be
    # holding values that violate it. Without this the batch rebuild fails
    # part-way through the deploy with a bare IntegrityError naming no rows —
    # and on SQLite it strands _alembic_tmp_ssi, blocking every later attempt.
    #
    # Reported rather than repaired: clearing an as_of is a silent edit to
    # payment provenance, and that is the operator's decision, not a
    # migration's.
    bind = op.get_bind()
    bad_shape = f"NOT ({SHAPE})"

    published = bind.execute(
        sa.text(f"SELECT COUNT(*) FROM ssi WHERE {bad_shape} AND status = 'published'")
    ).scalar_one()
    other = bind.execute(
        sa.text(f"SELECT COUNT(*) FROM ssi WHERE {bad_shape} AND status != 'published'")
    ).scalar_one()

    if published or other:
        lines = [
            f"{published + other} ssi row(s) have an as_of that is not "
            f"YYYY-MM-DD, so the new constraint cannot be applied.",
            f"Inspect:  SELECT id, beneficiary_bic, currency, status, as_of "
            f"FROM ssi WHERE {bad_shape};",
        ]
        if other:
            lines.append(
                f"  {other} row(s) may simply have the value cleared:\n"
                f"    UPDATE ssi SET as_of = NULL "
                f"WHERE {bad_shape} AND status != 'published';"
            )
        if published:
            # Nulling these would violate ck_ssi_published_has_verification_date,
            # so the obvious repair is a dead end for them. They need either a
            # real verification date or an explicit downgrade.
            lines.append(
                f"  {published} row(s) are status='published', which requires a "
                f"date, so clearing as_of alone will fail. Either supply the "
                f"date verification actually happened:\n"
                f"    UPDATE ssi SET as_of = '<YYYY-MM-DD>' "
                f"WHERE {bad_shape} AND status = 'published';\n"
                f"  or record that currency was never confirmed:\n"
                f"    UPDATE ssi SET status = 'unverified', as_of = NULL "
                f"WHERE {bad_shape} AND status = 'published';"
            )
        lines.append("then re-run this migration.")
        raise RuntimeError("\n".join(lines))

    # Shape is all this constraint enforces, so these do not block the upgrade
    # — but they are semantically wrong and the operator should know they are
    # there while the data is in front of them.
    suspect = bind.execute(sa.text(
        "SELECT COUNT(*) FROM ssi WHERE as_of IS NOT NULL AND ("
        "CAST(substr(as_of, 6, 2) AS INTEGER) NOT BETWEEN 1 AND 12 OR "
        "CAST(substr(as_of, 9, 2) AS INTEGER) NOT BETWEEN 1 AND 31)"
    )).scalar_one()
    if suspect:
        print(
            f"  warning: {suspect} ssi row(s) have an as_of that is shaped like "
            f"a date but is not one (impossible month or day). The shape "
            f"constraint permits them; the ORM validators do not."
        )

    with op.batch_alter_table("ssi") as batch:
        batch.create_check_constraint(CONSTRAINT, SHAPE)


def downgrade() -> None:
    with op.batch_alter_table("ssi") as batch:
        batch.drop_constraint(CONSTRAINT, type_="check")
