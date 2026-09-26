"""Admin authentication dependency.

Gate the admin endpoints (/import/*) behind an API key. With ADMIN_API_KEY
unset the admin API answers 503, so a deploy that loses the key is closed
rather than exposed. Local development opens it explicitly with
ADMIN_API_ALLOW_OPEN=1; the environment is never inferred, because platform
signals (the VERCEL variable is opt-in per project) and SQLite paths also
occur on real deploys.

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


def _open_admin_api_allowed() -> bool:
    """Only an explicit, affirmative opt-in runs the admin API without a key."""
    return config._env_flag("ADMIN_API_ALLOW_OPEN")


def admin_required(x_admin_key: Optional[str] = Header(default=None)) -> None:
    """
    FastAPI dependency: require X-Admin-Key header matching ADMIN_API_KEY.

    - Key configured: request must carry X-Admin-Key matching it, else 401.
      ADMIN_API_ALLOW_OPEN never overrides a configured key.
    - Key not configured and ADMIN_API_ALLOW_OPEN=1: allow all requests.
    - Key not configured otherwise: 503, the admin API is disabled.
    """
    if not _admin_api_key:
        if _open_admin_api_allowed():
            # Local dev opt-in — no auth enforced. Documented in README.
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
