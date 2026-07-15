"""FastAPI application entrypoint."""
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

logger = logging.getLogger(__name__)

from .db import Base, SessionLocal, engine
from .routers import (
    analytics as analytics_router,
)
from .routers import (
    directory as directory_router,
)
from .routers import (
    imports as imports_router,
)
from .routers import (
    prepare as prepare_router,
)
from .routers import (
    progress as progress_router,
)
from .routers import (
    routing as routing_router,
)
from .routers import (
    schemes as schemes_router,
)
from .routers import (
    ssi as ssi_router,
)
from .routers import (
    tracking as tracking_router,
)
from .routers import (
    vop as vop_router,
)
from .services.seed import seed_if_empty

STATIC_DIR = Path(__file__).resolve().parent / "static"


@asynccontextmanager
async def lifespan(app: FastAPI):
    # In dev (SQLite default), auto-create tables for zero-setup.
    # In prod (DATABASE_URL set), use Alembic migrations (`alembic upgrade head`).
    from .config import DATABASE_URL
    is_dev = DATABASE_URL.startswith("sqlite")
    if is_dev:
        Base.metadata.create_all(bind=engine)
    app.state.seed_failed = False
    try:
        with SessionLocal() as session:
            inserted = seed_if_empty(session)
            if inserted["banks"] or inserted["corridor_rules"]:
                app.state.seeded = inserted
                logger.info("Seed data loaded: %s", inserted)
    except Exception as e:
        app.state.seed_failed = True
        logger.error("Seed data failed to load: %s", e, exc_info=True)
    yield


app = FastAPI(
    title="SWIFT Routing Lab — Educational Sandbox (SIMULATION, not for real payments)",
    description=(
        "Educational sandbox: validate IBAN/BIC, look up banks, and get "
        "heuristic intermediary bank suggestions for cross-border payments. "
        "⚠ SIMULATION — do not use for real payments. All data is illustrative; "
        "account numbers are placeholders; tracking is simulated."
    ),
    version="0.1.0",
    lifespan=lifespan,
)

app.include_router(directory_router.router)
app.include_router(routing_router.router)
app.include_router(imports_router.router)
app.include_router(ssi_router.router)
app.include_router(vop_router.router)
app.include_router(tracking_router.router)
app.include_router(schemes_router.router)
app.include_router(prepare_router.router)
app.include_router(analytics_router.router)
app.include_router(progress_router.router)

# Serve admin UI static assets (CSS/JS)
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


@app.get("/ui")
@app.get("/ui/{rest:path}")
def admin_ui(rest: str = ""):
    """Serve the admin SPA. All routes return the same index.html."""
    return FileResponse(str(STATIC_DIR / "index.html"))


@app.get("/learn")
@app.get("/learn/{rest:path}")
def learn_ui(rest: str = ""):
    """Serve the interactive learning labs."""
    return FileResponse(str(STATIC_DIR / "learn.html"))


@app.get("/")
def root():
    return {
        "service": "SWIFT Intermediary Routing API",
        "docs": "/docs",
        "ui": "/ui",
        "learn": "/learn",
        "endpoints": [
            "/api/health", "/api/validate", "/api/lookup", "/api/route",
            "/api/us-bank", "/api/ssi", "/api/verify-payee",
            "/api/prepare-payment", "/api/track/create", "/api/track/{uetr}",
            "/api/schemes", "/api/fees/simulate", "/api/screen",
            "/api/value-date", "/api/message/stp-check",
            "/api/import/fedwire", "/api/import/fedach",
            "/api/import/ssi", "/api/progress",
        ],
    }
