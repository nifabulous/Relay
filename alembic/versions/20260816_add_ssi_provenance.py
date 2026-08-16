"""Add SSI provenance columns (as_of, status).

`status` records how an instruction was obtained, not how old it is:
"published" read from the bank's live page, "archived" read from a
point-in-time snapshot, "illustrative" not sourced from a bank at all.

Existing rows default to "illustrative" rather than "published": nothing has
confirmed their provenance, and claiming otherwise would be the overclaim the
column exists to prevent. seed.py restates the real value on the next seed.

Revision ID: 20260816_ssi_prov
"""
from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "20260816_ssi_prov"
down_revision: Union[str, Sequence[str], None] = "ee4f41a79988"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("ssi", sa.Column("as_of", sa.String(length=10), nullable=True))
    op.add_column(
        "ssi",
        sa.Column(
            "status",
            sa.String(length=12),
            nullable=False,
            server_default="illustrative",
        ),
    )
    # SQLite cannot ADD CONSTRAINT, so batch mode rebuilds the table. The same
    # call is a plain ALTER on Postgres. The constraint matters because the
    # autopilot validator is not the only writer reaching this column.
    with op.batch_alter_table("ssi") as batch:
        batch.create_check_constraint(
            "ck_ssi_status",
            "status IN ('published', 'archived', 'illustrative')",
        )


def downgrade() -> None:
    # All in one batch block: SQLite rebuilds the table once, and the CHECK has
    # to go in the same rebuild as the column it references — dropping the
    # column alone carries the constraint into a table that no longer has it.
    with op.batch_alter_table("ssi") as batch:
        batch.drop_constraint("ck_ssi_status", type_="check")
        batch.drop_column("status")
        batch.drop_column("as_of")
