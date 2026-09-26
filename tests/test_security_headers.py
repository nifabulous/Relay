"""Every response the app returns carries the baseline security headers.

(An unhandled exception's plain-text 500 is sent by Starlette's
ServerErrorMiddleware, outside user middleware, and is not covered.)

Production sent only content-type and content-length (Vercel adds HSTS on its
own domains). Nothing embeds Relay in a frame and no page uses camera,
microphone, geolocation or payment APIs, so the strict values break nothing.
A full Content-Security-Policy is a separate change: the legacy /ui still
uses inline event handlers.
"""
import pytest

EXPECTED = {
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "content-security-policy": "frame-ancestors 'none'",
    "referrer-policy": "strict-origin-when-cross-origin",
    "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=()",
}


@pytest.mark.parametrize(
    "method, path, kwargs",
    [
        ("get", "/api/health", {}),
        ("get", "/learn", {}),
        ("get", "/static/css/app.css", {}),
        ("get", "/api/does-not-exist", {}),
        ("post", "/api/screen", {"json": {}}),
        (
            "post",
            "/api/screen",
            {"content": b"x" * (128 * 1024 + 1), "headers": {"content-type": "application/json"}},
        ),
    ],
    ids=["api", "legacy-page", "static-asset", "404", "422", "413"],
)
def test_the_response_carries_the_security_headers(client, method, path, kwargs):
    response = getattr(client, method)(path, **kwargs)
    missing = {
        name: value
        for name, value in EXPECTED.items()
        if response.headers.get(name) != value
    }
    assert not missing, f"{response.status_code} {path}: wrong or missing {missing}"
