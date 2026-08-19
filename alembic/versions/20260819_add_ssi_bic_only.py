"""Add bic_only to SSI — rows that assert correspondent availability only.

A correspondent-bank-charges list (the Emirates NBD PDF, e.g.) names which
banks a beneficiary settles through but publishes no account numbers, charge
codes, or value dates. Storing those rows as ordinary SSI meant fabricating
ACCT- placeholders for fields the source never established.

`bic_only` marks such rows, and a CHECK forbids the fields the source never
published: no accounts, no charge code, no value date. The application layer
(routing, /api/ssi, the autopilot validator) reads the flag to keep these
rows out of settlement selection.

A mirror CHECK holds the other side of the invariant: an ordinary row IS a
settlement instruction (routing selects exactly these rows), so it must
carry a charge code and a value date. Legacy rows written under the
pre-bic_only Python defaults get "SHA"/"spot" backfilled before the CHECK
lands — the values those rows carried when they were written.

Revision ID: 20260819_ssi_bic_only
Revises: 20260816_ssi_verifiedby
"""

import importlib.util
from pathlib import Path
from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "20260819_ssi_bic_only"
down_revision: Union[str, Sequence[str], None] = "20260816_ssi_verifiedby"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Copied from app/models.py, not imported: a migration must keep doing what
# it did the day it was written. The constraint is also spelled out in the
# model's __table_args__; a test pins the two strings together.
#
# The leading test is `NOT bic_only`, NOT `bic_only = 0`: PostgreSQL has no
# implicit integer-to-boolean coercion, so the former compiles to
# `boolean = integer` (no such operator — the upgrade aborts). NOT is valid
# on both engines.
BIC_ONLY_HAS_NO_ACCOUNTS = (
    "NOT bic_only OR (intermediary_account IS NULL AND "
    "beneficiary_account IS NULL AND charge_code IS NULL AND "
    "value_date IS NULL)"
)

# The mirror image, also copied from app/models.py (a test pins the two
# strings together). `bic_only` is used bare — the boolean itself — for the
# same PostgreSQL reason NOT is used above: `bic_only = 1` is
# `boolean = integer`, which has no operator there.
ORDINARY_HAS_SETTLEMENT_TERMS = (
    "bic_only OR (charge_code IS NOT NULL AND charge_code != '' AND "
    "value_date IS NOT NULL AND value_date != '')"
)


def _load_previous_migration():
    """Load 20260816_ssi_verified_by.py by path to reuse its trigger
    statements. This is history, not the live model: the statements are
    constants frozen in the file that created them, so importing them cannot
    change what an old database upgrade does — it only guarantees this
    migration re-installs exactly what that one installed."""
    spec = importlib.util.spec_from_file_location(
        "20260816_ssi_verified_by",
        Path(__file__).resolve().parent / "20260816_ssi_verified_by.py",
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _reinstall_as_of_triggers(bind) -> None:
    """SQLite implements every table change by recreating the table, and
    DROP TABLE destroys the triggers attached to it. The as_of triggers
    installed by 20260816_ssi_verifiedby therefore do not survive this
    migration's batch_alter_table — recreate them, verbatim, afterwards.

    Other dialects (notably PostgreSQL) alter the table in place, so the
    triggers survive this migration and re-running their CREATE TRIGGER
    statements would fail because the triggers already exist. Reinstall
    only where the batch actually destroyed them."""
    if bind.dialect.name != "sqlite":
        return
    previous = _load_previous_migration()
    for statement in previous.SSI_AS_OF_SQLITE:
        op.execute(statement)


def upgrade() -> None:
    # Existing rows are all ordinary SSI: they carry accounts, charge codes
    # and value dates, so server_default false keeps them legal under the
    # CHECK. The literal is the text "false", not the integer 0 — PostgreSQL
    # rejects `DEFAULT 0` on a Boolean column at DDL time.
    if not {
        column["name"] for column in sa.inspect(op.get_bind()).get_columns("ssi")
    }.intersection({"bic_only"}):
        op.add_column(
            "ssi",
            sa.Column("bic_only", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        )
    # Backfill before ck_ssi_ordinary_has_settlement_terms lands: a row
    # written by a non-ORM path (Core insert, raw SQL) could predate the
    # Python-side defaults this column pair used to carry. "SHA"/"spot" are
    # exactly the defaults those rows were written under, so this restores
    # what they carried when written rather than inventing terms — and it
    # keeps ALTER TABLE from aborting on NULLs the new CHECK would reject.
    op.execute(
        "UPDATE ssi SET charge_code = 'SHA' "
        "WHERE NOT bic_only AND (charge_code IS NULL OR charge_code = '')"
    )
    op.execute(
        "UPDATE ssi SET value_date = 'spot' "
        "WHERE NOT bic_only AND (value_date IS NULL OR value_date = '')"
    )
    with op.batch_alter_table("ssi") as batch:
        batch.create_check_constraint("ck_ssi_bic_only_has_no_accounts", BIC_ONLY_HAS_NO_ACCOUNTS)
        batch.create_check_constraint(
            "ck_ssi_ordinary_has_settlement_terms", ORDINARY_HAS_SETTLEMENT_TERMS
        )
    _reinstall_as_of_triggers(op.get_bind())


def downgrade() -> None:
    with op.batch_alter_table("ssi") as batch:
        batch.drop_constraint("ck_ssi_ordinary_has_settlement_terms", type_="check")
        batch.drop_constraint("ck_ssi_bic_only_has_no_accounts", type_="check")
        batch.drop_column("bic_only")
    # The batch above recreated the table on SQLite and destroyed the as_of
    # triggers 20260816_ssi_verifiedby owns; that revision is where this
    # downgrade lands, so its triggers must exist when it ends.
    _reinstall_as_of_triggers(op.get_bind())
