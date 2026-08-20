"""Track the last curated-seed snapshot for safe SSI reconciliation.

The seeder must be able to remove an instruction that disappeared from its
authoritative source set without deleting a row an operator corrected after
the original seed run. The nullable fingerprint is intentionally additive:
legacy rows are handled conservatively by the seeder until they receive a
snapshot.
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "20260820_ssi_seed_fingerprint"
down_revision: Union[str, Sequence[str], None] = "20260819_ssi_bic_only"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("ssi", sa.Column("seed_fingerprint", sa.String(length=64), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("ssi") as batch:
        batch.drop_column("seed_fingerprint")
