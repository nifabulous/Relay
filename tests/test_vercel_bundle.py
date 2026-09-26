"""The deployed Vercel function must be able to import and start the app.

vercel.json strips whole directories (scripts/, tests/, docs/, ...) from the
function bundle. CI runs from the full checkout, so a runtime read from an
excluded path stays green here and fails every cold start in production with
FUNCTION_INVOCATION_FAILED. This test rebuilds the bundle's file set from the
tracked files minus ``excludeFiles`` and boots the app from that copy alone.
"""
import fnmatch
import glob
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]

# Checks raise SystemExit rather than assert: the child inherits the caller's
# environment, and PYTHONOPTIMIZE would strip asserts and pass vacuously.
_STARTUP_PROBE = """
import sys
from pathlib import Path

import app


def fail(message):
    raise SystemExit(message)


bundle = Path(sys.argv[1]).resolve()
loaded_from = Path(app.__file__).resolve()
if not loaded_from.is_relative_to(bundle):
    fail(f"imported app from {loaded_from}, not the bundle")

from fastapi.testclient import TestClient

from app.main import app as asgi_app

# /app serves the frontend build, which is generated at deploy time and is not
# a tracked file, so its 503 here says nothing about the function bundle.
NEEDS_FRONTEND_BUILD = {"/app"}

with TestClient(asgi_app) as client:
    if asgi_app.state.seed_failed is not False:
        fail("seed failed during startup")
    health = client.get("/api/health")
    if health.status_code != 200:
        fail(f"/api/health returned {health.status_code}: {health.text}")
    body = health.json()
    if body["status"] != "ok" or body["ssi_records"] <= 0:
        fail(f"/api/health is not healthy: {body}")
    # Request-time reads count too: every GET operation without path
    # parameters must answer without a server error from the bundle alone.
    # The OpenAPI schema lists routes inside included routers, which
    # app.routes does not expose directly.
    swept = []
    for path, operations in asgi_app.openapi()["paths"].items():
        if "get" not in operations or "{" in path or path in NEEDS_FRONTEND_BUILD:
            continue
        response = client.get(path)
        if response.status_code >= 500:
            fail(f"GET {path} returned {response.status_code}: {response.text[:500]}")
        swept.append(path)
    if "/api/health" not in swept or len(swept) < 10:
        fail(f"request sweep reached too few routes: {swept}")
"""

_DATABASE_DEFAULT_PROBE = """
from app.config import DATABASE_URL

if DATABASE_URL != "sqlite:////tmp/swift_routing.db":
    raise SystemExit(f"unexpected default DATABASE_URL on Vercel: {DATABASE_URL}")
"""


def _exclude_globs() -> list[str]:
    config = json.loads((ROOT / "vercel.json").read_text(encoding="utf-8"))
    pattern = config["functions"]["app/main.py"]["excludeFiles"]
    if not (pattern.startswith("{") and pattern.endswith("}")):
        pytest.fail(f"excludeFiles is not a brace list: {pattern}")
    return pattern[1:-1].split(",")


def _tracked_files() -> list[str]:
    listing = subprocess.run(
        ["git", "ls-files", "-z"], cwd=ROOT, check=True, capture_output=True
    ).stdout.decode("utf-8")
    return [path for path in listing.split("\0") if path and (ROOT / path).is_file()]


def _bundled_files() -> list[str]:
    globs = _exclude_globs()
    return [
        path
        for path in _tracked_files()
        if not any(fnmatch.fnmatch(path, pattern) for pattern in globs)
    ]


# Gates below use pytest.fail rather than assert, so they hold even under
# `python -O --assert=plain`, where plain asserts are stripped.
def test_exclude_globs_strip_the_directories_the_app_must_not_depend_on():
    bundled = _bundled_files()
    if not any(path.startswith("app/") for path in bundled):
        pytest.fail("the bundle contains no app/ files")
    for excluded in ("scripts/", "tests/", "docs/", "frontend/"):
        if any(path.startswith(excluded) for path in bundled):
            pytest.fail(f"the bundle still contains {excluded}")


def test_the_wheel_declares_every_runtime_data_file_under_app():
    """vercel.json installs the project with `pip install '.[ai]'`, a wheel.

    If the runtime ever imports that installed copy instead of the source
    tree, any file the wheel omits is missing at import. setuptools ships only
    .py files unless package-data declares the rest, so every tracked non-.py
    file under app/ must match a package-data glob.
    """
    tomllib = pytest.importorskip("tomllib")
    config = tomllib.loads((ROOT / "pyproject.toml").read_text(encoding="utf-8"))
    package_data = config["tool"]["setuptools"].get("package-data", {})
    declared = set()
    for package, patterns in package_data.items():
        package_dir = ROOT / package.replace(".", "/")
        for pattern in patterns:
            for match in glob.glob(pattern, root_dir=package_dir, recursive=True):
                declared.add((package_dir / match).relative_to(ROOT).as_posix())
    runtime_data = {
        path
        for path in _tracked_files()
        if path.startswith("app/") and not path.endswith(".py")
    }
    missing = sorted(runtime_data - declared)
    if missing:
        pytest.fail(f"{len(missing)} app/ data files are not package-data, e.g. {missing[:5]}")


def _copy_bundle(tmp_path) -> Path:
    bundle = tmp_path / "bundle"
    for path in _bundled_files():
        target = bundle / path
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(ROOT / path, target)
    return bundle


def _run_in_bundle(bundle, probe, **env_overrides):
    env = {**os.environ, "PYTHONPATH": str(bundle), "PYTHONDONTWRITEBYTECODE": "1", "VERCEL": "1"}
    # Production leaves DATABASE_URL unset; only an explicit override sets it.
    env.pop("DATABASE_URL", None)
    env.update(env_overrides)
    return subprocess.run(
        [sys.executable, "-c", probe, str(bundle)],
        cwd=bundle,
        env=env,
        capture_output=True,
        text=True,
        timeout=300,
    )


def test_the_app_starts_from_the_vercel_function_bundle(tmp_path):
    bundle = _copy_bundle(tmp_path)
    # The real default (/tmp/swift_routing.db) is shared by every run on this
    # host, so startup uses a private file; the default itself is pinned below.
    result = _run_in_bundle(
        bundle, _STARTUP_PROBE, DATABASE_URL=f"sqlite:///{tmp_path / 'bundle.db'}"
    )
    if result.returncode != 0:
        pytest.fail(result.stderr[-4000:] or f"probe exited {result.returncode}")


def test_vercel_selects_the_writable_tmp_database_by_default():
    result = _run_in_bundle(ROOT, _DATABASE_DEFAULT_PROBE)
    if result.returncode != 0:
        pytest.fail(result.stderr[-4000:] or f"probe exited {result.returncode}")
