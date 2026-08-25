"""Add explicit provenance for inferred SSI charge/value-date defaults.

Some bank directories publish correspondent account lines without the
settlement terms needed to execute a payment. Storing SHA/spot as unlabeled
defaults makes research look like instruction data. ``terms_inferred`` keeps
those rows reviewable while routing rejects them.
"""

import importlib.util
from pathlib import Path
from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "20260823_ssi_terms_inferred"
down_revision: Union[str, Sequence[str], None] = "20260820_ssi_seed_fingerprint"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _load_provenance_migration():
    """Load historical SQLite trigger definitions without importing app code."""
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
    for statement in previous.SSI_AS_OF_SQLITE:
        op.execute(statement)


def upgrade() -> None:
    op.add_column(
        "ssi",
        sa.Column(
            "terms_inferred",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    with op.batch_alter_table("ssi") as batch:
        batch.create_check_constraint(
            "ck_ssi_inferred_terms_are_labeled_placeholders",
            "NOT terms_inferred OR (charge_code IS NOT NULL AND "
            "value_date IS NOT NULL)",
        )
    _reinstall_as_of_triggers(op.get_bind())


def downgrade() -> None:
    bind = op.get_bind()
    inferred_count = bind.execute(
        sa.text("SELECT COUNT(*) FROM ssi WHERE terms_inferred")
    ).scalar_one()
    if inferred_count:
        raise RuntimeError(
            "Refusing to remove terms_inferred while "
            f"{inferred_count} inferred-term row(s) remain; review them from "
            "source data before downgrading"
        )
    with op.batch_alter_table("ssi") as batch:
        batch.drop_constraint(
            "ck_ssi_inferred_terms_are_labeled_placeholders", type_="check"
        )
        batch.drop_column("terms_inferred")
    _reinstall_as_of_triggers(bind)
