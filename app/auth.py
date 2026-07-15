"""Admin authentication dependency.

Gate mutating endpoints (/import/*, /track/create) behind an API key
when ADMIN_API_KEY is set. In dev mode (key unset), endpoints are open
for zero-setup local development.

Usage on an endpoint:
    from .auth import admin_required

    @router.post("/import/fedwire", dependencies=[Depends(admin_required)])
    def import_fedwire(...): ...
"""
import os
from typing import Optional

from fastapi import Header, HTTPException

# Read once at module load. Tests patch this attribute to simulate
# prod (key set) vs dev (key unset) without touching os.environ timing.
_admin_api_key: Optional[str] = os.getenv("ADMIN_API_KEY")


def admin_required(x_admin_key: Optional[str] = Header(default=None)) -> None:
    """
    FastAPI dependency: require X-Admin-Key header when ADMIN_API_KEY is set.

    - Key configured: request must carry X-Admin-Key matching it, else 401.
    - Key not configured (dev mode): allow all requests (no auth needed).
    """
    if not _admin_api_key:
        # Dev mode — no auth enforced. Documented in README.
        return
    if x_admin_key != _admin_api_key:
        raise HTTPException(
            status_code=401,
            detail=(
                "Admin key required. Set the X-Admin-Key header to the "
                "value of ADMIN_API_KEY."
            ),
        )
