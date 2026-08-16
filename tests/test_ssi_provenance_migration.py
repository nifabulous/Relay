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


def _alembic(db: Path, *args: str) -> subprocess.CompletedProcess:
    return subprocess.run(
        [sys.executable, "-m", "alembic", *args],
        cwd=REPO, capture_output=True, text=True,
        env={"PATH": "/usr/bin:/bin", "DATABASE_URL": f"sqlite:///{db}",
             "HOME": str(Path.home())},
    )


def _seed_at_previous_revision(db: Path, as_of: str) -> None:
    assert _alembic(db, "upgrade", PREVIOUS).returncode == 0
    connection = sqlite3.connect(db)
    connection.execute(
        "INSERT INTO ssi (beneficiary_bic, currency, intermediary_bic, status, notes, as_of) "
        "VALUES ('AAAAGB2LXXX', 'USD', 'CITIUS33XXX', 'archived', 'Source: x', ?)",
        (as_of,),
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
