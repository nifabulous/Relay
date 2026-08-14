"""add payment_event schedule columns

Revision ID: ee4f41a79988
Revises: caaf89867e3e
Create Date: 2026-08-13 21:53:15.865474

"""
from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'ee4f41a79988'
down_revision: Union[str, Sequence[str], None] = 'caaf89867e3e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add schedule + revealed_at to payment_events, backfilling instant.

    The ``server_default`` on ``schedule`` exists so existing rows are
    backfilled as ``instant`` (the public contract: admin/demo timelines
    stay instant) in the same ALTER TABLE — every event row is preserved.
    Batch mode keeps the operations SQLite-safe.
    """
    with op.batch_alter_table('payment_events') as batch_op:
        batch_op.add_column(
            sa.Column('schedule', sa.String(length=10), nullable=False,
                      server_default='instant')
        )
        batch_op.add_column(
            sa.Column('revealed_at', sa.String(length=30), nullable=True)
        )


def downgrade() -> None:
    """Remove the scheduling columns via SQLite-safe batch operations."""
    with op.batch_alter_table('payment_events') as batch_op:
        batch_op.drop_column('schedule')
        batch_op.drop_column('revealed_at')