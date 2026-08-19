"""The as_of shape migration against a populated database.

The migration was originally only ever run on a fresh database, where every
row is created by the new schema and nothing can violate the constraint. A
production database is the opposite case: it is full of rows written under the
old rules, which accepted any non-empty as_of.
"""
from __future__ import annotations

import sqlite3
import subprocess
import sys
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[1]
PREVIOUS = "20260816_ssi_pubdate"

import importlib.util  # noqa: E402

_BIC_ONLY_SPEC = importlib.util.spec_from_file_location(
    "20260819_add_ssi_bic_only",
    REPO / "alembic" / "versions" / "20260819_add_ssi_bic_only.py",
)
_BIC_ONLY_MIGRATION = importlib.util.module_from_spec(_BIC_ONLY_SPEC)
_BIC_ONLY_SPEC.loader.exec_module(_BIC_ONLY_MIGRATION)
BIC_ONLY_HAS_NO_ACCOUNTS = _BIC_ONLY_MIGRATION.BIC_ONLY_HAS_NO_ACCOUNTS

_PREVIOUS_SPEC = importlib.util.spec_from_file_location(
    "20260816_ssi_verified_by",
    REPO / "alembic" / "versions" / "20260816_ssi_verified_by.py",
)
_PREVIOUS_MIGRATION = importlib.util.module_from_spec(_PREVIOUS_SPEC)
_PREVIOUS_SPEC.loader.exec_module(_PREVIOUS_MIGRATION)


def _alembic(db: Path, *args: str) -> subprocess.CompletedProcess:
    return subprocess.run(
        [sys.executable, "-m", "alembic", *args],
        cwd=REPO, capture_output=True, text=True,
        env={"PATH": "/usr/bin:/bin", "DATABASE_URL": f"sqlite:///{db}",
             "HOME": str(Path.home())},
    )


def _seed_at_previous_revision(db: Path, as_of: str, status: str = "archived") -> None:
    assert _alembic(db, "upgrade", PREVIOUS).returncode == 0
    connection = sqlite3.connect(db)
    connection.execute(
        "INSERT INTO ssi (beneficiary_bic, currency, intermediary_bic, status, notes, as_of) "
        "VALUES ('AAAAGB2LXXX', 'USD', 'CITIUS33XXX', ?, 'Source: x', ?)",
        (status, as_of),
    )
    connection.commit()
    connection.close()


@pytest.mark.skipif(
    subprocess.run([sys.executable, "-m", "alembic", "--help"],
                   capture_output=True).returncode != 0,
    reason="alembic CLI unavailable",
)
def test_upgrade_refuses_a_database_holding_a_malformed_as_of(tmp_path):
    db = tmp_path / "dirty.db"
    _seed_at_previous_revision(db, "garbage")

    result = _alembic(db, "upgrade", "head")

    assert result.returncode != 0, "the migration accepted a database it cannot constrain"
    assert "not YYYY-MM-DD" in result.stderr, result.stderr

    connection = sqlite3.connect(db)
    tables = [r[0] for r in connection.execute(
        "SELECT name FROM sqlite_master WHERE type='table'")]
    version = list(connection.execute("SELECT version_num FROM alembic_version"))[0][0]
    connection.close()
    # A failure part-way through a SQLite batch rebuild strands _alembic_tmp_ssi,
    # which then blocks every later attempt until someone drops it by hand.
    assert "_alembic_tmp_ssi" not in tables
    assert version == PREVIOUS


@pytest.mark.skipif(
    subprocess.run([sys.executable, "-m", "alembic", "--help"],
                   capture_output=True).returncode != 0,
    reason="alembic CLI unavailable",
)
def test_upgrade_succeeds_once_the_malformed_value_is_cleared(tmp_path):
    db = tmp_path / "repairable.db"
    _seed_at_previous_revision(db, "garbage")
    assert _alembic(db, "upgrade", "head").returncode != 0

    connection = sqlite3.connect(db)
    connection.execute(
        "UPDATE ssi SET as_of = NULL "
        "WHERE NOT (as_of IS NULL OR as_of LIKE '____-__-__')"
    )
    connection.commit()
    connection.close()

    assert _alembic(db, "upgrade", "head").returncode == 0

    connection = sqlite3.connect(db)
    ddl = list(connection.execute(
        "SELECT sql FROM sqlite_master WHERE name='ssi'"))[0][0]
    connection.close()
    assert "ck_ssi_as_of_is_a_past_iso_date" in ddl


