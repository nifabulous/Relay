"""Track the last curated-seed snapshot for safe SSI reconciliation.

The seeder must be able to remove an instruction that disappeared from its
authoritative source set without deleting a row an operator corrected after
the original seed run. The nullable fingerprint is intentionally additive:
legacy rows are handled conservatively by the seeder until they receive a
snapshot.
"""

import importlib.util
from pathlib import Path
from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "20260820_ssi_seed_fingerprint"
down_revision: Union[str, Sequence[str], None] = "20260819_ssi_bic_only"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _load_provenance_migration():
    """Load the historical trigger definitions without importing app code."""
    path = Path(__file__).with_name("20260816_ssi_verified_by.py")
    spec = importlib.util.spec_from_file_location("20260816_ssi_verified_by", path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Cannot load historical migration at {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _reinstall_as_of_triggers(bind) -> None:
    """Restore SQLite triggers destroyed by Alembic's batch table rebuild."""
    if bind.dialect.name != "sqlite":
        return
    previous = _load_provenance_migration()
    for statement in previous._SQLITE_DROP:
        op.execute(statement)
    for statement in previous.SSI_AS_OF_SQLITE:
        op.execute(statement)


def upgrade() -> None:
    op.add_column("ssi", sa.Column("seed_fingerprint", sa.String(length=64), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    with op.batch_alter_table("ssi") as batch:
        batch.drop_column("seed_fingerprint")
    _reinstall_as_of_triggers(bind)
