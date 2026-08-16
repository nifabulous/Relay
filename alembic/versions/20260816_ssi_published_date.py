"""Require a verification date on SSI rows claiming "published".

"published" asserts that someone confirmed the bank still publishes the
instruction; `as_of` is the date of that check. Without it the status is an
unfalsifiable claim, and a direct ORM write never passes through Pydantic.

Revision ID: 20260816_ssi_pubdate
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "20260816_ssi_pubdate"
down_revision: Union[str, Sequence[str], None] = "20260816_ssi_prov"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Preflight. The schema this replaces accepted a "published" row with no
    # date at all: as_of was nullable and nothing required it, so a populated
    # database can be holding one. Without this the batch rebuild fails
    # part-way through the deploy with a bare IntegrityError naming no rows —
    # and on SQLite it strands _alembic_tmp_ssi, blocking every later attempt.
    #
    # Reported rather than repaired: supplying or clearing a verification date
    # is a provenance decision, and the operator is the only one who knows
    # whether currency was ever confirmed. Both repairs below are valid
    # against the schema the operator still has (verified_by does not exist
    # yet, so it cannot be named).
    bind = op.get_bind()
    undated = list(
        bind.execute(
            sa.text(
                "SELECT id, beneficiary_bic, currency FROM ssi "
                "WHERE status = 'published' AND (as_of IS NULL OR as_of = '')"
            )
        )
    )
    if undated:
        ids = ", ".join(str(row[0]) for row in undated[:20])
        raise RuntimeError(
            f"{len(undated)} ssi row(s) claim status='published' without a "
            f"verification date, so the constraint cannot be applied.\n"
            f"Inspect:  SELECT id, beneficiary_bic, currency, status, as_of "
            f"FROM ssi WHERE id IN ({ids});\n"
            f"Supply the date the verification actually happened:\n"
            f"    UPDATE ssi SET as_of = '<YYYY-MM-DD>' "
            f"WHERE id IN ({ids});\n"
            f"or record that currency was never confirmed:\n"
            f"    UPDATE ssi SET status = 'unverified' "
            f"WHERE id IN ({ids});\n"
            f"then re-run this migration."
        )

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
