"""The landing page at / is gated by RELAY_LANDING_ENABLED.

Flag off must mean today's behaviour exactly: / redirects as it always has, and
nothing under app/landing_dist is mounted, read or served. These tests pin both
directions of the flag and the cache headers the landing build relies on.
"""
import json
import os
import subprocess
import sys
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app import landing

REPO_ROOT = Path(__file__).resolve().parents[1]


def _write_dist(dist: Path) -> Path:
    (dist / "assets").mkdir(parents=True)
    html = dist / "landing.html"
    html.write_text("<!doctype html><title>Relay</title><main>landing</main>", encoding="utf-8")
    (dist / "assets" / "landing-abc123.js").write_text("console.log(1)", encoding="utf-8")
    return html


@pytest.mark.parametrize("value", [None, "", "0", "false", "off", "no", "ture", "enabled"])
def test_flag_off_mounts_nothing_and_reads_no_file(tmp_path, monkeypatch, value):
    if value is None:
        monkeypatch.delenv(landing.LANDING_FLAG, raising=False)
    else:
        monkeypatch.setenv(landing.LANDING_FLAG, value)
    _write_dist(tmp_path)

    def _no_filesystem(*_args, **_kwargs):
        raise AssertionError("flag off must not touch the landing build")

    monkeypatch.setattr(Path, "is_file", _no_filesystem)
    monkeypatch.setattr(Path, "is_dir", _no_filesystem)
    app = FastAPI()
    assert landing.mount_landing(app, tmp_path) is None
    assert all(getattr(route, "name", None) != "landing-assets" for route in app.routes)


@pytest.mark.parametrize("value", ["1", "true", "TRUE", " yes ", "on"])
def test_flag_on_with_build_serves_hashed_assets_immutably(tmp_path, monkeypatch, value):
    monkeypatch.setenv(landing.LANDING_FLAG, value)
    html = _write_dist(tmp_path)
    app = FastAPI()
    assert landing.mount_landing(app, tmp_path) == html

    response = TestClient(app).get("/landing/assets/landing-abc123.js")
    assert response.status_code == 200
    assert response.headers["cache-control"] == "public, max-age=31536000, immutable"


def test_missing_asset_is_not_marked_immutable(tmp_path, monkeypatch):
    monkeypatch.setenv(landing.LANDING_FLAG, "1")
    _write_dist(tmp_path)
    app = FastAPI()
    landing.mount_landing(app, tmp_path)

    response = TestClient(app).get("/landing/assets/missing.js")
    assert response.status_code == 404
    assert "immutable" not in response.headers.get("cache-control", "")


@pytest.mark.parametrize("missing", ["landing.html", "assets"])
def test_flag_on_without_complete_build_mounts_nothing(tmp_path, monkeypatch, missing):
    monkeypatch.setenv(landing.LANDING_FLAG, "1")
    _write_dist(tmp_path)
    target = tmp_path / missing
    if target.is_dir():
        for child in target.iterdir():
            child.unlink()
        target.rmdir()
    else:
        target.unlink()
    app = FastAPI()
    assert landing.mount_landing(app, tmp_path) is None
    assert all(getattr(route, "name", None) != "landing-assets" for route in app.routes)


def test_root_serves_landing_html_uncached_when_mounted(client, tmp_path, monkeypatch):
    from app import main as main_module

    html = _write_dist(tmp_path)
    monkeypatch.setattr(main_module, "LANDING_HTML", html)
    response = client.get("/", follow_redirects=False)
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/html")
    assert response.headers["cache-control"] == "no-cache"
    assert "<main>landing</main>" in response.text
    # The landing page keeps the app-wide security headers.
    assert response.headers["x-frame-options"] == "DENY"
    assert response.headers["content-security-policy"] == "frame-ancestors 'none'"


def test_root_falls_back_to_redirect_when_landing_file_vanishes(client, tmp_path, monkeypatch):
    from app import main as main_module

    html = _write_dist(tmp_path)
    html.unlink()
    monkeypatch.setattr(main_module, "LANDING_HTML", html)
    response = client.get("/", follow_redirects=False)
    assert response.status_code == 302
    assert response.headers["location"] in ("/app", "/learn")


def test_root_redirect_is_unchanged_when_landing_not_mounted(client, monkeypatch):
    from app import main as main_module

    monkeypatch.setattr(main_module, "LANDING_HTML", None)
    response = client.get("/", follow_redirects=False)
    assert response.status_code == 302
    expected = "/app" if main_module._relay_mounted and main_module.RELAY_INDEX.exists() else "/learn"
    assert response.headers["location"] == expected


PROBE = """
import json
from app import main
print(json.dumps({
    "landing_html": None if main.LANDING_HTML is None else str(main.LANDING_HTML),
    "routes": sorted(getattr(r, "name", "") or "" for r in main.app.routes),
}))
"""


@pytest.mark.parametrize("value", [None, "false", "ture"])
def test_importing_the_app_with_flag_off_registers_no_landing_route(value):
    env = os.environ.copy()
    env.pop(landing.LANDING_FLAG, None)
    if value is not None:
        env[landing.LANDING_FLAG] = value
    result = subprocess.run(
        [sys.executable, "-c", PROBE],
        cwd=REPO_ROOT,
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, result.stderr
    probe = __import__("json").loads(result.stdout.strip().splitlines()[-1])
    assert probe["landing_html"] is None
    assert "landing-assets" not in probe["routes"]


def test_landing_dist_is_outside_the_public_static_mount():
    assert landing.LANDING_DIST == REPO_ROOT / "app" / "landing_dist"
    static_dir = REPO_ROOT / "app" / "static"
    assert static_dir not in landing.LANDING_DIST.parents


FLAG_ON_PROBE = """
import json
from fastapi.testclient import TestClient
from app import main
response = TestClient(main.app).get("/", follow_redirects=False)
print(json.dumps({
    "status": response.status_code,
    "cache": response.headers.get("cache-control"),
    "landing": main.LANDING_HTML is not None,
}))
"""


def test_importing_the_app_with_flag_on_serves_the_landing_page():
    if not (landing.LANDING_DIST / "landing.html").is_file():
        pytest.skip("landing build absent: run npm run build:landing")
    env = os.environ.copy()
    env[landing.LANDING_FLAG] = "1"
    result = subprocess.run(
        [sys.executable, "-c", FLAG_ON_PROBE],
        cwd=REPO_ROOT,
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, result.stderr
    probe = json.loads(result.stdout.strip().splitlines()[-1])
    assert probe == {"status": 200, "cache": "no-cache", "landing": True}