@pytest.mark.skipif(
    subprocess.run([sys.executable, "-m", "alembic", "--help"],
                   capture_output=True).returncode != 0,
    reason="alembic CLI unavailable",
)
def test_upgrade_leaves_a_valid_populated_database_alone(tmp_path):
    db = tmp_path / "clean.db"
    _seed_at_previous_revision(db, "2021-10-09")

    assert _alembic(db, "upgrade", "head").returncode == 0

    connection = sqlite3.connect(db)
    preserved = list(connection.execute("SELECT as_of FROM ssi"))[0][0]
    connection.close()
    assert preserved == "2021-10-09"


@pytest.mark.skipif(
    subprocess.run([sys.executable, "-m", "alembic", "--help"],
                   capture_output=True).returncode != 0,
    reason="alembic CLI unavailable",
)
def test_a_malformed_published_row_gets_remediation_that_actually_works(tmp_path):
    """The obvious repair — null the as_of — is a dead end for these rows: the
    earlier constraint requires a published row to carry a date, so the UPDATE
    itself fails and the operator is stuck following the instructions."""
    db = tmp_path / "published.db"
    _seed_at_previous_revision(db, "garbage", status="published")

    result = _alembic(db, "upgrade", "head")
    assert result.returncode != 0
    assert "clearing as_of alone will fail" in result.stderr, result.stderr

    # The plain repair must indeed fail, or the warning would be noise.
    connection = sqlite3.connect(db)
    shape = "NOT (as_of IS NULL OR as_of LIKE '____-__-__')"
    with pytest.raises(sqlite3.IntegrityError):
        connection.execute(f"UPDATE ssi SET as_of = NULL WHERE {shape}")
    connection.rollback()

    # The remediation the migration actually prescribes must work.
    connection.execute(
        f"UPDATE ssi SET status = 'unverified', as_of = NULL "
        f"WHERE {shape} AND status = 'published'"
    )
    connection.commit()
    connection.close()

    assert _alembic(db, "upgrade", "head").returncode == 0


AS_OF_SHAPE = "20260816_ssi_asofshape"


def _seed_published_at_prov_without_a_date(db: Path) -> None:
    """A row the prov schema accepted: status='published' with no as_of at
    all (as_of was nullable and nothing required it). The pubdate migration's
    constraint would fail on this row, so its preflight must catch it first."""
    assert _alembic(db, "upgrade", "20260816_ssi_prov").returncode == 0
    connection = sqlite3.connect(db)
    connection.execute(
        "INSERT INTO ssi (beneficiary_bic, currency, intermediary_bic, status, notes, as_of) "
        "VALUES ('AAAAGB2LXXX', 'USD', 'CITIUS33XXX', 'published', 'Source: x', NULL)"
    )
    connection.commit()
    connection.close()


@pytest.mark.skipif(
    subprocess.run([sys.executable, "-m", "alembic", "--help"],
                   capture_output=True).returncode != 0,
    reason="alembic CLI unavailable",
)
def test_pubdate_preflight_refuses_a_published_row_without_a_date(tmp_path):
    db = tmp_path / "undated.db"
    _seed_published_at_prov_without_a_date(db)

    result = _alembic(db, "upgrade", "head")

    assert result.returncode != 0, "the migration accepted a row it cannot constrain"
    assert "without a verification date" in result.stderr, result.stderr[-400:]

    connection = sqlite3.connect(db)
    tables = [r[0] for r in connection.execute(
        "SELECT name FROM sqlite_master WHERE type='table'")]
    version = list(connection.execute("SELECT version_num FROM alembic_version"))[0][0]
    connection.close()
    assert "_alembic_tmp_ssi" not in tables, (
        "an aborted batch rebuild stranded its temp table, which blocks every retry"
    )
    assert version == "20260816_ssi_prov", "the preflight changed the schema before deciding the data fits"


