"""Admin authentication dependency.

Gate the admin endpoints (/import/*, /track/create) behind an API key. With ADMIN_API_KEY
unset, local development (SQLite, not on Vercel) stays open for zero-setup use;
a deployed environment answers 503 instead, so losing the key closes the admin
API rather than exposing it.

Usage on an endpoint:
    from .auth import admin_required

    @router.post("/import/fedwire", dependencies=[Depends(admin_required)])
    def import_fedwire(...): ...
"""
import hmac
import os
from typing import Optional

from fastapi import Header, HTTPException

from . import config

# Read once at module load. Tests patch this attribute to simulate
# prod (key set) vs dev (key unset) without touching os.environ timing.
_admin_api_key: Optional[str] = os.getenv("ADMIN_API_KEY")


def _is_local_development() -> bool:
    """Only a local SQLite process off Vercel may run the admin API open."""
    return (
        config.DATABASE_URL.startswith("sqlite")
        and not config.is_multi_instance_deployment()
    )


def admin_required(x_admin_key: Optional[str] = Header(default=None)) -> None:
    """
    FastAPI dependency: require X-Admin-Key header matching ADMIN_API_KEY.

    - Key configured: request must carry X-Admin-Key matching it, else 401.
    - Key not configured, local development: allow all requests.
    - Key not configured anywhere else: 503, the admin API is disabled.
    """
    if not _admin_api_key:
        if _is_local_development():
            # Dev mode — no auth enforced. Documented in README.
            return
        raise HTTPException(
            status_code=503,
            detail="Admin API disabled: ADMIN_API_KEY is not configured.",
        )
    # Compare bytes in constant time; str comparison rejects non-ASCII input.
    presented = (x_admin_key or "").encode("utf-8")
    if not x_admin_key or not hmac.compare_digest(presented, _admin_api_key.encode("utf-8")):
        raise HTTPException(
            status_code=401,
            detail=(
                "Admin key required. Set the X-Admin-Key header to the "
                "value of ADMIN_API_KEY."
            ),
        )
