"""Baseline browser security headers on every response the app returns.

Not covered: the plain-text 500 for an unhandled exception. Starlette's
ServerErrorMiddleware always wraps user middleware and sends that response
itself; making it carry these headers would need a catch-all exception
handler, which changes how errors reach Sentry.

Nothing embeds Relay in a frame and no page uses camera, microphone,
geolocation or payment APIs, so the strict values break nothing. HSTS is left
to the platform (Vercel sends it on its domains). A full Content-Security-Policy
is a separate change: the legacy /ui still uses inline event handlers, so the
policy here only forbids framing.
"""
from starlette.datastructures import MutableHeaders
from starlette.types import ASGIApp, Message, Receive, Scope, Send

SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Content-Security-Policy": "frame-ancestors 'none'",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
}


class SecurityHeadersMiddleware:
    """Add SECURITY_HEADERS to each HTTP response that does not set its own."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        async def send_with_headers(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = MutableHeaders(scope=message)
                for name, value in SECURITY_HEADERS.items():
                    headers.setdefault(name, value)
            await send(message)

        await self.app(scope, receive, send_with_headers)
