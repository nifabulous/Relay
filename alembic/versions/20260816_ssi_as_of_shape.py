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

from alembic import op

revision: str = "20260816_ssi_asofshape"
down_revision: Union[str, Sequence[str], None] = "20260816_ssi_pubdate"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

CONSTRAINT = "ck_ssi_as_of_is_a_past_iso_date"

SHAPE = "as_of IS NULL OR as_of LIKE '____-__-__'"


def upgrade() -> None:
    with op.batch_alter_table("ssi") as batch:
        batch.create_check_constraint(CONSTRAINT, SHAPE)


def downgrade() -> None:
    with op.batch_alter_table("ssi") as batch:
        batch.drop_constraint(CONSTRAINT, type_="check")
