"""FastAPI application entrypoint."""
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, RedirectResponse
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
    telemetry as telemetry_router,
)
from .routers import (
    tracking as tracking_router,
)
from .routers import (
    tutor as tutor_router,
)
from .routers import (
    vop as vop_router,
)
from .services.schema_compat import ensure_sqlite_schema
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
        # Bring an existing dev SQLite file up to the current model without
        # deleting it. New DBs are covered by create_all above.
        ensure_sqlite_schema(engine)
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
    title="Corridor Labs — Educational Sandbox (SIMULATION, not for real payments)",
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
app.include_router(telemetry_router.router)
# Registered after the existing learner-facing routes: the tutor is an
# explanation layer over them, and nothing above depends on it.
app.include_router(tutor_router.router)

# Serve admin UI static assets (CSS/JS)
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

# Relay (React) built assets — served from app/static/relay/
RELAY_DIR = STATIC_DIR / "relay"
RELAY_INDEX = RELAY_DIR / "index.html"
_relay_mounted = False
if RELAY_DIR.is_dir():
    app.mount("/app/assets", StaticFiles(directory=str(RELAY_DIR / "assets")), name="relay-assets")
    _relay_mounted = True


@app.get("/app")
@app.get("/app/{rest:path}")
def relay_app(rest: str = ""):
    """Serve the Relay SPA. Deep links return index.html (client-side routing).

    When the build directory is absent, return a 503 telling developers
    to run the frontend build.
    """
    if not _relay_mounted or not RELAY_INDEX.exists():
        raise HTTPException(
            status_code=503,
            detail=(
                "Relay build not found. Run: cd frontend && npm run build"
            ),
        )
    return FileResponse(str(RELAY_INDEX))


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
    """Redirect to Relay — the flagship experience.

    The legacy vanilla surface stays reachable at /learn and /ui, but first
    visitors land on Relay rather than the surface it replaces.

    When the Relay build is absent — a fresh clone that has not run
    `cd frontend && npm run build` yet — fall back to /learn so the root
    serves a working page instead of the 503 that /app would raise.
    """
    target = "/app" if _relay_mounted and RELAY_INDEX.exists() else "/learn"
    return RedirectResponse(url=target, status_code=302)


@app.get("/api/manifest")
def api_manifest():
    """Machine-readable endpoint manifest (moved from / so root can redirect)."""
    return {
        "service": "SWIFT Routing Lab — Educational Sandbox (SIMULATION)",
        "docs": "/docs",
        "ui": "/ui",
        "learn": "/learn",
        "endpoints": [
            "/api/health", "/api/validate", "/api/lookup", "/api/route",
            "/api/us-bank", "/api/ssi", "/api/verify-payee",
            "/api/prepare-payment", "/api/track/create", "/api/track/{uetr}",
            "/api/track/{uetr}/skip", "/api/track/{uetr}/complete",
            "/api/schemes", "/api/schemes/international", "/api/fees/simulate", "/api/screen",
            "/api/value-date", "/api/message/stp-check",
            "/api/import/fedwire", "/api/import/fedach",
            "/api/import/ssi", "/api/progress",
            "/api/tutor/availability", "/api/tutor/chat",
        ],
    }
