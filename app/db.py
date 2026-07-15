"""Database engine + session factory."""
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

from .config import DATABASE_URL, SQLALCHEMY_ENGINE_OPTIONS

engine = create_engine(DATABASE_URL, **SQLALCHEMY_ENGINE_OPTIONS, future=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)
Base = declarative_base()


def get_db():
    """FastAPI dependency that yields a per-request session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
