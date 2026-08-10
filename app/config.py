"""Configuration — reads DATABASE_URL from env, defaults to local SQLite."""
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

# On Vercel the project filesystem is read-only and /tmp is the only writable
# path, so the default DB lives there. It is recreated and reseeded on each
# cold start, which suits a simulation whose data all comes from seed.py.
# Setting DATABASE_URL explicitly always wins — prefer that, because the VERCEL
# system variable is opt-in per project.
_DEFAULT_SQLITE_PATH = (
    Path("/tmp/swift_routing.db")
    if os.getenv("VERCEL")
    else BASE_DIR / "swift_routing.db"
)

# Postgres in prod, SQLite for zero-setup local dev.
DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{_DEFAULT_SQLITE_PATH}")

# SQLite needs this flag for cross-connection thread safety under FastAPI.
SQLALCHEMY_ENGINE_OPTIONS = (
    {"connect_args": {"check_same_thread": False}}
    if DATABASE_URL.startswith("sqlite")
    else {}
)
