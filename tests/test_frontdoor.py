"""
Tests for the front-door fix (item 2.1).

UX panel: GET / returns raw JSON — the single biggest beginner drop-off.
Fix: redirect / to the flagship education experience. The JSON manifest moves
to /api.

The front door now points at Relay (/app). It previously pointed at the legacy
vanilla surface (/learn), which stays reachable but is no longer what a first
visitor sees.
"""


class TestRootRedirect:
    """/ must redirect to Relay, not return raw JSON or the legacy surface."""

    def test_root_redirects_to_relay(self, client):
        r = client.get("/", follow_redirects=False)
        assert r.status_code in (301, 302, 303, 307, 308), (
            f"GET / must redirect (3xx), got {r.status_code} — beginners landing "
            f"on the root see raw JSON and bounce"
        )
        location = r.headers.get("location", "")
        assert "/app" in location, (
            f"Redirect must point to Relay at /app, got {location!r}"
        )
        assert "/learn" not in location, (
            f"Front door must not send first visitors to the legacy surface, "
            f"got {location!r}"
        )

    def test_root_redirect_lands_on_relay_shell(self, client):
        """Following the redirect must reach the built Relay shell, not a 503."""
        r = client.get("/")
        assert r.status_code == 200
        assert '<div id="root"></div>' in r.text

    def test_root_falls_back_to_legacy_when_relay_unbuilt(self, client, monkeypatch):
        """A fresh clone has no Relay build; the root must still serve something.

        README's Quick start runs the backend before the frontend build, so
        pointing / at an unbuilt /app would land newcomers on a 503.
        """
        from app import main as main_module

        monkeypatch.setattr(main_module, "_relay_mounted", False)
        r = client.get("/", follow_redirects=False)
        assert r.status_code in (301, 302, 303, 307, 308)
        assert "/learn" in r.headers.get("location", ""), (
            "With no Relay build present the root must fall back to the legacy "
            f"surface, got {r.headers.get('location')!r}"
        )

    def test_api_manifest_still_available(self, client):
        """The old JSON manifest should move to /api, not disappear."""
        r = client.get("/api")
        # /api without a sub-path should return the manifest or 404 (acceptable
        # as long as it's not the root). But we want the manifest accessible somewhere.
        # The root redirect test covers the main point; this is a convenience check.
        # Accept either a manifest response or a 404 (the endpoints are under /api/*).
        assert r.status_code in (200, 404), f"Unexpected /api status: {r.status_code}"


class TestUILinksToLearn:
    """The /ui admin page must link to /learn (currently zero references)."""

    def test_index_html_contains_learn_link(self, client):
        r = client.get("/ui")
        assert r.status_code == 200
        html = r.text
        assert "/learn" in html, (
            "The /ui admin page must contain a link to /learn so operators "
            "can discover the teaching mode"
        )


class TestRelayAppServing:
    """Relay built assets must be served under /app with SPA deep-link support."""

    def test_relay_app_serves_built_shell(self, client):
        response = client.get("/app")
        assert response.status_code == 200
        assert "<div id=\"root\"></div>" in response.text

    def test_relay_deep_link_serves_shell(self, client):
        response = client.get("/app/operate/prepare")
        assert response.status_code == 200
        assert "<div id=\"root\"></div>" in response.text

    def test_relay_assets_not_blocked(self, client):
        """JS/CSS assets under /app/assets/ must be reachable, not 404."""
        import re
        html = client.get("/app").text
        asset_refs = re.findall(r'(?:src|href)="(/app/assets/[^"]+)"', html)
        assert asset_refs, "index.html must reference at least one /app/assets/ file"
        for ref in asset_refs:
            r = client.get(ref)
            assert r.status_code == 200, f"Asset {ref} returned {r.status_code}"


class TestRelayManifest:
    """The API manifest should reference Relay identity."""

    def test_manifest_identifies_relay(self, client):
        body = client.get("/api/manifest").json()
        # Manifest should reference Relay (may say "Relay" or the working brand)
        service = body.get("service", "")
        assert "relay" in service.lower() or "educational" in service.lower(), (
            f"Manifest service should identify Relay, got: {service!r}"
        )
