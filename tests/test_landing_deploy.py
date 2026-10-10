"""Deploy wiring for the landing page: build order, bundle contents, ignores.

With RELAY_LANDING_ENABLED off, the only new work in a deploy is the build hook
reading the flag; these tests pin that and the files the function must carry.
"""
import json
import os
import shutil
import subprocess
from fnmatch import fnmatch
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[1]
VERCEL = json.loads((REPO_ROOT / "vercel.json").read_text(encoding="utf-8"))


def test_build_runs_the_app_build_first_then_the_flag_gated_landing_hook():
    assert VERCEL["buildCommand"] == (
        "cd frontend && npm run build && node scripts/build-landing-if-enabled.mjs"
    )


def test_the_function_bundle_keeps_the_landing_build():
    patterns = VERCEL["functions"]["app/main.py"]["excludeFiles"].strip("{}").split(",")
    for path in ("app/landing_dist/landing.html", "app/landing_dist/assets/landing-abc.js"):
        assert not any(fnmatch(path, pattern) for pattern in patterns), path


@pytest.mark.parametrize(
    "path",
    [
        "app/landing_dist/landing.html",
        "app/landing_dist/assets/landing-abc.js",
        "frontend/src/landing/generated/facts.json",
        "frontend/src/landing/generated/globe-points.json",
    ],
)
def test_generated_landing_files_are_ignored(path):
    result = subprocess.run(
        ["git", "check-ignore", "-q", path], cwd=REPO_ROOT, check=False, capture_output=True
    )
    assert result.returncode == 0, f"{path} is not gitignored"


def test_the_flag_is_documented_with_the_other_variables():
    assert "RELAY_LANDING_ENABLED" in (REPO_ROOT / ".env.example").read_text(encoding="utf-8")


@pytest.mark.skipif(shutil.which("node") is None, reason="node is not installed")
@pytest.mark.parametrize("value", [None, "", "false", "0", "ture"])
def test_the_build_hook_does_nothing_with_the_flag_off(value):
    env = os.environ.copy()
    env.pop("RELAY_LANDING_ENABLED", None)
    if value is not None:
        env["RELAY_LANDING_ENABLED"] = value
    # A PATH without python proves the hook never reaches the facts export.
    env["PATH"] = str(Path(shutil.which("node")).parent)
    result = subprocess.run(
        ["node", "scripts/build-landing-if-enabled.mjs"],
        cwd=REPO_ROOT / "frontend",
        env=env,
        capture_output=True,
        text=True,
        check=False,
        timeout=60,
    )
    assert result.returncode == 0, result.stderr
    assert "skipping the landing build" in result.stdout
