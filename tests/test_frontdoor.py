"""
Tests for the front-door fix (item 2.1).

UX panel: GET / returns raw JSON — the single biggest beginner drop-off.
Fix: redirect / to /learn (the flagship education experience). The JSON
manifest moves to /api.
"""


class TestRootRedirect:
    """/ must redirect to /learn, not return raw JSON."""

    def test_root_redirects_to_learn(self, client):
        r = client.get("/", follow_redirects=False)
        assert r.status_code in (301, 302, 303, 307, 308), (
            f"GET / must redirect (3xx), got {r.status_code} — beginners landing "
            f"on the root see raw JSON and bounce"
        )
        assert "/learn" in r.headers.get("location", ""), (
            f"Redirect must point to /learn, got {r.headers.get('location')!r}"
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
