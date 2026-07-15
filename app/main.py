"""FastAPI application entrypoint."""
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .db import Base, engine, SessionLocal
from .routers import lookup as lookup_router
from .services.seed import seed_if_empty

STATIC_DIR = Path(__file__).resolve().parent / "static"


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create tables + seed on startup (fine for SQLite/dev; use Alembic in prod).
    Base.metadata.create_all(bind=engine)
    try:
        with SessionLocal() as session:
            inserted = seed_if_empty(session)
            if inserted["banks"] or inserted["corridor_rules"]:
                app.state.seeded = inserted
    except Exception as e:
        import sys
        print(f"WARNING: Seed data failed to load (non-fatal): {e}", file=sys.stderr)
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

app.include_router(lookup_router.router)

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
