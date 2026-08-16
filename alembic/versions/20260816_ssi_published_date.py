"""Require a verification date on SSI rows claiming "published".

"published" asserts that someone confirmed the bank still publishes the
instruction; `as_of` is the date of that check. Without it the status is an
unfalsifiable claim, and a direct ORM write never passes through Pydantic.

No existing row claims "published" — the seed reserves it — so this adds a
constraint rather than repairing data.

Revision ID: 20260816_ssi_pubdate
"""

from typing import Sequence, Union

from alembic import op

revision: str = "20260816_ssi_pubdate"
down_revision: Union[str, Sequence[str], None] = "20260816_ssi_prov"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("ssi") as batch:
        batch.create_check_constraint(
            "ck_ssi_published_has_verification_date",
            "status != 'published' OR (as_of IS NOT NULL AND as_of != '')",
        )


def downgrade() -> None:
    with op.batch_alter_table("ssi") as batch:
        batch.drop_constraint(
            "ck_ssi_published_has_verification_date", type_="check"
        )