@pytest.mark.skipif(
    subprocess.run([sys.executable, "-m", "alembic", "--help"],
                   capture_output=True).returncode != 0,
    reason="alembic CLI unavailable",
)
def test_pubdate_preflight_repair_completes_the_upgrade(tmp_path):
    """The remediation the preflight prescribes — downgrade to unverified —
    must be valid against the pre-migration schema and actually unblock the
    deploy, exactly as printed."""
    db = tmp_path / "undated-repaired.db"
    _seed_published_at_prov_without_a_date(db)
    assert _alembic(db, "upgrade", "head").returncode != 0

    connection = sqlite3.connect(db)
    connection.execute(
        "UPDATE ssi SET status = 'unverified' "
        "WHERE status = 'published' AND (as_of IS NULL OR as_of = '')"
    )
    connection.commit()
    connection.close()

    result = _alembic(db, "upgrade", "head")
    assert result.returncode == 0, result.stderr[-400:]

    connection = sqlite3.connect(db)
    ddl = list(connection.execute(
        "SELECT sql FROM sqlite_master WHERE name='ssi'"))[0][0]
    connection.close()
    assert "ck_ssi_published_has_verification_date" in ddl


def _seed_published_without_a_verifier(db: Path) -> None:
    """A row the previous schema allowed: published, dated, unattributed."""
    assert _alembic(db, "upgrade", AS_OF_SHAPE).returncode == 0
    connection = sqlite3.connect(db)
    connection.execute(
        "INSERT INTO ssi (beneficiary_bic, currency, intermediary_bic, status, notes, as_of) "
        "VALUES ('AAAAGB2LXXX', 'USD', 'CITIUS33XXX', 'published', 'Source: x', '2020-01-01')"
    )
    connection.commit()
    connection.close()


@pytest.mark.skipif(
    subprocess.run([sys.executable, "-m", "alembic", "--help"],
                   capture_output=True).returncode != 0,
    reason="alembic CLI unavailable",
)
def test_upgrade_refuses_a_published_row_with_no_verifier(tmp_path):
    db = tmp_path / "unattributed.db"
    _seed_published_without_a_verifier(db)

    result = _alembic(db, "upgrade", "head")

    assert result.returncode != 0, "the migration accepted a row it cannot constrain"
    assert "named verifier" in result.stderr, result.stderr[-400:]

    connection = sqlite3.connect(db)
    tables = [r[0] for r in connection.execute(
        "SELECT name FROM sqlite_master WHERE type='table'")]
    connection.close()
    assert "_alembic_tmp_ssi" not in tables, (
        "an aborted batch rebuild stranded its temp table, which blocks every retry"
    )


@pytest.mark.skipif(
    subprocess.run([sys.executable, "-m", "alembic", "--help"],
                   capture_output=True).returncode != 0,
    reason="alembic CLI unavailable",
)
def test_the_prescribed_repair_completes_the_upgrade(tmp_path):
    """The remediation is executed here, not just read. Earlier versions named a
    column that did not exist yet, died on a duplicate column when retried, and
    then named verified_by — which works on SQLite, where the column survives
    the abort, but not on PostgreSQL, where transactional DDL rolls it back.
    The repair below is deliberately valid against the pre-migration schema."""
    repair, expected = "UPDATE ssi SET status = 'unverified'", ("unverified", None)
    db = tmp_path / "repaired.db"
    _seed_published_without_a_verifier(db)
    assert _alembic(db, "upgrade", "head").returncode != 0

    connection = sqlite3.connect(db)
    connection.execute(repair)
    connection.commit()
    connection.close()

    result = _alembic(db, "upgrade", "head")
    assert result.returncode == 0, result.stderr[-400:]

    connection = sqlite3.connect(db)
    row = list(connection.execute("SELECT status, verified_by FROM ssi"))[0]
    ddl = list(connection.execute("SELECT sql FROM sqlite_master WHERE name='ssi'"))[0][0]
    connection.close()
    assert row == expected
    assert "ck_ssi_published_names_a_verifier" in ddl
    assert "ck_ssi_verifier_is_only_for_published" in ddl


