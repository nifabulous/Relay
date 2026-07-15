"""Configuration — reads DATABASE_URL from env, defaults to local SQLite."""
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

# Postgres in prod, SQLite for zero-setup local dev.
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    f"sqlite:///{BASE_DIR / 'swift_routing.db'}",
)

# SQLite needs this flag for cross-connection thread safety under FastAPI.
SQLALCHEMY_ENGINE_OPTIONS = (
    {"connect_args": {"check_same_thread": False}}
    if DATABASE_URL.startswith("sqlite")
    else {}
)
