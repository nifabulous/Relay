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

The expression is dialect-specific because a date-shape test is not portable:
SQLite has GLOB, Postgres has POSIX regex.

Revision ID: 20260816_ssi_asofshape
"""

from typing import Sequence, Union

from alembic import op

revision: str = "20260816_ssi_asofshape"
down_revision: Union[str, Sequence[str], None] = "20260816_ssi_pubdate"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

CONSTRAINT = "ck_ssi_as_of_is_a_past_iso_date"

SQLITE = "as_of IS NULL OR as_of GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'"
POSTGRES = "as_of IS NULL OR as_of ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'"


def _expression() -> str:
    return SQLITE if op.get_bind().dialect.name == "sqlite" else POSTGRES


def upgrade() -> None:
    with op.batch_alter_table("ssi") as batch:
        batch.create_check_constraint(CONSTRAINT, _expression())


def downgrade() -> None:
    with op.batch_alter_table("ssi") as batch:
        batch.drop_constraint(CONSTRAINT, type_="check")