def _seed_published_with_a_stale_date(db: Path) -> None:
    """A shape-valid but future as_of on a published row. The asofshape
    constraint accepts it (LIKE only checks shape); the verified_by migration's
    stale-date preflight must catch it before installing the triggers, which
    would make the row impossible to update."""
    assert _alembic(db, "upgrade", AS_OF_SHAPE).returncode == 0
    connection = sqlite3.connect(db)
    connection.execute(
        "INSERT INTO ssi (beneficiary_bic, currency, intermediary_bic, status, notes, as_of) "
        "VALUES ('AAAAGB2LXXX', 'USD', 'CITIUS33XXX', 'published', 'Source: x', '2999-01-01')"
    )
    connection.commit()
    connection.close()


@pytest.mark.skipif(
    subprocess.run([sys.executable, "-m", "alembic", "--help"],
                   capture_output=True).returncode != 0,
    reason="alembic CLI unavailable",
)
def test_a_stale_published_row_is_reported_before_the_triggers_land(tmp_path):
    db = tmp_path / "stale.db"
    _seed_published_with_a_stale_date(db)

    result = _alembic(db, "upgrade", "head")

    assert result.returncode != 0, "the migration installed triggers over a stale date"
    assert "not a real past date" in result.stderr, result.stderr[-400:]
    # The remediation must be executable against the schema the operator still
    # has. Naming verified_by in the repair is exactly the dead end this
    # migration's own later preflight exists to avoid — the column does not
    # exist yet. (The migration's filename itself contains the string, so
    # assert on the repair text, not the word.)
    assert "verified_by = NULL" not in result.stderr, (
        "the stale-date repair names a column the pre-migration schema does not have"
    )

    connection = sqlite3.connect(db)
    tables = [r[0] for r in connection.execute(
        "SELECT name FROM sqlite_master WHERE type='table'")]
    connection.close()
    assert "_alembic_tmp_ssi" not in tables


@pytest.mark.skipif(
    subprocess.run([sys.executable, "-m", "alembic", "--help"],
                   capture_output=True).returncode != 0,
    reason="alembic CLI unavailable",
)
def test_the_stale_date_repair_actually_completes_the_upgrade(tmp_path):
    db = tmp_path / "stale-repaired.db"
    _seed_published_with_a_stale_date(db)
    assert _alembic(db, "upgrade", "head").returncode != 0

    # The repair the message prints: downgrade the published row, null the
    # date. Deliberately no verified_by — it does not exist on this schema.
    connection = sqlite3.connect(db)
    connection.execute(
        "UPDATE ssi SET status = 'unverified', as_of = NULL "
        "WHERE id IN (SELECT id FROM ssi WHERE status = 'published')"
    )
    connection.commit()
    connection.close()

    result = _alembic(db, "upgrade", "head")
    assert result.returncode == 0, result.stderr[-400:]

    connection = sqlite3.connect(db)
    triggers = [r[0] for r in connection.execute(
        "SELECT name FROM sqlite_master WHERE type='trigger'")]
    connection.close()
    assert "ssi_as_of_insert" in triggers
    assert "ssi_as_of_update" in triggers


