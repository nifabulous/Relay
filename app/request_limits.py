"""Request body size limits, enforced before any handler parses the body.

Many request fields carry no length limit of their own, so the body size is the
backstop that bounds per-request work. The default fits the largest legitimate
JSON body, a legacy telemetry flush of up to 500 stored events. Limits apply by
path prefix; the first matching prefix wins.
"""
from typing import Optional

from starlette.exceptions import HTTPException
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send

DEFAULT_BODY_LIMIT = 128 * 1024
PATH_BODY_LIMITS = (
    # The admin SSI upload is a CSV or JSON file.
    ("/api/import/", 1024 * 1024),
    # The tutor schema allows a 2,000-character question, 8 history turns of
    # 6,000 characters and page context: up to ~216 KB of UTF-8.
    ("/api/tutor/", 256 * 1024),
)


def body_limit_for(path: str) -> int:
    for prefix, limit in PATH_BODY_LIMITS:
        if path.startswith(prefix):
            return limit
    return DEFAULT_BODY_LIMIT


def _detail(limit: int) -> str:
    return f"Request body exceeds the {limit // 1024} KiB limit for this endpoint."


def _declared_length(scope: Scope) -> Optional[int]:
    for name, value in scope.get("headers", ()):
        if name == b"content-length":
            try:
                return int(value)
            except ValueError:
                return None
    return None


class BodySizeLimitMiddleware:
    """Answer 413 for a declared or streamed body over the path's limit."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        limit = body_limit_for(scope["path"])
        declared = _declared_length(scope)
        if declared is not None and declared > limit:
            await JSONResponse({"detail": _detail(limit)}, status_code=413)(scope, receive, send)
            return

        received = 0

        async def limited_receive() -> Message:
            nonlocal received
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > limit:
                    # An HTTPException passes through FastAPI's body parsing,
                    # which turns any other exception into a 400.
                    raise HTTPException(status_code=413, detail=_detail(limit))
            return message

        await self.app(scope, limited_receive, send)
