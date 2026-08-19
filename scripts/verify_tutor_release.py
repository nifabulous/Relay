#!/usr/bin/env python3
"""Fail-closed checks for the Vercel tutor release contract.

This runs after the same frontend build and non-editable Python installation
used by the Vercel project. It intentionally checks the built artifact and
resolved distributions, not only source metadata or an editable checkout.
"""
from __future__ import annotations

import importlib.metadata
import json
import re
import sys
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]


def _pyproject() -> dict:
    try:
        import tomllib
    except ModuleNotFoundError:  # Python 3.10
        import tomli as tomllib

    with (ROOT / "pyproject.toml").open("rb") as handle:
        return tomllib.load(handle)


def _fail(message: str) -> None:
    raise RuntimeError(message)


def _resolve_public_asset(reference: str, relay_root: Path, relay_assets: Path):
    """Resolve a same-origin asset reference, or return None for externals."""
    parsed = urlsplit(reference)
    if parsed.scheme in {"http", "https", "data"} or parsed.netloc:
        return None
    if not parsed.path:
        return None

    path = unquote(parsed.path)
    if path.startswith("/app/assets/"):
        asset = (relay_assets / path.removeprefix("/app/assets/")).resolve()
    elif path.startswith("/assets/"):
        asset = (relay_assets / path.removeprefix("/assets/")).resolve()
    elif path.startswith("/"):
        _fail(f"unrecognized local asset reference: {reference}")
    else:
        asset = (relay_root / path).resolve()

    if relay_root not in asset.parents:
        _fail(f"local asset escapes the Relay artifact: {reference}")
    if not asset.is_file():
        _fail(f"built Relay index references a missing asset: {reference}")
    return asset


def main() -> int:
    with (ROOT / "vercel.json").open() as handle:
        vercel = json.load(handle)

    if vercel.get("installCommand") != "cd frontend && npm ci && cd .. && pip install '.[ai]'":
        _fail("vercel installCommand no longer matches the production AI build")
    if vercel.get("buildCommand") != "cd frontend && npm run build":
        _fail("vercel buildCommand no longer matches the production frontend build")

    function = vercel.get("functions", {}).get("app/main.py", {})
    max_duration = function.get("maxDuration")
    if not isinstance(max_duration, int) or max_duration != 30:
        _fail("app/main.py must retain the 30-second Vercel function budget")

    from app.routers.tutor import TUTOR_TIMEOUT_SECONDS

    if TUTOR_TIMEOUT_SECONDS > max_duration - 5:
        _fail("tutor timeout does not leave five seconds for Vercel response overhead")

    ai_requirements = _pyproject()["project"]["optional-dependencies"]["ai"]
    expected_versions = {
        "pydantic-ai": "2.31.1",
        "openai": "3.3.0",
    }
    for distribution, expected in expected_versions.items():
        actual = importlib.metadata.version(distribution)
        if actual != expected:
            _fail(f"{distribution} resolved to {actual}, expected {expected}")
        if not any(requirement.startswith(f"{distribution}=={expected}") for requirement in ai_requirements):
            _fail(f"{distribution} is not pinned to {expected} in the ai extra")

    relay_index = ROOT / "app" / "static" / "relay" / "index.html"
    relay_root = relay_index.parent
    relay_assets = ROOT / "app" / "static" / "relay" / "assets"
    if not relay_index.is_file() or not relay_assets.is_dir():
        _fail("the Vercel frontend build did not produce app/static/relay")
    index = relay_index.read_text()
    for reference in re.findall(r'(?:src|href)="([^"]+)"', index):
        _resolve_public_asset(reference, relay_root, relay_assets)
    if list(relay_root.rglob("*.map")):
        _fail("the final Relay artifact contains source maps")

    print(
        "tutor release contract OK: "
        f"python={sys.version.split()[0]} "
        f"pydantic-ai={expected_versions['pydantic-ai']} "
        f"openai={expected_versions['openai']} "
        f"tutor_timeout={TUTOR_TIMEOUT_SECONDS}s "
        f"vercel_max_duration={max_duration}s"
    )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (KeyError, OSError, RuntimeError, json.JSONDecodeError) as error:
        print(f"tutor release contract FAILED: {error}", file=sys.stderr)
        raise SystemExit(1) from error