@pytest.mark.skipif(
    subprocess.run([sys.executable, "-m", "alembic", "--help"],
                   capture_output=True).returncode != 0,
    reason="alembic CLI unavailable",
)
def test_the_abort_changes_no_schema(tmp_path):
    """PostgreSQL rolls back DDL in a failed migration and SQLite does not, so
    the only remediation that works on both is one needing no new column. The
    migration must therefore not have added one before it aborts."""
    db = tmp_path / "untouched.db"
    _seed_published_without_a_verifier(db)

    assert _alembic(db, "upgrade", "head").returncode != 0

    connection = sqlite3.connect(db)
    columns = [row[1] for row in connection.execute("PRAGMA table_info(ssi)")]
    connection.close()
    assert "verified_by" not in columns, (
        "the migration changed the schema before deciding the data fits"
    )


# ===========================================================================
# bic_only — rows that assert correspondent availability, not instructions
# ===========================================================================


class TestBicOnlyMigration:
    PREVIOUS = "20260816_ssi_verifiedby"

    def test_upgrade_adds_column_and_constraint(self, tmp_path):
        db = tmp_path / "bic_only.db"
        assert _alembic(db, "upgrade", "head").returncode == 0

        connection = sqlite3.connect(db)
        columns = {row[1] for row in connection.execute("PRAGMA table_info(ssi)")}
        assert "bic_only" in columns

        connection.execute(
            "INSERT INTO ssi (beneficiary_bic, currency, intermediary_bic, status, notes, "
            "bic_only, intermediary_account, beneficiary_account, charge_code, value_date) "
            "VALUES ('EBILAEADXXX', 'USD', 'EBILAEADXXX', 'unverified', 'Source: x', 1, "
            "NULL, NULL, NULL, NULL)"
        )
        connection.commit()
        connection.close()

    def test_bic_only_row_with_accounts_is_rejected(self, tmp_path):
        db = tmp_path / "bic_only_bad.db"
        assert _alembic(db, "upgrade", "head").returncode == 0

        connection = sqlite3.connect(db)
        with pytest.raises(sqlite3.IntegrityError):
            connection.execute(
                "INSERT INTO ssi (beneficiary_bic, currency, intermediary_bic, status, notes, "
                "bic_only, intermediary_account) "
                "VALUES ('EBILAEADXXX', 'USD', 'EBILAEADXXX', 'unverified', 'Source: x', 1, "
                "'ACCT-91000701')"
            )
        connection.close()

    def test_downgrade_removes_column_and_constraint(self, tmp_path):
        db = tmp_path / "bic_only_down.db"
        assert _alembic(db, "upgrade", "head").returncode == 0
        assert _alembic(db, "downgrade", self.PREVIOUS).returncode == 0

        connection = sqlite3.connect(db)
        columns = {row[1] for row in connection.execute("PRAGMA table_info(ssi)")}
        assert "bic_only" not in columns
        # The batch recreate on the way down destroys the as_of triggers
        # 20260816_ssi_verifiedby owns; that revision's state must exist
        # when the downgrade ends.
        triggers = [r[0] for r in connection.execute(
            "SELECT name FROM sqlite_master WHERE type='trigger'")]
        assert "ssi_as_of_insert" in triggers
        assert "ssi_as_of_update" in triggers
        connection.close()

    def test_model_and_migration_constraints_do_not_drift(self):
        from app.models import SSI

        model_sql = {
            str(c.sqltext)
            for c in SSI.__table__.constraints
            if c.name == "ck_ssi_bic_only_has_no_accounts"
        }
        assert model_sql == {BIC_ONLY_HAS_NO_ACCOUNTS}

    def test_batch_recreate_reinstalls_the_previous_triggers(self):
        """SQLite batch_alter_table recreates the table and DROP TABLE
        destroys its triggers, so this migration must reinstall the as_of
        triggers 20260816_ssi_verifiedby created — verbatim, not a drift of
        them."""
        assert (
            _BIC_ONLY_MIGRATION._load_previous_migration().SSI_AS_OF_SQLITE
            == _PREVIOUS_MIGRATION.SSI_AS_OF_SQLITE
        )
        assert (
            _BIC_ONLY_MIGRATION._load_previous_migration().SSI_AS_OF_POSTGRES
            == _PREVIOUS_MIGRATION.SSI_AS_OF_POSTGRES
        )
