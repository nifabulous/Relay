"""The public landing page, served at / when RELAY_LANDING_ENABLED is on.

The landing build lives in app/landing_dist/, outside app/static, so the
/static mount can never expose it. With the flag off nothing here touches the
filesystem: mount_landing() reads the flag and returns.
"""
from pathlib import Path
from typing import Optional

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from starlette.responses import Response
from starlette.types import Scope

from .config import _env_flag

LANDING_FLAG = "RELAY_LANDING_ENABLED"
LANDING_DIST = Path(__file__).resolve().parent / "landing_dist"
LANDING_HTML_NAME = "landing.html"
IMMUTABLE_CACHE = "public, max-age=31536000, immutable"


class _ImmutableStaticFiles(StaticFiles):
    """Hashed build assets never change under the same name."""

    async def get_response(self, path: str, scope: Scope) -> Response:
        response = await super().get_response(path, scope)
        if response.status_code == 200:
            response.headers["Cache-Control"] = IMMUTABLE_CACHE
        return response


def mount_landing(app: FastAPI, dist: Path = LANDING_DIST) -> Optional[Path]:
    """Mount /landing/assets and return the landing HTML path, or None.

    None means "serve today's redirect": the flag is off, or the build is
    incomplete. The flag is read once, when the app module is imported, so a
    change takes effect on the next deploy or process start.
    """
    if not _env_flag(LANDING_FLAG):
        return None
    html = dist / LANDING_HTML_NAME
    assets = dist / "assets"
    if not (html.is_file() and assets.is_dir()):
        return None
    app.mount(
        "/landing/assets",
        _ImmutableStaticFiles(directory=str(assets)),
        name="landing-assets",
    )
    return html


def landing_response(html: Path) -> FileResponse:
    """The landing document itself is revalidated on every load."""
    return FileResponse(
        str(html),
        media_type="text/html; charset=utf-8",
        headers={"Cache-Control": "no-cache"},
    )
