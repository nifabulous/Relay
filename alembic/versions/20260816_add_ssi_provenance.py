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


def downgrade() -> None:
    op.drop_column("ssi", "status")
    op.drop_column("ssi", "as_of")
