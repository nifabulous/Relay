"""Pytest fixtures — isolated in-memory SQLite per test session.

Uses a shared in-memory SQLite database (via StaticPool) so tests never
mutate real data. The db_session and client fixtures use SEPARATE in-memory
DBs to prevent cross-test pollution: db_session tests that write data
(importer tests) won't affect HTTP-level tests that assert against seed data.
"""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db import Base
from app.services.seed import seed_if_empty


def _create_test_db():
    """Create a shared in-memory SQLite with tables + seed data."""
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
        future=True,
    )
    Base.metadata.create_all(bind=engine)
    SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)
    with SessionLocal() as session:
        seed_if_empty(session)
    return engine, SessionLocal


# Separate DBs for direct-session tests vs HTTP-client tests.
# This prevents importer tests (which write via db_session) from polluting
# the state that HTTP-level tests (via client) assert against.
_session_engine, _SessionLocal = _create_test_db()
_client_engine, _ClientSessionLocal = _create_test_db()


@pytest.fixture()
def db_session():
    """Session for direct service-level tests. Shares DB with other db_session tests."""
    session = _SessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture()
def db_session_clean():
    """
    A session backed by a FRESH in-memory DB with pristine seed data.
    Use for tests that assert against seed data (counts, specific values).
    Each test gets its own isolated DB — no pollution from other tests.
    """
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
        future=True,
    )
    Base.metadata.create_all(bind=engine)
    CleanSessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)
    session = CleanSessionLocal()
    seed_if_empty(session)
    try:
        yield session
    finally:
        session.close()
        engine.dispose()


def _client_get_db():
    """Dependency override using the client's own isolated DB."""
    session = _ClientSessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture(scope="session")
def client():
    """HTTP client with its own isolated in-memory DB (separate from db_session)."""
    from app.db import get_db
    from app.main import app

    app.dependency_overrides[get_db] = _client_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture()
def isolated_client():
    """HTTP client with a fresh seeded database for controlled-row tests."""
    from app.db import get_db
    from app.main import app

    engine, SessionLocal = _create_test_db()

    def _isolated_get_db():
        session = SessionLocal()
        try:
            yield session
        finally:
            session.close()

    previous_overrides = dict(app.dependency_overrides)
    app.dependency_overrides[get_db] = _isolated_get_db
    try:
        with TestClient(app) as c:
            yield c, SessionLocal
    finally:
        app.dependency_overrides.clear()
        app.dependency_overrides.update(previous_overrides)
        engine.dispose()
