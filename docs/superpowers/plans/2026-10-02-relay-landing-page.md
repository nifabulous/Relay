# Relay Landing Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Serve a public landing page at `/` behind `RELAY_LANDING_ENABLED`, built separately from `/app`, in the new visual language (Geist, `#533AFD`, firecrawl-style rails) in light, dark and black, with every fact about Relay taken from repository data.

**Architecture:** A second Vite build (`frontend/vite.landing.config.ts`) renders React section components to static HTML at build time through `runnerImport`, and ships only small vanilla enhancers (globe, scroll route, tabs, counters, IBAN demo, theme control) to the browser. A Python export seeds a private in-memory database and writes the page's facts at landing-build time. FastAPI mounts and serves `app/landing_dist/` only when the flag is on; with it off, `/` is today's redirect and the `/app` build is byte-identical.

**Tech Stack:** FastAPI + Starlette 1.6, SQLAlchemy 2.0, pytest; React 19 (build time only), TypeScript 7, Vite 8.2.1 (rolldown), zod 4, Vitest 4 + jsdom, Playwright 1.62, d3-geo + topojson-client, `@fontsource/geist` and `@fontsource/geist-mono` 5.3.0.

**Spec:** [`docs/superpowers/specs/2026-10-01-relay-landing-and-visual-language-design.md`](../specs/2026-10-01-relay-landing-and-visual-language-design.md). **Visual contract:** [`DESIGN.md`](../../../DESIGN.md). **Reference prototype:** [`docs/design/landing-prototype/index.html`](../../design/landing-prototype/index.html).

**How this plan was verified (2026-10-02).** Every file below was written and run in a throwaway worktree at `origin/main` (`7504236`) before it was copied here, so the code in each step is the code that passed. The results were:
- **Backend:** 3,283 tests pass. That count includes `test_vercel_bundle.py`, once the new files are tracked.
- **Frontend:** 1,650 tests pass with `--no-file-parallelism`, and `tsc --noEmit` is clean with the generated files absent.
- **E2E:** all 21 landing tests pass. Each existing Playwright project still lists 89 tests.
- **Mutation checks:** each guard was broken on purpose and caught the break. These were the containment and contrast audits, the digit scan, the bank-name scan, and the unreachable-`DATABASE_URL` test.
- **`/app` output:** its hash is identical with the landing sources absent, present, and after a landing build.

## Global Constraints

Every task's requirements include these. Values are copied from the spec.

- **Flag off is today, exactly.** With `RELAY_LANDING_ENABLED` unset or not one of `1`, `true`, `yes`, `on` (case-insensitive, trimmed — `app/config.py` `_env_flag`), `GET /` is today's 302 to `/app`, or to `/learn` without a build. No landing file is mounted, read or served. The `/app` build config (`vite.config.ts`), entry (`index.html`) and output (`app/static/relay`) do not change. The only new work is reading the flag at process start and in the build hook.
- **Truth.** Every fact about Relay on the page comes from repository data (the facts export or the frontend's own data modules). The only hand-typed facts are the corridor city coordinates in `app/data/landing_corridors.py`. Demonstration values live only in `frontend/src/landing/render/demo.json`, and every one that claims a computed result is asserted against the real code.
- **Simulation is always stated.** The marker appears in the hero, sections 01, 02, 04 and 06, and the footer. Demonstration institutions are only Harborline Bank, Meridian Clearing and Northstar Bank. No real bank name ever appears on the page, and every account number is an `ACCT-` placeholder.
- **Containment.** At 390, 768, 1024 and 1440px nothing overflows its bordered box, and the page never scrolls sideways.
- **Motion only enhances.** All content is in the built HTML. Without JavaScript, under `prefers-reduced-motion: reduce`, or with a stored `reducedMotion: true`, every animated element shows its final state. The globe tour has a pause control (WCAG 2.2.2).
- **Preference contract.** The page reads and writes the app's `relay:preferences` record (schemaVersion 1). A write re-reads storage, merges only `theme` into a valid v1 record or writes the full default record, and never overwrites a corrupt, non-object or other-version record. When storage throws, the theme changes for the page only.
- **AA everywhere.** Every text pair passes WCAG 2.2 AA in light, dark and black.
- **Colours live in one file.** All landing colours are in `frontend/src/landing/client/styles/tokens.css`; `landing.css` contains no hex. Component markup uses no inline `style`.
- **Import boundary.** Browser code (`src/landing/client/`) imports only itself, the generated point set as a URL, and the Geist `@fontsource` stylesheets. Build-time code (`src/landing/render/`) imports only itself, `react`, `react-dom/server`, `zod`, and `curriculum.ts`, `practice/questionBank.ts`, `practice/selectDaily.ts`, `cases/caseCatalog.ts`, `cases/caseTypes.ts`.
- **Generated files are never committed.** `app/landing_dist/` and `frontend/src/landing/generated/` are gitignored, and no tracked source may import them in a way `tsc` resolves.
- **Budgets.** Landing JavaScript ≤ 25KB gzip; globe points ≤ 20KB gzip; woff2 fonts ≤ 75KB; measured with Node's default `zlib.gzipSync`.
- **Versions.** Python 3.10+ (CI runs 3.10–3.12; `X | None` is fine in new code). Node 22 in CI. Vite 8 option names (`build.rolldownOptions`, `runnerImport`). `@fontsource/geist@5.3.0` and `@fontsource/geist-mono@5.3.0`, exact.
- **Repo conventions.** TDD: write the failing test first and watch it fail. One commit per task, formatted `type(scope): description (landing N)`, ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Ruff `E,F,I` must pass. Run the full frontend suite with `--no-file-parallelism`.

## Working environment

- **Branch.** Implement on a branch made from `docs/landing-visual-language` (which carries the spec, DESIGN.md and this plan), for example `feat/landing-page`, in its own worktree (superpowers:using-git-worktrees).
- **Python in a linked worktree.** The shared `.venv` has an editable install pointing at the main checkout, so run Python as `PYTHONPATH=$PWD .venv/bin/python …` from the worktree root (or the common checkout's `.venv/bin/python`). Every `python -m pytest` below assumes this.
- **Frontend dependencies.** Run `cd frontend && npm ci` once in the worktree.
- **`tests/test_frontdoor.py` needs the `/app` build.** Run `cd frontend && npm run build` before any full pytest run; CI does the same.

## File map

| File | Responsibility | Task |
|---|---|---|
| `app/landing.py` | `mount_landing()` (flag, mount, immutable assets), `landing_response()` | 1 |
| `app/main.py` | Calls `mount_landing(app)`; `root()` serves `LANDING_HTML` when set | 1 |
| `app/services/stp_checker.py` | `RuleSpec` and `RULES`, the countable rule registry; docstrings say 14 | 2 |
| `app/data/landing_corridors.py` | The reviewed corridor table | 3 |
| `frontend/src/landing/render/demo.json`, `demo.ts` | Demonstration values, read by the page and by pytest | 4, 7 |
| `scripts/export_landing_facts.py` | Facts export from a private seeded database | 5 |
| `frontend/src/landing/render/facts.fixture.json` | Committed sample of the export's shape, for tests | 5 |
| `frontend/scripts/build-globe-points.mjs` | Land point set from the Atlas topology | 6 |
| `frontend/src/landing/render/facts.ts`, `content.ts`, `format.ts` | Zod facts contract; content derived from curriculum, questions and cases; number formatting | 7 |
| `frontend/src/landing/client/styles/tokens.css`, `landing.css` | All colours; all component styles | 8 |
| `frontend/src/test/contrast.ts` | Shared WCAG maths for token tests | 8 |
| `frontend/src/landing/render/sections/*.tsx`, `LandingPage.tsx`, `render.tsx` | The page, rendered to static markup at build time | 9 |
| `frontend/src/landing/client/preferences.ts`, `theme-control.ts`, `motion.ts` | Theme writer, footer control, motion flag | 10 |
| `frontend/src/landing/client/rails-tabs.ts`, `counters.ts`, `iban-demo.ts`, `scroll-route.ts`, `anatomy.ts`, `progress.ts` | Enhancers | 11 |
| `frontend/src/landing/client/globe-math.ts`, `globe.ts` | Hero globe | 12 |
| `frontend/landing.html`, `vite.landing.config.ts`, `src/landing/client/main.ts`, `src/landing/brand/relay-symbol.svg` | The separate landing build | 13 |
| `frontend/scripts/build-landing.mjs`, `check-landing-build.mjs` | Build orchestration with the `/app` hash guard; artifact checks | 13 |
| `frontend/scripts/check-landing-boundary.mjs` | Import boundary | 14 |
| `frontend/scripts/build-landing-if-enabled.mjs`, `vercel.json` | Flag-gated deploy hook | 15 |
| `frontend/playwright.config.ts`, `e2e/landing.spec.ts`, `e2e/helpers/landingAudits.ts`, `scripts/run_e2e_server.sh`, `e2e/global-setup.ts` | E2E project and audits | 16 |
| `CLAUDE.md`, `README.md`, `frontend/README.md`, `DESIGN.md`, `docs/PROJECT_OVERVIEW.md` | Documentation | 2, 15, 17 |

---

### Task 1: Serve the landing page at `/` behind `RELAY_LANDING_ENABLED`

**Files:**
- Create: `app/landing.py`
- Modify: `app/main.py` (import at line 17; mount after the Relay mount at lines 128–131; `root()` at lines 166–178)
- Modify: `.gitignore`, `.env.example`
- Test: `tests/test_landing_serving.py`

**Interfaces:**
- Consumes: `app.config._env_flag(name: str, default: bool = False) -> bool` (`app/config.py:60`), the same fail-closed parser the tutor and admin flags use.
- Produces:
  - `app.landing.LANDING_FLAG = "RELAY_LANDING_ENABLED"`
  - `app.landing.LANDING_DIST: Path` (`app/landing_dist`)
  - `app.landing.mount_landing(app: FastAPI, dist: Path = LANDING_DIST) -> Optional[Path]`, which returns the landing HTML path when mounted and `None` otherwise
  - `app.landing.landing_response(html: Path) -> FileResponse`
  - `app.main.LANDING_HTML: Optional[Path]`
  - the URL prefix `/landing/assets/`, which Task 13's `base: "/landing/"` relies on

The flag is read once, at import. That is the only work flag-off adds: `mount_landing` returns before any filesystem call, and `root()` checks one module-level value. The tests prove the first by making `Path.is_file` and `Path.is_dir` raise.

- [ ] **Step 1: Write the failing test**

Create `tests/test_landing_serving.py`:

```python
"""The landing page at / is gated by RELAY_LANDING_ENABLED.

Flag off must mean today's behaviour exactly: / redirects as it always has, and
nothing under app/landing_dist is mounted, read or served. These tests pin both
directions of the flag and the cache headers the landing build relies on.
"""
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
```

- [ ] **Step 2: Run it and watch it fail**

Run: `python -m pytest tests/test_landing_serving.py -q`
Expected: collection error, `ModuleNotFoundError: No module named 'app.landing'`.

- [ ] **Step 3: Implement**

Create `app/landing.py`:

```python
"""The public landing page, served at / when RELAY_LANDING_ENABLED is on.

The landing build lives in app/landing_dist/, outside app/static, so the
/static mount can never expose it. With the flag off nothing here touches the
filesystem: mount_landing() reads the flag and returns.
"""
from pathlib import Path
from typing import Optional

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from starlette.responses import Response
from starlette.types import Scope

from .config import _env_flag

LANDING_FLAG = "RELAY_LANDING_ENABLED"
LANDING_DIST = Path(__file__).resolve().parent / "landing_dist"
LANDING_HTML_NAME = "landing.html"
IMMUTABLE_CACHE = "public, max-age=31536000, immutable"


class _ImmutableStaticFiles(StaticFiles):
    """Hashed build assets never change under the same name."""

    async def get_response(self, path: str, scope: Scope) -> Response:
        response = await super().get_response(path, scope)
        if response.status_code == 200:
            response.headers["Cache-Control"] = IMMUTABLE_CACHE
        return response


def mount_landing(app: FastAPI, dist: Path = LANDING_DIST) -> Optional[Path]:
    """Mount /landing/assets and return the landing HTML path, or None.

    None means "serve today's redirect": the flag is off, or the build is
    incomplete. The flag is read once, when the app module is imported, so a
    change takes effect on the next deploy or process start.
    """
    if not _env_flag(LANDING_FLAG):
        return None
    html = dist / LANDING_HTML_NAME
    assets = dist / "assets"
    if not (html.is_file() and assets.is_dir()):
        return None
    app.mount(
        "/landing/assets",
        _ImmutableStaticFiles(directory=str(assets)),
        name="landing-assets",
    )
    return html


def landing_response(html: Path) -> FileResponse:
    """The landing document itself is revalidated on every load."""
    return FileResponse(
        str(html),
        media_type="text/html; charset=utf-8",
        headers={"Cache-Control": "no-cache"},
    )
```

Modify `app/main.py`. Apply this change:

```diff
@@ -15,6 +15,7 @@ init_sentry()
 logger = logging.getLogger(__name__)

 from .db import Base, SessionLocal, engine
+from .landing import landing_response, mount_landing
 from .request_limits import BodySizeLimitMiddleware
 from .routers import (
     analytics as analytics_router,
@@ -130,6 +131,9 @@ if RELAY_DIR.is_dir():
     app.mount("/app/assets", StaticFiles(directory=str(RELAY_DIR / "assets")), name="relay-assets")
     _relay_mounted = True

+# Public landing page (RELAY_LANDING_ENABLED). None keeps the redirect below.
+LANDING_HTML = mount_landing(app)
+

 @app.get("/app")
 @app.get("/app/{rest:path}")
@@ -173,7 +177,12 @@ def root():
     When the Relay build is absent — a fresh clone that has not run
     `cd frontend && npm run build` yet — fall back to /learn so the root
     serves a working page instead of the 503 that /app would raise.
+
+    With RELAY_LANDING_ENABLED on and a landing build present, / serves the
+    landing page instead.
     """
+    if LANDING_HTML is not None and LANDING_HTML.is_file():
+        return landing_response(LANDING_HTML)
     target = "/app" if _relay_mounted and RELAY_INDEX.exists() else "/learn"
     return RedirectResponse(url=target, status_code=302)

```

Modify `.gitignore` — the generated landing outputs (Tasks 5, 6 and 13 write them). Apply this change:

```diff
@@ -51,6 +51,11 @@ frontend/playwright/.cache/
 app/static/relay/assets/
 app/static/relay/index.html

+# Generated landing page build (npm run build:landing; only built when
+# RELAY_LANDING_ENABLED is on) and the data it is built from.
+app/landing_dist/
+frontend/src/landing/generated/
+
 # Playwright/test output artifacts
 frontend/output/
 output/
```

Modify `.env.example`. Apply this change:

```diff
@@ -19,6 +19,12 @@
 # ADMIN_API_KEY is unset. Never set this on a deploy.
 # ADMIN_API_ALLOW_OPEN=1

+# ── Landing page ────────────────────────────────────────────────────────────
+# Off by default: / redirects to /app as it always has. On (1, true, yes, on),
+# the Vercel build also builds the landing page and / serves it. Read once at
+# process start and once in the build command, so a change needs a redeploy.
+# RELAY_LANDING_ENABLED=false
+
 # ── Error monitoring (Sentry) ───────────────────────────────────────────────
 # Disabled when SENTRY_DSN is empty. Keep the DSN in the deployment's secret
 # store rather than committing it here. Performance tracing is off by default;
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `python -m pytest tests/test_landing_serving.py -q`
Expected: `23 passed`.

Run: `cd frontend && npm run build && cd .. && python -m pytest tests/test_frontdoor.py -q`
Expected: all pass. Today's redirect is unchanged; `test_frontdoor.py` needs the `/app` build, which is why it is built first.

Run: `ruff check app/landing.py app/main.py tests/test_landing_serving.py`
Expected: `All checks passed!`

- [ ] **Step 5: Commit**

```bash
git add app/landing.py app/main.py tests/test_landing_serving.py .gitignore .env.example
git commit -m "feat(landing): serve the landing page behind RELAY_LANDING_ENABLED (landing 1)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Make the STP rule count countable

**Files:**
- Modify: `app/services/stp_checker.py` (registry after `_33B_CURRENCY_KEYS`; "12-rule" → "14-rule" in the module and `check_stp` docstrings)
- Modify: `app/routers/analytics.py:217` (endpoint docstring, shown in `/docs`)
- Modify: `CLAUDE.md:134`, `README.md:363`, `docs/PROJECT_OVERVIEW.md:78` (stated count)
- Test: `tests/test_stp_rule_registry.py`

**Interfaces:**
- Produces: `app.services.stp_checker.RuleSpec(number: int, title: str, code: str)` (frozen dataclass) and `app.services.stp_checker.RULES: tuple[RuleSpec, ...]`, 14 entries in run order. Task 5 exports `len(RULES)`.
- `check_stp()` itself is unchanged. The registry is checked against the checker's source rather than wired into it, so the verdict logic cannot move.

`check_stp` runs 14 rule blocks (`# ---- Rule 1:` to `# ---- Rule 14:`, lines 157–362), each emitting one finding code. Three docstrings say 12.

- [ ] **Step 1: Write the failing test**

Create `tests/test_stp_rule_registry.py`:

```python
"""stp_checker.RULES is the countable list of rules check_stp runs.

The landing page states the rule count, so the count must come from code. The
registry is checked against the checker's source: every finding code check_stp
can emit belongs to exactly one registered rule, and every rule block comment
has a registry entry. Adding a rule without registering it fails here.
"""
import ast
import re
from pathlib import Path

from app.services import stp_checker
from app.services.stp_checker import RULES

SOURCE = Path(stp_checker.__file__).read_text(encoding="utf-8")


def _emitted_codes() -> set:
    tree = ast.parse(SOURCE)
    check = next(
        node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name == "check_stp"
    )
    codes = set()
    for node in ast.walk(check):
        if isinstance(node, ast.Call) and getattr(node.func, "id", None) == "Finding":
            for keyword in node.keywords:
                if keyword.arg == "code" and isinstance(keyword.value, ast.Constant):
                    codes.add(keyword.value.value)
    return codes


def test_every_emitted_code_belongs_to_exactly_one_rule():
    registered = [rule.code for rule in RULES]
    assert len(registered) == len(set(registered))
    assert set(registered) == _emitted_codes()


def test_rule_numbers_match_the_rule_block_comments():
    blocks = [int(n) for n in re.findall(r"# ---- Rule (\d+):", SOURCE)]
    assert blocks == list(range(1, len(blocks) + 1))
    assert [rule.number for rule in RULES] == blocks


def test_docstrings_state_the_registered_count():
    count = f"{len(RULES)}-rule"
    assert count in stp_checker.__doc__
    assert count in stp_checker.check_stp.__doc__


def test_the_api_description_states_the_registered_count():
    from app.routers.analytics import stp_check_endpoint

    assert f"{len(RULES)}-rule" in stp_check_endpoint.__doc__
```

- [ ] **Step 2: Run it and watch it fail**

Run: `python -m pytest tests/test_stp_rule_registry.py -q`
Expected: collection error, `ImportError: cannot import name 'RULES' from 'app.services.stp_checker'`.

- [ ] **Step 3: Implement**

Modify `app/services/stp_checker.py`. Apply this change:

```diff
@@ -1,7 +1,7 @@
 """
 STP (Straight-Through Processing) checker for MT103 messages.

-A pure function `check_stp(message: dict) -> STPResult` running a 12-rule STP
+A pure function `check_stp(message: dict) -> STPResult` running a 14-rule STP
 PRIMER (production engines apply 40–80+ rules). It decides whether an MT103
 could flow through the chain without manual repair.

@@ -51,6 +51,35 @@ _TX_REF_MAX_LEN = 16
 _33B_CURRENCY_KEYS = ("instructed_currency", "currency_33b", "original_currency")


+@dataclass(frozen=True)
+class RuleSpec:
+    """One rule check_stp runs, and the finding code it emits."""
+    number: int
+    title: str
+    code: str
+
+
+# The rules check_stp runs, in the order it runs them. The landing page states
+# their count, and tests/test_stp_rule_registry.py checks this tuple against
+# the rule blocks below, so a new rule must be registered here too.
+RULES = (
+    RuleSpec(1, "Mandatory fields 20, 32A, 50, 59 and 71A are present", "STP-MISSING-FIELD"),
+    RuleSpec(2, "Value date is a valid calendar date", "STP-VALUE-DATE-FORMAT"),
+    RuleSpec(3, "Settlement and instructed currencies agree", "STP-CURRENCY-MISMATCH"),
+    RuleSpec(4, "Ordering and beneficiary BICs are valid", "STP-BIC-INVALID"),
+    RuleSpec(5, "Ordering customer name is present", "STP-ORDERING-NAME-MISSING"),
+    RuleSpec(6, "Beneficiary name and account are present", "STP-BENEFICIARY-MISSING"),
+    RuleSpec(7, "Amount is greater than zero", "STP-AMOUNT-INVALID"),
+    RuleSpec(8, "Charge code is OUR, SHA or BEN", "STP-CHARGE-CODE-INVALID"),
+    RuleSpec(9, "UETR is present", "STP-UETR-MISSING"),
+    RuleSpec(10, "Transaction reference fits 16 characters", "STP-REF-TOO-LONG"),
+    RuleSpec(11, "Value date is not in the past", "STP-VALUE-DATE-STALE"),
+    RuleSpec(12, "No BIC repeats in the chain", "STP-DUPLICATE-BIC"),
+    RuleSpec(13, "Bank operation code is valid", "STP-BANK-OP-CODE-INVALID"),
+    RuleSpec(14, "Instructed and settled amounts agree", "STP-AMOUNT-DIVERGENCE"),
+)
+
+
 @dataclass
 class Finding:
     """A single STP finding attached to a SWIFT field tag."""
@@ -128,7 +157,7 @@ def _parse_value_date(raw) -> Optional[date]:

 def check_stp(message: dict) -> STPResult:
     """
-    Run the 12-rule STP primer against an MT103-shaped message dict.
+    Run the 14-rule STP primer against an MT103-shaped message dict.

     The dict mirrors STPCheckRequest: transaction_reference, bank_op_code,
     value_date, currency, interbank_amount, charge_code, ordering {account,
```

Modify `app/routers/analytics.py`. Apply this change:

```diff
@@ -214,7 +214,7 @@ def value_date_endpoint(request: ValueDateRequest):
 @router.post("/message/stp-check", response_model=STPCheckResponse)
 def stp_check_endpoint(request: STPCheckRequest):
     """
-    Run the 12-rule MT103 STP primer (production engines run 40–80+ rules) and return a verdict.
+    Run the 14-rule MT103 STP primer (production engines run 40–80+ rules) and return a verdict.

     Returns one of:
     - **CLEAN** — no errors, no warnings; flows straight through
```

Then correct the three documents that state the count:
- In `CLAUDE.md`, change `│   ├── stp_checker.py   # MT103 STP checker (12-rule primer)` to `│   ├── stp_checker.py   # MT103 STP checker (14-rule primer)`.
- In `README.md`, in the endpoint table row for `/api/message/stp-check`, change `MT103 STP compliance checker (12 rules)` to `MT103 STP compliance checker (14 rules)`.
- In `docs/PROJECT_OVERVIEW.md`, change `(12-rule primer;` to `(14-rule primer;`.

Leave the dated plans and specs under `docs/superpowers/`, `IMPLEMENTATION_PLAN.md` and `ENGINEERING_ROADMAP.md` alone: they record what was true when they were written.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `python -m pytest tests/test_stp_rule_registry.py tests/test_stp.py tests/test_disclaimers.py -q`
Expected: all pass (`test_stp.py` proves the checker's behaviour did not change).

Run: `grep -rn "12-rule\|(12 rules)" CLAUDE.md README.md docs/PROJECT_OVERVIEW.md app/`
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add app/services/stp_checker.py app/routers/analytics.py tests/test_stp_rule_registry.py CLAUDE.md README.md docs/PROJECT_OVERVIEW.md
git commit -m "feat(stp): register the 14 STP rules so their count is data (landing 2)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The corridor table

**Files:**
- Create: `app/data/landing_corridors.py`
- Test: `tests/test_landing_corridors.py`

**Interfaces:**
- Consumes: `app.services.seed.BANKS` (tuples `(bic, name, country_code, city, currency)`), `app.services.seed.CORRIDOR_RULES` (tuples `(currency, destination_country, intermediary_bic, intermediary_name, corridor, confidence, rank)`), and `frontend/src/features/learn/cases/caseCatalog.ts` (each case's `recommendation.corridorLabel`, which uses U+2192 → with a space each side).
- Produces: `app.data.landing_corridors.LANDING_CORRIDORS: list[dict]`, in tour order. Each entry has:
  - `currency`;
  - `origin` and `destination`, each `{city, country, lat, lon}`;
  - `source`, either `{kind: "case", case_id, corridor_label}` or `{kind: "rule", currency, destination_country, intermediary_bic}`.

  Task 5 exports everything except the source details.

This is the page's only hand-typed factual data; the test is its review. The four rule corridors use the rows whose intermediary, `CITIUS33XXX`, sits in New York (verified against `BANKS`). The legend never names that bank.

- [ ] **Step 1: Write the failing test**

Create `tests/test_landing_corridors.py`:

```python
"""The landing globe's corridor table is the only hand-typed factual data on the
page. This test is its review: every entry must trace to a case in the Case
Desk catalog or to a row of the seeded corridor rules."""
import re
from pathlib import Path

from app.data.landing_corridors import LANDING_CORRIDORS
from app.services.seed import BANKS, CORRIDOR_RULES

CASE_CATALOG = (
    Path(__file__).resolve().parents[1]
    / "frontend" / "src" / "features" / "learn" / "cases" / "caseCatalog.ts"
)


def _case_labels() -> dict:
    """Map case id -> recommendation.corridorLabel, read from the TS source."""
    source = CASE_CATALOG.read_text(encoding="utf-8")
    labels = {}
    for match in re.finditer(r'\bid: "([a-z0-9-]+)"', source):
        rest = source[match.end():]
        label = re.search(r'corridorLabel: "([^"]+)"', rest)
        next_id = re.search(r'\bid: "[a-z0-9-]+"', rest)
        if label and (next_id is None or label.start() < next_id.start()):
            labels[match.group(1)] = label.group(1)
    return labels


def test_at_most_one_corridor_per_categorical_colour_slot():
    assert 1 <= len(LANDING_CORRIDORS) <= 8


def test_currency_codes_are_unique_so_legend_entries_are_unambiguous():
    codes = [c["currency"] for c in LANDING_CORRIDORS]
    assert len(codes) == len(set(codes))


def test_coordinates_are_plausible():
    for corridor in LANDING_CORRIDORS:
        for end in ("origin", "destination"):
            point = corridor[end]
            assert -90 <= point["lat"] <= 90, corridor
            assert -180 <= point["lon"] <= 180, corridor
            assert re.fullmatch(r"[A-Z]{2}", point["country"]), corridor
            assert point["city"].strip() == point["city"] and point["city"], corridor


def test_case_sources_match_the_case_desk_catalog():
    labels = _case_labels()
    case_entries = [c for c in LANDING_CORRIDORS if c["source"]["kind"] == "case"]
    assert case_entries, "expected at least one case-desk corridor"
    for corridor in case_entries:
        case_id = corridor["source"]["case_id"]
        assert case_id in labels, f"unknown case id {case_id}"
        assert labels[case_id] == corridor["source"]["corridor_label"], corridor


def test_rule_sources_exist_in_the_seeded_corridor_rules():
    rule_keys = {(ccy, country, bic) for ccy, country, bic, *_ in CORRIDOR_RULES}
    bank_by_bic = {bic: (country, city) for bic, _name, country, city, _ccy in BANKS}
    rule_entries = [c for c in LANDING_CORRIDORS if c["source"]["kind"] == "rule"]
    assert rule_entries, "expected at least one corridor-rule corridor"
    for corridor in rule_entries:
        source = corridor["source"]
        key = (source["currency"], source["destination_country"], source["intermediary_bic"])
        assert key in rule_keys, f"no corridor rule {key}"
        assert source["currency"] == corridor["currency"], corridor
        assert source["destination_country"] == corridor["destination"]["country"], corridor
        # The arc starts where the intermediary actually sits.
        assert bank_by_bic[source["intermediary_bic"]] == (
            corridor["origin"]["country"],
            corridor["origin"]["city"],
        ), corridor
```

- [ ] **Step 2: Run it and watch it fail**

Run: `python -m pytest tests/test_landing_corridors.py -q`
Expected: collection error, `ModuleNotFoundError: No module named 'app.data.landing_corridors'`.

- [ ] **Step 3: Implement**

Create `app/data/landing_corridors.py`:

```python
"""Corridors the landing page globe tours, in tour order.

This is the landing page's only hand-typed factual data: the city names and
coordinates of each arc's ends. Every entry names its source, a Case Desk case
or a seeded corridor rule, and tests/test_landing_corridors.py checks each one
against that source. At most eight entries: one per categorical colour slot.
"""

LANDING_CORRIDORS = [
    {
        "currency": "GBP",
        "origin": {"city": "Lagos", "country": "NG", "lat": 6.45, "lon": 3.39},
        "destination": {"city": "London", "country": "GB", "lat": 51.51, "lon": -0.13},
        "source": {
            "kind": "case",
            "case_id": "nigeria-uk-contractor",
            "corridor_label": "Nigeria → United Kingdom",
        },
    },
    {
        "currency": "USD",
        "origin": {"city": "Toronto", "country": "CA", "lat": 43.65, "lon": -79.38},
        "destination": {"city": "New York", "country": "US", "lat": 40.71, "lon": -74.01},
        "source": {
            "kind": "case",
            "case_id": "canada-us-supplier",
            "corridor_label": "Canada → United States",
        },
    },
    {
        "currency": "EUR",
        "origin": {"city": "London", "country": "GB", "lat": 51.51, "lon": -0.13},
        "destination": {"city": "Frankfurt", "country": "DE", "lat": 50.11, "lon": 8.68},
        "source": {
            "kind": "case",
            "case_id": "uk-eurozone-supplier",
            "corridor_label": "United Kingdom → Germany",
        },
    },
    {
        "currency": "MXN",
        "origin": {"city": "New York", "country": "US", "lat": 40.71, "lon": -74.01},
        "destination": {"city": "Mexico City", "country": "MX", "lat": 19.43, "lon": -99.13},
        "source": {
            "kind": "case",
            "case_id": "us-mexico-vendor",
            "corridor_label": "United States → Mexico",
        },
    },
    {
        "currency": "KES",
        "origin": {"city": "New York", "country": "US", "lat": 40.71, "lon": -74.01},
        "destination": {"city": "Nairobi", "country": "KE", "lat": -1.29, "lon": 36.82},
        "source": {
            "kind": "rule",
            "currency": "KES",
            "destination_country": "KE",
            "intermediary_bic": "CITIUS33XXX",
        },
    },
    {
        "currency": "INR",
        "origin": {"city": "New York", "country": "US", "lat": 40.71, "lon": -74.01},
        "destination": {"city": "Mumbai", "country": "IN", "lat": 19.08, "lon": 72.88},
        "source": {
            "kind": "rule",
            "currency": "INR",
            "destination_country": "IN",
            "intermediary_bic": "CITIUS33XXX",
        },
    },
    {
        "currency": "JPY",
        "origin": {"city": "New York", "country": "US", "lat": 40.71, "lon": -74.01},
        "destination": {"city": "Tokyo", "country": "JP", "lat": 35.68, "lon": 139.69},
        "source": {
            "kind": "rule",
            "currency": "JPY",
            "destination_country": "JP",
            "intermediary_bic": "CITIUS33XXX",
        },
    },
    {
        "currency": "AUD",
        "origin": {"city": "New York", "country": "US", "lat": 40.71, "lon": -74.01},
        "destination": {"city": "Sydney", "country": "AU", "lat": -33.87, "lon": 151.21},
        "source": {
            "kind": "rule",
            "currency": "AUD",
            "destination_country": "AU",
            "intermediary_bic": "CITIUS33XXX",
        },
    },
]
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `python -m pytest tests/test_landing_corridors.py -q && ruff check app/data/landing_corridors.py tests/test_landing_corridors.py`
Expected: `5 passed`, `All checks passed!`

- [ ] **Step 5: Commit**

```bash
git add app/data/landing_corridors.py tests/test_landing_corridors.py
git commit -m "feat(landing): add the reviewed globe corridor table (landing 3)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Demonstration values, and a test for every claim they make

**Files:**
- Create: `frontend/src/landing/render/demo.json`
- Test: `tests/test_landing_demo_claims.py`

**Interfaces:**
- Consumes the real services, with signatures verified on `origin/main`:
  - `validate_iban(iban_str) -> ValidationResult` (`validator.py:62`);
  - `schwifty.IBAN(...).checksum_digits / .bank_code / .branch_code / .length`;
  - `match_names(submitted_name, account_name) -> NameMatchResult` (`name_matcher.py:123`);
  - `decide(validation_valid, vop_outcome, has_routing, has_real_ssi_accounts, has_placeholder_ssi_only, validation_errors=None, strictness="standard") -> RecommendationResult` (`recommendation.py:59`);
  - `simulate_fees(amount, currency, charge_code, intermediary_bics, intermediary_names=None) -> FeeResult` (`fee_calculator.py:77`);
  - `screen_payment(sender_name, beneficiary_name, intermediary_bics=None, intermediary_names=None) -> ScreeningResult` and `screen_name(name)` (`screening.py:93`, `:70`);
  - `calculate_value_date(send_datetime, currency, scheme=None) -> ValueDateResult` (`value_date.py:164`);
  - `check_stp(message: dict) -> STPResult` (`stp_checker.py:129`);
  - `iso_transaction_status(status)` (`tracking.py:69`).
- Produces: `frontend/src/landing/render/demo.json`, the only home of demonstration values. Task 7 types it and Task 9 renders it.

Every claim in `demo.json` was run against the code while this plan was written. Four of the prototype's claims were false and are corrected here:
- **Payee:** "John Okafor Limited" is a full MATCH, so the record on file is "Jonathan Okafor Limited".
- **Screening:** "Meridian Clearing" screens clear, so all three hops show clear, with their scores.
- **Value date:** 30 September is not a CAD holiday, so the example is CAD over EFT around Canada Day, with the real 17:00 cut-off.
- **Fees:** the bars are replaced by the real amounts received.

`MERIGB2LXXX`, the intermediary used for fees and screening, is absent from `BANKS`, the SSI records, `LIFT_FEES` and schwifty's registry. It is never rendered.

`check_stp`'s rule 11 reads `date.today()` (`stp_checker.py:311`, `from datetime import date`), so the test replaces the module's `date` with a subclass pinned to the demonstration as-of date. Patching `datetime.date.today` directly does not work: it is a C type.

- [ ] **Step 1: Write the failing test**

Create `tests/test_landing_demo_claims.py`:

```python
"""Every demonstration value on the landing page that claims a computed result
is checked here against the real Relay code.

The values live in frontend/src/landing/render/demo.json, which the page
renders from. Change a service and this test says which claim on the page
stopped being true.
"""
import datetime as dt
import json
from pathlib import Path

import pytest
from schwifty import IBAN

from app.services import stp_checker
from app.services.fee_calculator import simulate_fees
from app.services.name_matcher import match_names
from app.services.recommendation import decide
from app.services.screening import screen_name, screen_payment
from app.services.tracking import iso_transaction_status
from app.services.validator import validate_iban
from app.services.value_date import calculate_value_date

DEMO = json.loads(
    (
        Path(__file__).resolve().parents[1]
        / "frontend" / "src" / "landing" / "render" / "demo.json"
    ).read_text(encoding="utf-8")
)
AS_OF = dt.date.fromisoformat(DEMO["asOf"])
NAMES = DEMO["payment"]


def test_demo_iban_validates_and_parses_as_shown():
    demo = DEMO["iban"]
    assert "".join(demo["groups"]) == demo["value"]
    result = validate_iban(demo["value"])
    assert result.valid is True
    assert result.country_code == demo["countryCode"]
    parsed = IBAN(demo["value"], validate_bban=True)
    assert parsed.length == demo["length"]
    assert parsed.checksum_digits == demo["checkDigits"]
    assert parsed.bank_code == demo["bankCode"]
    assert parsed.branch_code == demo["sortCode"]


def test_demo_payee_is_a_close_match():
    demo = DEMO["payee"]
    result = match_names(demo["entered"], demo["onFile"])
    assert result.outcome.value == demo["outcome"]


@pytest.mark.parametrize("strictness", ["lenient", "standard", "strict"])
def test_demo_prepare_verdict_for_each_strictness(strictness):
    demo = DEMO["prepare"]
    result = decide(
        validation_valid=demo["validationValid"],
        vop_outcome=demo["payeeOutcome"],
        has_routing=True,
        has_real_ssi_accounts=False,
        has_placeholder_ssi_only=True,
        strictness=strictness,
    )
    assert result.recommendation.value == demo["verdicts"][strictness]


@pytest.mark.parametrize("charge_code", ["OUR", "SHA", "BEN"])
def test_demo_fees_for_each_charge_code(charge_code):
    demo = DEMO["fees"]
    expected = demo["byChargeCode"][charge_code]
    result = simulate_fees(
        NAMES["amount"],
        NAMES["currency"],
        charge_code,
        [demo["intermediaryBic"]],
        [NAMES["correspondent"]["name"]],
    )
    assert result.received_amount == pytest.approx(expected["received"])
    assert result.total_fees == pytest.approx(expected["totalFees"])
    assert result.sender_pays_extra == pytest.approx(expected["senderPaysExtra"])


def test_demo_screening_hops_and_scores():
    demo = DEMO["screening"]
    result = screen_payment(
        NAMES["origin"]["name"],
        NAMES["beneficiary"]["name"],
        [demo["intermediaryBic"]],
        [NAMES["correspondent"]["name"]],
    )
    assert [hop.bank_name for hop in result.hops] == [hop["name"] for hop in demo["hops"]]
    assert [hop.decision for hop in result.hops] == [hop["decision"] for hop in demo["hops"]]
    assert result.overall_recommendation == demo["overall"]
    for hop in demo["hops"]:
        assert round(screen_name(hop["name"]).score, 2) == hop["score"]


def test_demo_value_date_skips_the_holiday():
    demo = DEMO["valueDate"]
    result = calculate_value_date(
        dt.datetime.fromisoformat(demo["sentAt"]), demo["currency"], demo["scheme"]
    )
    assert result.cut_off_local == demo["cutOff"]
    assert result.missed_cut_off is True
    assert result.trade_date.isoformat() == demo["tradeDate"]
    assert result.value_date.isoformat() == demo["valueDate"]
    assert result.skipped_holidays == demo["skippedHolidays"]
    assert result.business_days == demo["businessDays"]


def test_demo_mt103_is_clean_on_the_demonstration_date(monkeypatch):
    class _AsOf(dt.date):
        @classmethod
        def today(cls):
            return AS_OF

    # Rule 11 reads date.today(); pin it, or the verdict changes tomorrow.
    monkeypatch.setattr(stp_checker, "date", _AsOf)
    result = stp_checker.check_stp(DEMO["stp"]["message"])
    assert result.verdict == DEMO["stp"]["verdict"]
    assert result.findings == []


def test_demo_tracking_codes_match_the_gpi_mapping():
    for step in DEMO["tracking"]:
        assert iso_transaction_status(step["status"]) == step["code"]


def test_demo_accounts_are_placeholders():
    accounts = [value for key, value in DEMO["ssiSample"] if value.startswith("ACCT-")]
    message = DEMO["stp"]["message"]
    accounts += [message["ordering"]["account"], message["beneficiary"]["account"]]
    assert len(accounts) == 4
    assert all(account.startswith("ACCT-") for account in accounts)


def test_demo_uses_only_the_fictional_institutions():
    names = {NAMES[role]["name"] for role in ("origin", "correspondent", "beneficiary")}
    assert names == {"Harborline Bank", "Meridian Clearing", "Northstar Bank"}
```

- [ ] **Step 2: Run it and watch it fail**

Run: `python -m pytest tests/test_landing_demo_claims.py -q`
Expected: collection error, `FileNotFoundError` for `frontend/src/landing/render/demo.json`.

- [ ] **Step 3: Implement**

Create `frontend/src/landing/render/demo.json`:

```json
{
  "asOf": "2026-10-01",
  "realMoneyMoved": "0.00",
  "payment": {
    "currency": "GBP",
    "amount": 25000,
    "origin": { "name": "Harborline Bank", "place": "Lagos" },
    "correspondent": { "name": "Meridian Clearing", "place": "London" },
    "beneficiary": { "name": "Northstar Bank", "place": "UK" }
  },
  "ledger": [
    { "time": "08:42:10", "event": "pacs.008 received, GBP 25,000.00", "result": "in" },
    { "time": "08:42:11", "event": "IBAN checked, mod-97 valid", "result": "pass" },
    { "time": "08:42:12", "event": "Payee close match, confirmed by the sender", "result": "confirmed" },
    { "time": "08:42:15", "event": "Routed via Meridian Clearing", "result": "hop 2" },
    { "time": "08:47:03", "event": "Credited at Northstar, UETR tracked", "result": "done" }
  ],
  "iban": {
    "value": "GB82WEST12345698765432",
    "groups": ["GB82", "WEST", "1234", "5698", "7654", "32"],
    "countryCode": "GB",
    "length": 22,
    "checkDigits": "82",
    "bankCode": "WEST",
    "sortCode": "123456"
  },
  "ssiSample": [
    ["currency", "GBP"],
    ["beneficiary", "Northstar Bank UK"],
    ["correspondent", "Meridian Clearing London"],
    ["nostro", "ACCT-910016"],
    ["credit to", "ACCT-910021"],
    ["charges", "SHA"],
    ["status", "unverified"]
  ],
  "payee": {
    "entered": "Jon Okafor Ltd",
    "onFile": "Jonathan Okafor Limited",
    "outcome": "CLOSE_MATCH"
  },
  "prepare": {
    "validationValid": true,
    "payeeOutcome": "CLOSE_MATCH",
    "verdicts": { "lenient": "PROCEED_WITH_CAUTION", "standard": "REVIEW", "strict": "STOP" }
  },
  "fees": {
    "intermediaryBic": "MERIGB2LXXX",
    "byChargeCode": {
      "OUR": { "received": 25000.0, "totalFees": 10.0, "senderPaysExtra": 10.0 },
      "SHA": { "received": 24990.0, "totalFees": 10.0, "senderPaysExtra": 0.0 },
      "BEN": { "received": 24965.0, "totalFees": 35.0, "senderPaysExtra": 0.0 }
    }
  },
  "screening": {
    "intermediaryBic": "MERIGB2LXXX",
    "hops": [
      { "name": "Harborline Bank", "score": 0.42, "decision": "CLEAR" },
      { "name": "Meridian Clearing", "score": 0.64, "decision": "CLEAR" },
      { "name": "Northstar Bank", "score": 0.45, "decision": "CLEAR" }
    ],
    "overall": "CLEAR"
  },
  "valueDate": {
    "currency": "CAD",
    "scheme": "eft",
    "sentAt": "2026-06-29T18:00:00",
    "cutOff": "17:00",
    "tradeDate": "2026-06-30",
    "valueDate": "2026-07-02",
    "skippedHolidays": ["2026-07-01"],
    "businessDays": 1
  },
  "stp": {
    "message": {
      "transaction_reference": "REL-25000-GBP",
      "bank_op_code": "CRED",
      "value_date": "2026-10-01",
      "currency": "GBP",
      "interbank_amount": 25000.0,
      "charge_code": "SHA",
      "ordering": { "account": "ACCT-910016", "name": "Harborline Bank" },
      "beneficiary": { "account": "ACCT-910021", "name": "Northstar Bank" },
      "uetr": "3f2b8c1e-6d4a-4f7e-9b21-5c8d0e7a1b64"
    },
    "verdict": "CLEAN"
  },
  "tracking": [
    { "status": "INITIATED", "code": "PDNG" },
    { "status": "ACCEPTED", "code": "ACSP" },
    { "status": "FORWARDED", "code": "ACSP" },
    { "status": "CREDITED", "code": "ACSC" }
  ]
}
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `python -m pytest tests/test_landing_demo_claims.py -q && ruff check tests/test_landing_demo_claims.py`
Expected: `14 passed`, `All checks passed!`

- [ ] **Step 5: Commit**

```bash
git add frontend/src/landing/render/demo.json tests/test_landing_demo_claims.py
git commit -m "feat(landing): add demonstration values verified against the services (landing 4)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The facts export

**Files:**
- Create: `scripts/export_landing_facts.py`
- Create (generated by the script, then committed): `frontend/src/landing/render/facts.fixture.json`
- Test: `tests/test_landing_facts.py`

**Interfaces:**
- Consumes:
  - `seed_if_empty(session) -> dict` (`seed.py:10317`, which commits itself);
  - `build_network(session, scope="all") -> AtlasNetworkResponse` (`atlas.py:138`, `.observed_beneficiary_country_codes`);
  - `list_currencies_with_schemes()`, `get_schemes_for_currency(code)` (keys `country`, `verifiedAsof`, `schemes[].name/speed/limit/cost`) and `get_international_schemes()` (`payment_schemes.py`);
  - `Recommendation` (7 members), `WATCHLIST` (15), and `HOLIDAYS`, `SCHEME_LAGS`, `DEFAULT_LAG_BY_CURRENCY` (`value_date.py`);
  - `stp_checker.RULES` (Task 2) and `LANDING_CORRIDORS` (Task 3).
- Produces:
  - `scripts/export_landing_facts.py` with `seeded_session()` (a context manager), `build_facts(session) -> dict`, `render(facts) -> str`, `export(out: Path) -> dict` and `main(argv=None) -> int`;
  - a CLI, `python scripts/export_landing_facts.py [--out PATH]`, that by default writes `frontend/src/landing/generated/facts.json`;
  - the JSON shape below, whose keys Task 7's zod contract matches exactly:

```text
schemaVersion: 1
directory: {banks, countries}
ssi: {rows, settleableRows, beneficiaryBanks, correspondents}
atlas: {beneficiaryCountries}
corridorRules: {rows, corridors}
rails: {currencyCount, domesticSchemeCount, totalRailCount,
        currencies: [{code, country, verifiedAsOf, schemes: [{name, speed, limit, cost}]}],
        international: {name, speed, limit, cost, verifiedAsOf}}
tools: {verdicts, watchlistEntries, holidayCalendars, settlementLagDays: {min, max}, stpRules}
corridors: [{currency, origin: {city, country, lat, lon}, destination: {...}, source: "case" | "rule"}]
```

The export never opens `config.DATABASE_URL`. Importing `app.db` still builds the default engine, but SQLAlchemy connects lazily; the test proves it with an unreachable Postgres URL (psycopg2 is installed, so the URL parses). The script puts its own checkout first on `sys.path`, so a shared editable install cannot import another worktree's `app`. It runs in about 2.5 seconds.

Facts are not committed. The committed fixture is a sample for the render tests; `test_shape_matches_the_committed_render_fixture` keeps its shape equal to the export's, and Task 7's contract keeps it equal to the zod schema.

- [ ] **Step 1: Write the failing test**

Create `tests/test_landing_facts.py`:

```python
"""The landing facts export: deterministic, isolated, and equal to the data.

Facts are generated at landing-build time and never committed. These tests pin
the export's behaviour instead of its output, so a change to the seed data
never fails a PR.
"""
import importlib.util
import json
import os
import subprocess
import sys
from pathlib import Path

import pytest
from sqlalchemy import distinct, func, select

from app.data.landing_corridors import LANDING_CORRIDORS
from app.data.payment_schemes import list_currencies_with_schemes
from app.models import SSI, Bank, CorridorRule

REPO_ROOT = Path(__file__).resolve().parents[1]
SCRIPT = REPO_ROOT / "scripts" / "export_landing_facts.py"
FIXTURE = REPO_ROOT / "frontend" / "src" / "landing" / "render" / "facts.fixture.json"

_spec = importlib.util.spec_from_file_location("export_landing_facts", SCRIPT)
export_landing_facts = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(export_landing_facts)


@pytest.fixture(scope="module")
def exported():
    with export_landing_facts.seeded_session() as session:
        facts = export_landing_facts.build_facts(session)
        direct = {
            "banks": session.scalar(select(func.count()).select_from(Bank)),
            "bank_countries": session.scalar(select(func.count(distinct(Bank.country_code)))),
            "ssi": session.scalar(select(func.count()).select_from(SSI)),
            "settleable": session.scalar(
                select(func.count()).select_from(SSI).where(SSI.bic_only.is_(False))
            ),
            "beneficiaries": session.scalar(select(func.count(distinct(SSI.beneficiary_bic)))),
            "correspondents": session.scalar(select(func.count(distinct(SSI.intermediary_bic)))),
            "rules": session.scalar(select(func.count()).select_from(CorridorRule)),
            "corridors": len(
                set(
                    session.execute(
                        select(CorridorRule.destination_currency, CorridorRule.destination_country)
                    ).all()
                )
            ),
        }
    return facts, direct


def _shape(value):
    if isinstance(value, dict):
        return {key: _shape(item) for key, item in value.items()}
    if isinstance(value, list):
        shapes = [_shape(item) for item in value]
        assert all(shape == shapes[0] for shape in shapes), "list items differ in shape"
        return [shapes[0]] if shapes else []
    if isinstance(value, bool):
        return "bool"
    if isinstance(value, (int, float)):
        return "number"
    return type(value).__name__


def test_counts_equal_direct_queries_on_the_same_session(exported):
    facts, direct = exported
    assert facts["directory"] == {"banks": direct["banks"], "countries": direct["bank_countries"]}
    assert facts["ssi"] == {
        "rows": direct["ssi"],
        "settleableRows": direct["settleable"],
        "beneficiaryBanks": direct["beneficiaries"],
        "correspondents": direct["correspondents"],
    }
    assert facts["corridorRules"] == {"rows": direct["rules"], "corridors": direct["corridors"]}


def test_rails_follow_the_scheme_reference_data(exported):
    rails = exported[0]["rails"]
    assert [c["code"] for c in rails["currencies"]] == list_currencies_with_schemes()
    assert rails["currencyCount"] == len(rails["currencies"])
    assert rails["domesticSchemeCount"] == sum(len(c["schemes"]) for c in rails["currencies"])
    assert rails["totalRailCount"] == rails["domesticSchemeCount"] + 1
    assert rails["international"]["name"] == "SWIFT gpi"


def test_corridors_carry_no_bank_identifiers(exported):
    corridors = exported[0]["corridors"]
    assert [c["currency"] for c in corridors] == [c["currency"] for c in LANDING_CORRIDORS]
    assert {c["source"] for c in corridors} <= {"case", "rule"}
    assert "XXX" not in json.dumps(corridors)


def test_shape_matches_the_committed_render_fixture(exported):
    fixture = json.loads(FIXTURE.read_text(encoding="utf-8"))
    assert _shape(exported[0]) == _shape(fixture)


def test_export_is_deterministic(tmp_path):
    first, second = tmp_path / "a.json", tmp_path / "b.json"
    export_landing_facts.export(first)
    export_landing_facts.export(second)
    assert first.read_bytes() == second.read_bytes()


def test_export_never_opens_database_url(tmp_path):
    out = tmp_path / "facts.json"
    env = os.environ.copy()
    env.pop("VERCEL", None)
    # Unreachable on purpose: the export must never connect to it.
    env["DATABASE_URL"] = "postgresql://relay:relay@127.0.0.1:1/unreachable"
    result = subprocess.run(
        [sys.executable, str(SCRIPT), "--out", str(out)],
        cwd=REPO_ROOT,
        env=env,
        capture_output=True,
        text=True,
        check=False,
        timeout=120,
    )
    assert result.returncode == 0, result.stderr
    assert json.loads(out.read_text(encoding="utf-8"))["schemaVersion"] == 1
```

- [ ] **Step 2: Run it and watch it fail**

Run: `python -m pytest tests/test_landing_facts.py -q`
Expected: collection error, `FileNotFoundError` for `scripts/export_landing_facts.py`.

- [ ] **Step 3: Implement**

Create `scripts/export_landing_facts.py`:

```python
#!/usr/bin/env python3
"""Export the facts the landing page states about Relay.

Every count on the landing page comes from here. The export seeds a private
in-memory SQLite database with the app's own seed code and queries it, so the
numbers describe the reference data shipped at this commit. It never opens
config.DATABASE_URL, whatever that points at.

Usage: python scripts/export_landing_facts.py [--out PATH]
"""
from __future__ import annotations

import argparse
import json
import sys
from contextlib import contextmanager
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
# Resolve `app` from this checkout, not from wherever an editable install points.
sys.path.insert(0, str(REPO_ROOT))

from sqlalchemy import create_engine, distinct, func, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.data.landing_corridors import LANDING_CORRIDORS
from app.data.payment_schemes import (
    get_international_schemes,
    get_schemes_for_currency,
    list_currencies_with_schemes,
)
from app.data.sanctions_watchlist import WATCHLIST
from app.db import Base
from app.models import SSI, Bank, CorridorRule
from app.services.atlas import build_network
from app.services.recommendation import Recommendation
from app.services.seed import seed_if_empty
from app.services.stp_checker import RULES as STP_RULES
from app.services.value_date import DEFAULT_LAG_BY_CURRENCY, HOLIDAYS, SCHEME_LAGS

DEFAULT_OUT = REPO_ROOT / "frontend" / "src" / "landing" / "generated" / "facts.json"
SCHEMA_VERSION = 1


@contextmanager
def seeded_session():
    """A session on a fresh, private, seeded in-memory database."""
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
        future=True,
    )
    try:
        Base.metadata.create_all(bind=engine)
        factory = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)
        with factory() as session:
            seed_if_empty(session)
            yield session
    finally:
        engine.dispose()


def _count(session: Session, statement) -> int:
    return int(session.scalar(statement) or 0)


def _scheme(entry: dict) -> dict:
    return {
        "name": entry["name"],
        "speed": entry["speed"],
        "limit": entry["limit"],
        "cost": entry["cost"],
    }


def _rails() -> dict:
    currencies = []
    for code in list_currencies_with_schemes():
        data = get_schemes_for_currency(code)
        currencies.append(
            {
                "code": code,
                "country": data["country"],
                "verifiedAsOf": data["verifiedAsof"],
                "schemes": [_scheme(s) for s in data["schemes"]],
            }
        )
    international = get_international_schemes()
    domestic = sum(len(c["schemes"]) for c in currencies)
    return {
        "currencyCount": len(currencies),
        "domesticSchemeCount": domestic,
        "totalRailCount": domestic + 1,
        "currencies": currencies,
        "international": {**_scheme(international), "verifiedAsOf": international["verifiedAsof"]},
    }


def _tools() -> dict:
    lags = set(SCHEME_LAGS.values()) | set(DEFAULT_LAG_BY_CURRENCY.values())
    return {
        "verdicts": len(Recommendation),
        "watchlistEntries": len(WATCHLIST),
        "holidayCalendars": len(HOLIDAYS),
        "settlementLagDays": {"min": min(lags), "max": max(lags)},
        "stpRules": len(STP_RULES),
    }


def _corridors() -> list:
    out = []
    for corridor in LANDING_CORRIDORS:
        out.append(
            {
                "currency": corridor["currency"],
                "origin": dict(corridor["origin"]),
                "destination": dict(corridor["destination"]),
                # Only the kind reaches the page: rule sources name real banks.
                "source": corridor["source"]["kind"],
            }
        )
    return out


def build_facts(session: Session) -> dict:
    network = build_network(session)
    return {
        "schemaVersion": SCHEMA_VERSION,
        "directory": {
            "banks": _count(session, select(func.count()).select_from(Bank)),
            "countries": _count(session, select(func.count(distinct(Bank.country_code)))),
        },
        "ssi": {
            "rows": _count(session, select(func.count()).select_from(SSI)),
            "settleableRows": _count(
                session, select(func.count()).select_from(SSI).where(SSI.bic_only.is_(False))
            ),
            "beneficiaryBanks": _count(session, select(func.count(distinct(SSI.beneficiary_bic)))),
            "correspondents": _count(session, select(func.count(distinct(SSI.intermediary_bic)))),
        },
        "atlas": {"beneficiaryCountries": len(network.observed_beneficiary_country_codes)},
        "corridorRules": {
            "rows": _count(session, select(func.count()).select_from(CorridorRule)),
            "corridors": _count(
                session,
                select(func.count()).select_from(
                    select(CorridorRule.destination_currency, CorridorRule.destination_country)
                    .distinct()
                    .subquery()
                ),
            ),
        },
        "rails": _rails(),
        "tools": _tools(),
        "corridors": _corridors(),
    }


def render(facts: dict) -> str:
    return json.dumps(facts, indent=2, sort_keys=True, ensure_ascii=False) + "\n"


def export(out: Path) -> dict:
    with seeded_session() as session:
        facts = build_facts(session)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(render(facts), encoding="utf-8")
    return facts


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    args = parser.parse_args(argv)
    export(args.out)
    print(f"landing facts written to {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

Then generate the committed fixture from the real data:

Run: `python scripts/export_landing_facts.py --out frontend/src/landing/render/facts.fixture.json`
Expected: `landing facts written to frontend/src/landing/render/facts.fixture.json`. On `origin/main` (2026-10-02) its counts were:
- banks 761, countries 152;
- SSI rows 12,196, settleable 5,636;
- beneficiary banks 763, correspondents 1,167;
- Atlas 156;
- corridors 29 over 72 rule rows;
- 10 currencies, 34 domestic schemes, 35 rails;
- tools: 7 verdicts, 15 watchlist entries, 10 calendars, lags T+0 to T+2, 14 STP rules.

Your numbers may be higher if seed data has grown. That is expected; the tests compare shape and queries, not values.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `python -m pytest tests/test_landing_facts.py -q && ruff check scripts/export_landing_facts.py tests/test_landing_facts.py`
Expected: `6 passed` (about 7 seconds), `All checks passed!`

Run: `git status --short frontend/src/landing/generated 2>/dev/null; git check-ignore -q frontend/src/landing/generated/facts.json && echo ignored`
Expected: `ignored`. The default output path never shows up as untracked.

- [ ] **Step 5: Commit**

```bash
git add scripts/export_landing_facts.py tests/test_landing_facts.py frontend/src/landing/render/facts.fixture.json
git commit -m "feat(landing): export page facts from a private seeded database (landing 5)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: The globe point set

**Files:**
- Create: `frontend/scripts/build-globe-points.mjs`
- Test: `frontend/scripts/build-globe-points.test.ts`

**Interfaces:**
- Consumes: `frontend/src/features/explore/atlas/assets/countries-50m.json` (world-atlas 2.0.2 TopoJSON; `objects.countries`, 241 geometries, Antarctica id `"010"`); `geoBounds` and `geoContains` from `d3-geo` 3.1.1; `feature` from `topojson-client` 3.1.0.
- Produces:
  - `buildGlobePoints(topology, sampleCount = 22000) -> number[]`, a flat `[lat, lon, …]` list at one decimal place;
  - `writeGlobePoints(out?) -> number`, which returns the point count;
  - the exports `TOPOLOGY_PATH`, `DEFAULT_OUT` (`frontend/src/landing/generated/globe-points.json`) and `SAMPLE_COUNT`;
  - a CLI, `node scripts/build-globe-points.mjs [out]`.

  Task 13's client imports the output as a URL; Task 12's globe fetches and decodes it.

It takes 22,000 Fibonacci-sphere samples and keeps those on land: 5,785 points, 19,730 bytes gzip. A per-polygon bounding-box prefilter keeps the exact spherical `geoContains` to one or two polygons per point. Without it, a single `geoContains` against the merged land polygon takes 134 seconds. Output is byte-identical either way; this version takes 2.7 seconds.

- [ ] **Step 1: Write the failing test**

Create `frontend/scripts/build-globe-points.test.ts`:

```ts
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { buildGlobePoints, TOPOLOGY_PATH } from "./build-globe-points.mjs";

const POINTS_BUDGET_GZIP_BYTES = 20 * 1024;

describe("globe point set", () => {
  const topology = JSON.parse(readFileSync(TOPOLOGY_PATH, "utf8"));
  const points: number[] = buildGlobePoints(topology);
  const json = JSON.stringify(points);

  it("is a flat list of [lat, lon] pairs at one decimal place", () => {
    expect(points.length % 2).toBe(0);
    for (let i = 0; i < points.length; i += 2) {
      const [lat, lon] = [points[i], points[i + 1]];
      expect(lat).toBeGreaterThanOrEqual(-90);
      expect(lat).toBeLessThanOrEqual(90);
      expect(lon).toBeGreaterThanOrEqual(-180);
      expect(lon).toBeLessThanOrEqual(180);
      expect(Math.round(lat * 10) / 10).toBe(lat);
      expect(Math.round(lon * 10) / 10).toBe(lon);
    }
  });

  it("covers land, not the oceans or Antarctica", () => {
    const pairs = points.length / 2;
    expect(pairs).toBeGreaterThan(5000);
    expect(pairs).toBeLessThan(7000);
    for (let i = 0; i < points.length; i += 2) expect(points[i]).toBeGreaterThan(-60);
  });

  it("is deterministic", () => {
    const again = JSON.stringify(buildGlobePoints(topology));
    const hash = (s: string) => createHash("sha256").update(s).digest("hex");
    expect(hash(again)).toBe(hash(json));
  });

  it("fits the 20KB gzip budget", () => {
    expect(gzipSync(json).length).toBeLessThanOrEqual(POINTS_BUDGET_GZIP_BYTES);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd frontend && npx vitest run scripts/build-globe-points.test.ts`
Expected: FAIL. The import of `./build-globe-points.mjs` cannot be resolved.

- [ ] **Step 3: Implement**

Create `frontend/scripts/build-globe-points.mjs`:

```js
/**
 * Build the landing globe's land points from the Atlas map topology.
 *
 * Samples an even Fibonacci point set over the sphere and keeps the points that
 * fall on land (Antarctica excluded), as a flat [lat, lon, lat, lon, ...] array
 * at one decimal place (0.1° is about 11km). The output is a fetched asset, so
 * the landing JavaScript budget does not carry it.
 *
 * Usage: node scripts/build-globe-points.mjs [out]
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { geoBounds, geoContains } from "d3-geo";
import { feature } from "topojson-client";

const HERE = dirname(fileURLToPath(import.meta.url));
export const TOPOLOGY_PATH = resolve(HERE, "../src/features/explore/atlas/assets/countries-50m.json");
export const DEFAULT_OUT = resolve(HERE, "../src/landing/generated/globe-points.json");
export const SAMPLE_COUNT = 22000;
const ANTARCTICA = "010";
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

/**
 * Land polygons with their bounding boxes. Testing a point against every
 * polygon's box first keeps the exact spherical test to one or two polygons.
 */
function landPolygons(topology) {
  const polygons = [];
  for (const country of feature(topology, topology.objects.countries).features) {
    if (country.id === ANTARCTICA || !country.geometry) continue;
    const { type, coordinates } = country.geometry;
    const parts = type === "Polygon" ? [coordinates] : type === "MultiPolygon" ? coordinates : [];
    for (const rings of parts) {
      const polygon = { type: "Polygon", coordinates: rings };
      const [[west, south], [east, north]] = geoBounds(polygon);
      polygons.push({ polygon, west, south, east, north });
    }
  }
  return polygons;
}

function onLand(polygons, lon, lat) {
  return polygons.some(
    (p) =>
      lat >= p.south &&
      lat <= p.north &&
      // A box that crosses the antimeridian has west > east.
      (p.west <= p.east ? lon >= p.west && lon <= p.east : lon >= p.west || lon <= p.east) &&
      geoContains(p.polygon, [lon, lat]),
  );
}

export function buildGlobePoints(topology, sampleCount = SAMPLE_COUNT) {
  const polygons = landPolygons(topology);
  const points = [];
  for (let i = 0; i < sampleCount; i++) {
    const y = 1 - (2 * (i + 0.5)) / sampleCount;
    const lat = (Math.asin(y) * 180) / Math.PI;
    let lon = ((GOLDEN_ANGLE * i * 180) / Math.PI) % 360;
    if (lon > 180) lon -= 360;
    if (onLand(polygons, lon, lat)) points.push(Number(lat.toFixed(1)), Number(lon.toFixed(1)));
  }
  return points;
}

export function writeGlobePoints(out = DEFAULT_OUT) {
  const topology = JSON.parse(readFileSync(TOPOLOGY_PATH, "utf8"));
  const points = buildGlobePoints(topology);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(points));
  return points.length / 2;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = process.argv[2] ? resolve(process.argv[2]) : DEFAULT_OUT;
  console.log(`globe points: ${writeGlobePoints(out)} written to ${out}`);
}
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `cd frontend && npx vitest run scripts/build-globe-points.test.ts`
Expected: `4 passed` (about 6 seconds).

Run: `cd frontend && node scripts/build-globe-points.mjs && git status --short src/landing`
Expected: `globe points: 5785 written to …/src/landing/generated/globe-points.json`, and no untracked file listed (Task 1 ignored `generated/`).

- [ ] **Step 5: Commit**

```bash
git add frontend/scripts/build-globe-points.mjs frontend/scripts/build-globe-points.test.ts
git commit -m "feat(landing): generate the globe land points from the Atlas topology (landing 6)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: The facts contract and derived content

**Files:**
- Create: `frontend/src/landing/render/facts.ts`, `demo.ts`, `format.ts`, `content.ts`
- Test: `frontend/src/landing/render/content.test.ts`

**Interfaces:**
- Consumes:
  - `facts.fixture.json` (Task 5) and `demo.json` (Task 4);
  - `CURRICULUM: CurriculumModule[]` (`{id, title, subtitle, href, duration: {min, max}, prerequisites, outcomes, category: "core" | "tool" | "capstone"}`; `href` is relative to the SPA basename, e.g. `/learn/lab-1`);
  - `QUESTION_BANK: PracticeQuestion[]` (`{id, moduleId, question, options}`);
  - `DRILL_SIZE = 5` from `practice/selectDaily.ts`;
  - `CASE_CATALOG: readonly AuthoredCaseDefinition[]` (`.id`, `.recommendation.corridorLabel`).
- Produces:
  - `LandingFactsSchema` (zod, strict objects), `type LandingFacts`, `type RailCurrency`, `type Corridor`, and `parseLandingFacts(value: unknown): LandingFacts`;
  - `DEMO: Demo` and `type Demo`;
  - `formatCount`, `formatAmount`, `formatHours(minutes)` and `pad2`;
  - `appHref(href)`, `learnSummary(): LearnSummary`, `RAIL_TAB_ORDER: string[]`, `orderedRails(facts): RailCurrency[]` and `railHighlights(facts): {code, scheme}[]`.

`labRegistry.tsx` must not be imported here: it lazy-loads 16 lab components, which import 25 CSS files. The lab count is `CURRICULUM.length`, which `labRegistry.test.ts` already keeps one-to-one with the registry. `selectDaily.ts`'s `practiceStore` import is `import type`, so it is erased.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/landing/render/content.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { CASE_CATALOG } from "../../features/learn/cases/caseCatalog";
import { CURRICULUM } from "../../features/learn/curriculum";
import { QUESTION_BANK } from "../../features/learn/practice/questionBank";
import { appHref, learnSummary, orderedRails, RAIL_TAB_ORDER, railHighlights } from "./content";
import fixture from "./facts.fixture.json";
import { parseLandingFacts } from "./facts";
import { formatAmount, formatCount, formatHours, pad2 } from "./format";

const facts = parseLandingFacts(fixture);

describe("landing facts contract", () => {
  it("accepts the committed fixture and rejects drift", () => {
    expect(() => parseLandingFacts({ ...fixture, extra: 1 })).toThrow();
    expect(() => parseLandingFacts({ ...fixture, schemaVersion: 2 })).toThrow();
    expect(() => parseLandingFacts({ ...fixture, corridors: [] })).toThrow();
    expect(() => parseLandingFacts({ ...fixture, directory: { banks: -1, countries: 1 } })).toThrow();
  });
});

describe("content derived from the frontend's data modules", () => {
  const learn = learnSummary();

  it("lists every curriculum entry, in order, as an /app link", () => {
    expect(learn.modules.map((m) => m.title)).toEqual(CURRICULUM.map((m) => m.title));
    expect(learn.modules.map((m) => m.href)).toEqual(CURRICULUM.map((m) => `/app${m.href}`));
    expect(learn.modules.at(-1)!.kind).toBe("capstone");
    expect(learn.coreCount).toBe(CURRICULUM.filter((m) => m.category === "core").length);
  });

  it("counts questions, practice modules and cases from their sources", () => {
    expect(learn.questionCount).toBe(QUESTION_BANK.length);
    expect(learn.practiceModuleCount).toBe(new Set(QUESTION_BANK.map((q) => q.moduleId)).size);
    expect(learn.caseCount).toBe(CASE_CATALOG.length);
    expect(learn.caseCorridors).toEqual(CASE_CATALOG.map((c) => c.recommendation.corridorLabel));
    expect(learn.firstCaseHref).toBe(`/app/learn/cases/${CASE_CATALOG[0].id}`);
  });

  it("refuses an href that is not an absolute SPA path", () => {
    expect(appHref("/learn/lab-1")).toBe("/app/learn/lab-1");
    expect(() => appHref("learn/lab-1")).toThrow();
  });

  it("keeps the rail tab order a permutation of the scheme data", () => {
    expect([...RAIL_TAB_ORDER].sort()).toEqual(facts.rails.currencies.map((c) => c.code).sort());
    expect(orderedRails(facts).map((c) => c.code)).toEqual(RAIL_TAB_ORDER);
    const missing = { ...facts, rails: { ...facts.rails, currencies: facts.rails.currencies.slice(1) } };
    expect(() => orderedRails(missing)).toThrow(/out of step/);
  });

  it("looks the lede's scheme names up in the data", () => {
    expect(railHighlights(facts).map((h) => h.code)).toEqual(["CAD", "GBP", "GBP", "KES", "INR"]);
    const noInterac = {
      ...facts,
      rails: {
        ...facts.rails,
        currencies: facts.rails.currencies.map((c) => (c.code === "CAD" ? { ...c, schemes: c.schemes.filter((s) => !s.name.startsWith("Interac")) } : c)),
      },
    };
    expect(() => railHighlights(noInterac)).toThrow(/Interac/);
  });

  it("formats numbers one way", () => {
    expect(formatCount(12196)).toBe("12,196");
    expect(formatAmount(25000)).toBe("25,000.00");
    expect(formatHours(270)).toBe("4.5");
    expect(formatHours(360)).toBe("6");
    expect(pad2(7)).toBe("07");
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd frontend && npx vitest run src/landing/render/content.test.ts`
Expected: FAIL. `./content` cannot be resolved.

- [ ] **Step 3: Implement**

Create `frontend/src/landing/render/facts.ts`:

```ts
/**
 * The landing facts contract. scripts/export_landing_facts.py writes it at
 * landing-build time; the renderer parses it here and fails the build on any
 * drift. Strict objects reject unknown keys, so a renamed field cannot pass.
 */
import { z } from "zod";

const count = z.number().int().nonnegative();
const currencyCode = z.string().regex(/^[A-Z]{3}$/);
const yearMonth = z.string().regex(/^\d{4}-\d{2}$/);

const place = z.strictObject({
  city: z.string().min(1),
  country: z.string().regex(/^[A-Z]{2}$/),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
});

const scheme = z.strictObject({
  name: z.string().min(1),
  speed: z.string().min(1),
  limit: z.string().min(1),
  cost: z.string().min(1),
});

export const LandingFactsSchema = z.strictObject({
  schemaVersion: z.literal(1),
  directory: z.strictObject({ banks: count, countries: count }),
  ssi: z.strictObject({
    rows: count,
    settleableRows: count,
    beneficiaryBanks: count,
    correspondents: count,
  }),
  atlas: z.strictObject({ beneficiaryCountries: count }),
  corridorRules: z.strictObject({ rows: count, corridors: count }),
  rails: z.strictObject({
    currencyCount: count,
    domesticSchemeCount: count,
    totalRailCount: count,
    currencies: z
      .array(
        z.strictObject({
          code: currencyCode,
          country: z.string().min(1),
          verifiedAsOf: yearMonth,
          schemes: z.array(scheme).min(1),
        }),
      )
      .min(1),
    international: z.strictObject({
      name: z.string().min(1),
      speed: z.string().min(1),
      limit: z.string().min(1),
      cost: z.string().min(1),
      verifiedAsOf: yearMonth,
    }),
  }),
  tools: z.strictObject({
    verdicts: count,
    watchlistEntries: count,
    holidayCalendars: count,
    settlementLagDays: z.strictObject({ min: count, max: count }),
    stpRules: count,
  }),
  corridors: z
    .array(
      z.strictObject({
        currency: currencyCode,
        origin: place,
        destination: place,
        source: z.enum(["case", "rule"]),
      }),
    )
    .min(1)
    .max(8),
});

export type LandingFacts = z.infer<typeof LandingFactsSchema>;
export type RailCurrency = LandingFacts["rails"]["currencies"][number];
export type Corridor = LandingFacts["corridors"][number];

export function parseLandingFacts(value: unknown): LandingFacts {
  return LandingFactsSchema.parse(value);
}
```

Create `frontend/src/landing/render/demo.ts`:

```ts
/**
 * Demonstration values: the fictional payment, its illustrative timestamps,
 * the example IBAN, the sample SSI record and the tool examples. Every value
 * that claims a computed result is asserted against the real Relay code by
 * tests/test_landing_demo_claims.py, which reads the same demo.json.
 */
import demo from "./demo.json";

export type Demo = typeof demo;
export const DEMO: Demo = demo;
```

Create `frontend/src/landing/render/format.ts`:

```ts
/** Number formatting for the landing page. One locale, so counts read the same everywhere. */
const LOCALE = "en-GB";

export function formatCount(value: number): string {
  return value.toLocaleString(LOCALE);
}

export function formatAmount(value: number): string {
  return value.toLocaleString(LOCALE, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Minutes as hours with at most one decimal place: 270 -> "4.5", 360 -> "6". */
export function formatHours(minutes: number): string {
  return String(Math.round((minutes / 60) * 10) / 10);
}

export function pad2(value: number): string {
  return String(value).padStart(2, "0");
}
```

Create `frontend/src/landing/render/content.ts`:

```ts
/**
 * Content the renderer derives from the frontend's own data modules. These are
 * pure data with no CSS, DOM, environment or network access, so the build-time
 * renderer can import them (scripts/check-landing-boundary.mjs enforces the list).
 */
import { CASE_CATALOG } from "../../features/learn/cases/caseCatalog";
import { CURRICULUM } from "../../features/learn/curriculum";
import { QUESTION_BANK } from "../../features/learn/practice/questionBank";
import { DRILL_SIZE } from "../../features/learn/practice/selectDaily";
import type { LandingFacts, RailCurrency } from "./facts";
import { pad2 } from "./format";

export interface ModuleLink {
  number: string;
  title: string;
  href: string;
  kind: "lab" | "capstone";
}

export interface LearnSummary {
  modules: ModuleLink[];
  coreCount: number;
  labCount: number;
  questionCount: number;
  practiceModuleCount: number;
  drillSize: number;
  caseCount: number;
  caseCorridors: string[];
  firstCaseHref: string;
  firstModuleHref: string;
  minutes: { min: number; max: number };
}

/** Curriculum hrefs are relative to the SPA basename (/app). */
export function appHref(href: string): string {
  if (!href.startsWith("/")) throw new Error(`expected an absolute SPA path, got ${href}`);
  return `/app${href}`;
}

export function learnSummary(): LearnSummary {
  const modules = CURRICULUM.map((module, index): ModuleLink => ({
    number: pad2(index + 1),
    title: module.title,
    href: appHref(module.href),
    kind: module.category === "capstone" ? "capstone" : "lab",
  }));
  const first = CASE_CATALOG[0];
  if (!first) throw new Error("the Case Desk catalog is empty");
  return {
    modules,
    coreCount: CURRICULUM.filter((module) => module.category === "core").length,
    // labRegistry.test.ts pins one lab per curriculum entry.
    labCount: CURRICULUM.length,
    questionCount: QUESTION_BANK.length,
    practiceModuleCount: new Set(QUESTION_BANK.map((question) => question.moduleId)).size,
    drillSize: DRILL_SIZE,
    caseCount: CASE_CATALOG.length,
    caseCorridors: CASE_CATALOG.map((entry) => entry.recommendation.corridorLabel),
    firstCaseHref: `/app/learn/cases/${first.id}`,
    firstModuleHref: modules[0].href,
    minutes: {
      min: CURRICULUM.reduce((sum, module) => sum + module.duration.min, 0),
      max: CURRICULUM.reduce((sum, module) => sum + module.duration.max, 0),
    },
  };
}

/** Tab order for section 03: the demonstration currency first, then CAD for Interac. */
export const RAIL_TAB_ORDER = ["GBP", "CAD", "USD", "EUR", "NGN", "KES", "INR", "AUD", "JPY", "AED"];

export function orderedRails(facts: LandingFacts): RailCurrency[] {
  const byCode = new Map(facts.rails.currencies.map((currency) => [currency.code, currency]));
  const missing = facts.rails.currencies.filter((c) => !RAIL_TAB_ORDER.includes(c.code));
  if (missing.length > 0 || byCode.size !== RAIL_TAB_ORDER.length) {
    throw new Error(
      `RAIL_TAB_ORDER is out of step with the scheme data: ${facts.rails.currencies.map((c) => c.code).join(", ")}`,
    );
  }
  return RAIL_TAB_ORDER.map((code) => byCode.get(code)!);
}

/** Scheme names quoted in the section 03 lede, looked up in the data so they cannot drift. */
const HIGHLIGHTS: Array<[string, string]> = [
  ["CAD", "Interac"],
  ["GBP", "Faster Payments"],
  ["GBP", "CHAPS"],
  ["KES", "M-Pesa"],
  ["INR", "UPI"],
];

export function railHighlights(facts: LandingFacts): Array<{ code: string; scheme: string }> {
  return HIGHLIGHTS.map(([code, prefix]) => {
    const currency = facts.rails.currencies.find((c) => c.code === code);
    const scheme = currency?.schemes.find((s) => s.name.startsWith(prefix));
    if (!scheme) throw new Error(`no ${prefix} scheme for ${code} in the scheme data`);
    return { code, scheme: scheme.name };
  });
}
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `cd frontend && npx vitest run src/landing/render/content.test.ts && npx tsc --noEmit`
Expected: `7 passed`, then no `tsc` output.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/landing/render/facts.ts frontend/src/landing/render/demo.ts frontend/src/landing/render/format.ts frontend/src/landing/render/content.ts frontend/src/landing/render/content.test.ts
git commit -m "feat(landing): add the facts contract and content derived from app data (landing 7)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Landing tokens and styles

**Files:**
- Create: `frontend/src/landing/client/styles/tokens.css`, `frontend/src/landing/client/styles/landing.css`
- Create: `frontend/src/test/contrast.ts`
- Modify: `frontend/src/design-system/contrast.test.ts` (lines 24–44: its private maths move to the shared helper)
- Test: `frontend/src/landing/client/styles/palette.test.ts`

**Interfaces:**
- Produces:
  - `luminance(hex)` and `contrastRatio(fg, bg)` in `src/test/contrast.ts`;
  - the CSS custom properties every later task uses (`--bg`, `--surface`, `--ink`, `--ink2`, `--muted`, `--acc`, `--line`, `--band*`, `--g*` for the globe, `--c1`…`--c8`, `--font-sans`, `--font-mono`);
  - the class names Task 9's markup uses.

  These state hooks work without any script:
  - `html.js` (JavaScript runs) and `html.motion` (motion allowed), both set in Task 13;
  - `.panels.ready`, `.stage.off` and `.on`;
  - `[hidden]`, forced to `display: none !important`.

`tokens.css` is the prototype's token blocks (`docs/design/landing-prototype/index.html:39-87`) with one addition, `--onAcc`, for text on the primary fill. A script compared every token in every theme block against the prototype. `landing.css` is the prototype's component styles with these changes:
- inline styles become classes (`.flush`, `.dim`, `.caption`, `.who`, `.replay`, `.rows`, `.cal .sent`, `.sw1`…`.sw8`, `.t1`…`.t3`);
- legend cells are `<button>`s;
- the Menu is a `<details>` disclosure;
- final states are keyed off `html:not(.motion)`, and JavaScript-only parts off `html:not(.js)`;
- font stacks use metric-matched fallbacks (computed with fontTools from the woff2 and system Arial and Courier New metrics);
- mask gradients use `black`, so the file holds no hex.

The black block repeats every dark token, so it renders correctly under an OS light setting.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/landing/client/styles/palette.test.ts`:

```ts
/// <reference types="node" />
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { contrastRatio } from "../../../test/contrast";

/**
 * The landing palette (DESIGN.md "Colour" and "Dark and black themes"), parsed
 * from tokens.css as shipped. Pins every ramp and categorical hex, and holds
 * every text pair the page uses to WCAG 2.2 AA in light, dark and black.
 */
const CSS = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "tokens.css"), "utf8");
const LANDING_CSS = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "landing.css"), "utf8");

type Tokens = Record<string, string>;

function block(css: string, opener: RegExp): string {
  const match = opener.exec(css);
  if (!match) throw new Error(`block not found: ${opener}`);
  let depth = 1;
  let i = match.index + match[0].length;
  const start = i;
  while (depth > 0) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}") depth--;
    i++;
  }
  return css.slice(start, i - 1);
}

function declarations(body: string): Tokens {
  const out: Tokens = {};
  for (const [, name, value] of body.matchAll(/(--[\w]+)\s*:\s*([^;]+);/g)) out[name] = value.trim();
  return out;
}

const LIGHT = declarations(block(CSS, /^:root\s*\{/m));
const DARK_MEDIA = declarations(block(block(CSS, /@media \(prefers-color-scheme: dark\)\s*\{/), /:root:not\(\[data-theme="light"\]\)\s*\{/));
const DARK_EXPLICIT = declarations(block(CSS, /^:root\[data-theme="dark"\]\s*\{/m));
const BLACK_EXPLICIT = declarations(block(CSS, /^:root\[data-theme="black"\]\s*\{/m));
const THEMES: Record<string, Tokens> = {
  light: LIGHT,
  dark: { ...LIGHT, ...DARK_EXPLICIT },
  black: { ...LIGHT, ...BLACK_EXPLICIT },
};

function resolveToken(scope: Tokens, name: string, seen = new Set<string>()): string {
  const value = scope[name];
  if (value === undefined) throw new Error(`undefined token ${name}`);
  const reference = /^var\((--[\w]+)\)$/.exec(value);
  if (!reference) return value;
  if (seen.has(name)) throw new Error(`cycle at ${name}`);
  seen.add(name);
  return resolveToken(scope, reference[1], seen);
}

/** rgba(r, g, b, a) over an opaque #rrggbb, as #rrggbb. */
function flatten(colour: string, under: string): string {
  if (colour.startsWith("#")) return colour.toUpperCase();
  const m = /rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/.exec(colour);
  if (!m) throw new Error(`not a colour: ${colour}`);
  const base = [1, 3, 5].map((i) => parseInt(under.slice(i, i + 2), 16));
  const alpha = Number(m[4]);
  const mixed = [1, 2, 3].map((i, k) => Math.round(Number(m[i]) * alpha + base[k] * (1 - alpha)));
  return `#${mixed.map((v) => v.toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

function ratio(theme: string, fg: string, bg: string, under = "--bg"): number {
  const scope = THEMES[theme];
  const ground = flatten(resolveToken(scope, under), "#FFFFFF");
  const background = flatten(resolveToken(scope, bg), ground);
  return contrastRatio(flatten(resolveToken(scope, fg), background), background);
}

describe("landing palette", () => {
  it("pins the primary and neutral ramps", () => {
    const ramp = (prefix: string, steps: number[]) => steps.map((s) => resolveToken(LIGHT, `--${prefix}${s}`));
    expect(ramp("p", [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950])).toEqual([
      "#F5F6FE", "#EAEDFF", "#D8DEFF", "#BBC4FF", "#95A0FF", "#7277FF", "#533AFD", "#472CDD", "#351DAE", "#23107D", "#16065A",
    ]);
    expect(ramp("n", [0, 25, 50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950])).toEqual([
      "#F9FAFC", "#F4F7FA", "#EFF3F8", "#E5EAF1", "#D1D8E1", "#B2BCC8", "#8693A5", "#5F6F85", "#4D5F76", "#354962", "#1F344F", "#0B223E", "#021732",
    ]);
  });

  it("pins the categorical order for light and for dark and black", () => {
    const series = (theme: string) => [1, 2, 3, 4, 5, 6, 7, 8].map((i) => resolveToken(THEMES[theme], `--c${i}`));
    expect(series("light")).toEqual(["#533AFD", "#EF5F2F", "#BF3784", "#E3A200", "#3394F2", "#178F4F", "#A05DF2", "#0FB3A2"]);
    const darkSeries = ["#6B52FF", "#EF5F2F", "#BF3784", "#C08A00", "#3394F2", "#178F4F", "#A05DF2", "#0E9E8F"];
    expect(series("dark")).toEqual(darkSeries);
    expect(series("black")).toEqual(darkSeries);
  });

  it("pins the base tokens of each theme", () => {
    const base = (theme: string) => ["--bg", "--surface", "--tint", "--ink", "--ink2", "--muted", "--line", "--line2"].map((t) => resolveToken(THEMES[theme], t));
    expect(base("light")).toEqual(["#F9FAFC", "#FFFFFF", "#F4F7FA", "#021732", "#4D5F76", "#5F6F85", "#E5EAF1", "#D1D8E1"]);
    expect(base("dark")).toEqual(["#040A15", "#0A1322", "#0F1A2C", "#F3F6FA", "#B4BFCE", "#8A97AB", "#172234", "#25334B"]);
    expect(base("black")).toEqual(["#000000", "#0B0B0F", "#121217", "#F5F5F7", "#B5B7C0", "#8E909B", "#1C1C22", "#2A2A31"]);
  });

  it("keeps the OS-dark block and the explicit dark block identical", () => {
    expect(DARK_MEDIA).toEqual(DARK_EXPLICIT);
  });

  it("makes the black block self-contained: it repeats every dark token", () => {
    expect(Object.keys(DARK_EXPLICIT).filter((token) => !(token in BLACK_EXPLICIT))).toEqual([]);
  });

  describe.each(Object.keys(THEMES))("%s theme text pairs", (theme) => {
    const text = ["--ink", "--ink2", "--muted", "--acc", "--accInk", "--ok", "--warn", "--bad"];
    it.each(text.flatMap((fg) => ["--bg", "--surface", "--tint"].map((bg) => [fg, bg])))("%s on %s passes AA", (fg, bg) => {
      expect(ratio(theme, fg, bg)).toBeGreaterThanOrEqual(4.5);
    });
    it.each([
      ["--accInk", "--accBg"],
      ["--bad", "--badBg"],
      ["--onAcc", "--accFill"],
      ["--onAcc", "--accFillHover"],
    ])("%s on %s passes AA", (fg, bg) => {
      expect(ratio(theme, fg, bg)).toBeGreaterThanOrEqual(4.5);
    });
    it.each(["--bandInk", "--bandInk2", "--bandBody", "--bandMuted", "--bandAcc2", "--bandOk"])("%s on the contrast band passes AA", (fg) => {
      expect(ratio(theme, fg, "--band")).toBeGreaterThanOrEqual(4.5);
    });
    it("band warning text on its tinted chip passes AA", () => {
      expect(ratio(theme, "--bandWarn", "--bandWarnBg", "--band")).toBeGreaterThanOrEqual(4.5);
    });
  });

  it("keeps every colour in tokens.css: landing.css holds no hex", () => {
    expect(LANDING_CSS.match(/#[0-9a-fA-F]{3,8}\b/g)).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd frontend && npx vitest run src/landing/client/styles/palette.test.ts`
Expected: FAIL. `../../../test/contrast` cannot be resolved.

- [ ] **Step 3: Implement**

Create `frontend/src/test/contrast.ts`:

```ts
/** WCAG 2.x relative luminance and contrast ratio for #rrggbb colours. Shared by the token tests. */
function srgbToLin(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export function luminance(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return 0.2126 * srgbToLin(r) + 0.7152 * srgbToLin(g) + 0.0722 * srgbToLin(b);
}

export function contrastRatio(fg: string, bg: string): number {
  const l1 = luminance(fg);
  const l2 = luminance(bg);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}
```

Modify `frontend/src/design-system/contrast.test.ts`. Apply this change:

```diff
@@ -9,6 +9,8 @@ import { fileURLToPath } from "node:url";

 import { describe, it, expect } from "vitest";

+import { contrastRatio, luminance } from "../test/contrast";
+
 /**
  * WCAG 2.2 AA contrast verification for semantic color tokens.
  *
@@ -21,28 +23,6 @@ import { describe, it, expect } from "vitest";
  * values the app does not actually ship.
  */

-// ─── Contrast maths (relative luminance per WCAG 2.x) ───────────────────────
-
-function srgbToLin(channel: number): number {
-  const c = channel / 255;
-  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
-}
-
-function luminance(hex: string): number {
-  const r = parseInt(hex.slice(1, 3), 16);
-  const g = parseInt(hex.slice(3, 5), 16);
-  const b = parseInt(hex.slice(5, 7), 16);
-  return 0.2126 * srgbToLin(r) + 0.7152 * srgbToLin(g) + 0.0722 * srgbToLin(b);
-}
-
-function contrastRatio(fg: string, bg: string): number {
-  const l1 = luminance(fg);
-  const l2 = luminance(bg);
-  const lighter = Math.max(l1, l2);
-  const darker = Math.min(l1, l2);
-  return (lighter + 0.05) / (darker + 0.05);
-}
-
 // ─── tokens.css parsing ─────────────────────────────────────────────────────

 // Read the stylesheet exactly as shipped. Note the indirection through
```

Create `frontend/src/landing/client/styles/tokens.css`:

```css
/*
 * Landing page tokens: the new system in DESIGN.md (Colour, Dark and black
 * themes). Every colour on the landing page is defined here; landing.css holds
 * no hex. The /app workspaces keep design-system/tokens.css until Phase 3.
 *
 * Selectors match the app's theme contract: an explicit data-theme wins, and
 * "system" (no attribute) follows the OS.
 */
:root {
  /* ramps (constant across themes) */
  --p50: #F5F6FE; --p100: #EAEDFF; --p200: #D8DEFF; --p300: #BBC4FF; --p400: #95A0FF; --p500: #7277FF;
  --p600: #533AFD; --p700: #472CDD; --p800: #351DAE; --p900: #23107D; --p950: #16065A;
  --n0: #F9FAFC; --n25: #F4F7FA; --n50: #EFF3F8; --n100: #E5EAF1; --n200: #D1D8E1; --n300: #B2BCC8;
  --n400: #8693A5; --n500: #5F6F85; --n600: #4D5F76; --n700: #354962; --n800: #1F344F; --n900: #0B223E; --n950: #021732;

  --cw: 1080px; --ow: 1360px; --g: 16px;
  --font-sans: "Geist", "Geist Fallback", system-ui, sans-serif;
  --font-mono: "Geist Mono", "Geist Mono Fallback", ui-monospace, monospace;
  color-scheme: light;

  /* light theme */
  --bg: var(--n0); --surface: #FFFFFF; --tint: var(--n25); --ink: var(--n950); --ink2: var(--n600);
  --muted: var(--n500); --line: var(--n100); --line2: var(--n200); --cell: #EEF1F6;
  --acc: var(--p600); --accFill: var(--p600); --accFillHover: var(--p700); --onAcc: #FFFFFF;
  --accBg: var(--p50); --accLine: var(--p200); --accInk: var(--p700);
  --priShade: inset 0 -6px 12px rgba(22, 6, 90, .28), 0 1px 2px rgba(22, 6, 90, .25);
  --ok: #0A7D52; --warn: #A35200; --bad: #CE0045; --badBg: #FFF5F8; --badLine: #E8B8C8;
  --navBg: rgba(249, 250, 252, .82); --ghost: rgba(2, 23, 50, .05); --ghostHover: rgba(2, 23, 50, .09);
  --band: var(--n950); --bandInk: #FFFFFF; --bandInk2: #AEB9C9; --bandBody: #C9D2E0; --bandMuted: #8794A8;
  --bandLine: rgba(255, 255, 255, .10); --bandCell: rgba(255, 255, 255, .04); --bandAcc: var(--p400);
  --bandAcc2: var(--p300); --bandOk: #5FD3A2; --bandWarn: #F5C451; --bandWarnBg: rgba(227, 162, 0, .14);
  --bandChip: rgba(255, 255, 255, .12); --bandChipOn: rgba(114, 119, 255, .14);
  --plateTop: #FFFFFF; --plateSide: var(--n50); --plateSide2: var(--n100); --plateLine: var(--n200); --plateOn: var(--p50);
  --c1: #533AFD; --c2: #EF5F2F; --c3: #BF3784; --c4: #E3A200; --c5: #3394F2; --c6: #178F4F; --c7: #A05DF2; --c8: #0FB3A2;
  --gDot: 102, 118, 139; --gDotMin: .14; --gDotMax: .74; --gGrat: rgba(2, 23, 50, .05); --gLimb: var(--n200);
  --gPlate: rgba(255, 255, 255, .94); --gPlateLine: rgba(2, 23, 50, .12); --gInk: var(--n950); --gPacket: var(--n950); --gNode: #FFFFFF;
  --cube1: var(--p500); --cube2: var(--p600); --cube3: var(--p950);
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    color-scheme: dark;
    --bg: #040A15; --surface: #0A1322; --tint: #0F1A2C; --ink: #F3F6FA; --ink2: #B4BFCE; --muted: #8A97AB;
    --line: #172234; --line2: #25334B; --cell: #0B1526;
    --acc: var(--p400); --accFill: var(--p600); --accFillHover: #6B52FF; --accBg: rgba(83, 58, 253, .16);
    --accLine: rgba(149, 160, 255, .32); --accInk: var(--p300);
    --priShade: inset 0 -6px 12px rgba(0, 0, 0, .28), 0 0 0 1px rgba(149, 160, 255, .22);
    --ok: #43C98F; --warn: #F0B44C; --bad: #FF6B8B; --badBg: rgba(255, 107, 139, .10); --badLine: rgba(255, 107, 139, .36);
    --navBg: rgba(4, 10, 21, .78); --ghost: rgba(255, 255, 255, .06); --ghostHover: rgba(255, 255, 255, .10);
    --band: #0E0C32; --bandInk2: #B4BFCE; --bandMuted: #8A97AB; --bandLine: rgba(149, 160, 255, .14);
    --plateTop: #0A1322; --plateSide: #0F1A2C; --plateSide2: #14203A; --plateLine: #25334B; --plateOn: rgba(83, 58, 253, .20);
    --c1: #6B52FF; --c2: #EF5F2F; --c3: #BF3784; --c4: #C08A00; --c5: #3394F2; --c6: #178F4F; --c7: #A05DF2; --c8: #0E9E8F;
    --gDot: 168, 180, 198; --gDotMin: .10; --gDotMax: .58; --gGrat: rgba(255, 255, 255, .05); --gLimb: #25334B;
    --gPlate: rgba(10, 19, 34, .94); --gPlateLine: rgba(255, 255, 255, .14); --gInk: #F3F6FA; --gPacket: #F3F6FA; --gNode: #040A15;
    --cube1: var(--p400); --cube2: #6B52FF; --cube3: var(--p900);
  }
}

:root[data-theme="dark"] {
  color-scheme: dark;
  --bg: #040A15; --surface: #0A1322; --tint: #0F1A2C; --ink: #F3F6FA; --ink2: #B4BFCE; --muted: #8A97AB;
  --line: #172234; --line2: #25334B; --cell: #0B1526;
  --acc: var(--p400); --accFill: var(--p600); --accFillHover: #6B52FF; --accBg: rgba(83, 58, 253, .16);
  --accLine: rgba(149, 160, 255, .32); --accInk: var(--p300);
  --priShade: inset 0 -6px 12px rgba(0, 0, 0, .28), 0 0 0 1px rgba(149, 160, 255, .22);
  --ok: #43C98F; --warn: #F0B44C; --bad: #FF6B8B; --badBg: rgba(255, 107, 139, .10); --badLine: rgba(255, 107, 139, .36);
  --navBg: rgba(4, 10, 21, .78); --ghost: rgba(255, 255, 255, .06); --ghostHover: rgba(255, 255, 255, .10);
  --band: #0E0C32; --bandInk2: #B4BFCE; --bandMuted: #8A97AB; --bandLine: rgba(149, 160, 255, .14);
  --plateTop: #0A1322; --plateSide: #0F1A2C; --plateSide2: #14203A; --plateLine: #25334B; --plateOn: rgba(83, 58, 253, .20);
  --c1: #6B52FF; --c2: #EF5F2F; --c3: #BF3784; --c4: #C08A00; --c5: #3394F2; --c6: #178F4F; --c7: #A05DF2; --c8: #0E9E8F;
  --gDot: 168, 180, 198; --gDotMin: .10; --gDotMax: .58; --gGrat: rgba(255, 255, 255, .05); --gLimb: #25334B;
  --gPlate: rgba(10, 19, 34, .94); --gPlateLine: rgba(255, 255, 255, .14); --gInk: #F3F6FA; --gPacket: #F3F6FA; --gNode: #040A15;
  --cube1: var(--p400); --cube2: #6B52FF; --cube3: var(--p900);
}

/* Self-contained: repeats every dark token, so it renders correctly under an OS light setting. */
:root[data-theme="black"] {
  color-scheme: dark;
  --bg: #000000; --surface: #0B0B0F; --tint: #121217; --ink: #F5F5F7; --ink2: #B5B7C0; --muted: #8E909B;
  --line: #1C1C22; --line2: #2A2A31; --cell: #0A0A0E;
  --acc: var(--p400); --accFill: var(--p600); --accFillHover: #6B52FF; --accBg: rgba(83, 58, 253, .16);
  --accLine: rgba(149, 160, 255, .32); --accInk: var(--p300);
  --priShade: inset 0 -6px 12px rgba(0, 0, 0, .28), 0 0 0 1px rgba(149, 160, 255, .22);
  --ok: #43C98F; --warn: #F0B44C; --bad: #FF6B8B; --badBg: rgba(255, 107, 139, .10); --badLine: rgba(255, 107, 139, .36);
  --navBg: rgba(0, 0, 0, .78); --ghost: rgba(255, 255, 255, .06); --ghostHover: rgba(255, 255, 255, .10);
  --band: #0B0920; --bandInk2: #B4BFCE; --bandMuted: #8A97AB; --bandLine: rgba(149, 160, 255, .14);
  --plateTop: #0B0B0F; --plateSide: #121217; --plateSide2: #18181F; --plateLine: #2A2A31; --plateOn: rgba(83, 58, 253, .20);
  --c1: #6B52FF; --c2: #EF5F2F; --c3: #BF3784; --c4: #C08A00; --c5: #3394F2; --c6: #178F4F; --c7: #A05DF2; --c8: #0E9E8F;
  --gDot: 168, 180, 198; --gDotMin: .10; --gDotMax: .58; --gGrat: rgba(255, 255, 255, .05); --gLimb: #2A2A31;
  --gPlate: rgba(11, 11, 15, .94); --gPlateLine: rgba(255, 255, 255, .14); --gInk: #F3F6FA; --gPacket: #F3F6FA; --gNode: #000000;
  --cube1: var(--p400); --cube2: #6B52FF; --cube3: var(--p900);
}
```

Create `frontend/src/landing/client/styles/landing.css`:

```css
/*
 * Landing page styles. Colours come only from tokens.css: this file holds no
 * hex. Lines are real borders of real boxes, and boxes size to their content.
 *
 * html.js     - set by the pre-paint script when JavaScript runs.
 * html.motion - set when motion is allowed (no reduced-motion media query and
 *               no stored reducedMotion preference). Without it every animated
 *               element shows its final state.
 */

/* Metric-matched fallbacks keep the swap to Geist from shifting layout. */
@font-face {
  font-family: "Geist Fallback";
  src: local("Arial");
  size-adjust: 101.9%;
  ascent-override: 98.62%;
  descent-override: 28.95%;
  line-gap-override: 0%;
}
@font-face {
  font-family: "Geist Mono Fallback";
  src: local("Courier New");
  size-adjust: 99.98%;
  ascent-override: 100.52%;
  descent-override: 29.5%;
  line-gap-override: 0%;
}

*{box-sizing:border-box}
[hidden]{display:none!important}
html{-webkit-text-size-adjust:100%}
html.motion{scroll-behavior:smooth}
html:not(.motion) *{transition:none!important}
body{margin:0;background:var(--bg);color:var(--ink);font-family:var(--font-sans);font-size:16px;line-height:24px;-webkit-font-smoothing:antialiased;overflow-x:hidden}
.mono,.lbl,code{font-family:var(--font-mono);font-variant-ligatures:none}
.lbl{font-size:12px;line-height:16px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}
.lbl i{font-style:normal;color:var(--acc)}
h1,h2,h3{font-weight:500;margin:0;color:var(--ink);text-wrap:balance}
h1{font-size:60px;line-height:64px;letter-spacing:-.3px}
h2{font-size:52px;line-height:56px;letter-spacing:-.52px}
h3{font-size:20px;line-height:26px;letter-spacing:-.1px}
h1 em,h2 em{font-style:normal;color:var(--acc)}
p{margin:0}
.lede{color:var(--ink2);text-wrap:pretty}
.nw{white-space:nowrap}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.skip{position:absolute;left:12px;top:-64px;z-index:80;padding:10px 14px;border-radius:10px;background:var(--surface);color:var(--ink);border:1px solid var(--line2)}
.skip:focus{top:12px}

/* rails: fixed for the whole page, on the container edges at every width */
.rails{position:fixed;inset:0;pointer-events:none;z-index:40}
.rails i{position:absolute;top:0;bottom:0;width:1px;background:var(--line)}
.rails .o1{left:calc(50% - var(--ow)/2)}.rails .o2{left:calc(50% + var(--ow)/2)}
.rails .c1{left:calc(50% - min(var(--cw),100% - 2*var(--g))/2)}.rails .c2{left:calc(50% + min(var(--cw),100% - 2*var(--g))/2 - 1px)}
@media (max-width:1399px){.rails .o1,.rails .o2{display:none}}
.wrap{width:min(var(--cw),calc(100% - 2*var(--g)));margin:0 auto;position:relative}
.s{position:relative;border-top:1px solid var(--line)}
.plus{position:absolute;top:-7px;width:13px;height:13px;z-index:41;pointer-events:none;background:linear-gradient(var(--acc),var(--acc)) center/13px 1.5px no-repeat,linear-gradient(var(--acc),var(--acc)) center/1.5px 13px no-repeat}
.plus.l{left:calc(50% - min(var(--cw),100% - 2*var(--g))/2 - 6px)}.plus.r{left:calc(50% + min(var(--cw),100% - 2*var(--g))/2 - 6px)}
.cells{position:absolute;inset:0;left:calc(50% - min(var(--cw),100% - 2*var(--g))/2);right:calc(50% - min(var(--cw),100% - 2*var(--g))/2);pointer-events:none;background-image:linear-gradient(var(--cell) 1px,transparent 1px),linear-gradient(90deg,var(--cell) 1px,transparent 1px);background-size:120px 120px;background-position:-1px -1px}
.cells.dim{opacity:.6}

/* boxes: borders are the lines; content sets the height */
.grid{display:grid;border-top:1px solid var(--line)}
.grid.flush{border-top:0}
.grid>*{min-width:0;border-left:1px solid var(--line);padding:24px}
.grid>*:first-child{border-left:0}
.g2{grid-template-columns:repeat(2,minmax(0,1fr))}.g3{grid-template-columns:repeat(3,minmax(0,1fr))}.g4{grid-template-columns:repeat(4,minmax(0,1fr))}

/* nav */
.nav{position:sticky;top:0;z-index:60;height:64px;padding-top:env(safe-area-inset-top);box-sizing:content-box;border-bottom:1px solid var(--line);background:var(--navBg);backdrop-filter:saturate(1.5) blur(12px)}
.nav .wrap{height:100%;display:flex;align-items:center;gap:26px;font-size:14px;color:var(--ink2)}
.logo{display:flex;align-items:center;gap:9px;font-weight:600;font-size:19px;letter-spacing:-.03em;color:var(--ink);text-decoration:none;margin-right:6px;flex:none}
.logo svg{width:22px;height:22px;color:var(--acc)}
.nav a{color:inherit;text-decoration:none;white-space:nowrap}.nav a:hover{color:var(--ink)}
.nav .links{display:flex;gap:26px}.nav .acts{margin-left:auto;display:flex;align-items:center;gap:10px}.nav .docs{margin-right:14px}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;height:36px;padding:0 14px;border-radius:10px;font:500 14px/1 var(--font-sans);text-decoration:none;white-space:nowrap;border:0;cursor:pointer;transition:background-color .15s,transform .15s,box-shadow .15s}
.btn.pri{background:var(--accFill);color:var(--onAcc);box-shadow:var(--priShade)}
.btn.pri:hover{background:var(--accFillHover)}
.nav .btn.pri,.nav .btn.pri:hover{color:var(--onAcc)}
.btn.ghost{background:var(--ghost);color:var(--ink)}.btn.ghost:hover{background:var(--ghostHover)}
.btn.lg{height:44px;padding:0 18px;font-size:15px}
.btn:active{transform:translateY(1px)}
.btn:focus-visible,a:focus-visible,button:focus-visible,summary:focus-visible{outline:2px solid var(--acc);outline-offset:2px;border-radius:10px}
.menu{display:none;position:relative}
.menu summary{list-style:none;height:44px}
.menu summary::-webkit-details-marker{display:none}
.menu-panel{position:absolute;right:0;top:calc(100% + 8px);min-width:224px;display:grid;padding:6px;background:var(--surface);border:1px solid var(--line2);border-radius:10px;z-index:70}
.menu-panel a{display:flex;align-items:center;min-height:44px;padding:0 12px;border-radius:8px;color:var(--ink)}
.menu-panel a:hover{background:var(--ghost)}

/* section heads */
.head{padding:72px 24px 40px;position:relative;z-index:2;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,420px);gap:24px 48px;align-items:end}
.head.single{grid-template-columns:1fr}
.head .t>.lbl{display:block;margin-bottom:18px}
.head .lede{max-width:440px}

/* hero */
.hero{position:relative;overflow:hidden;border-bottom:1px solid var(--line)}
.hero .cells{-webkit-mask-image:radial-gradient(75% 55% at 50% 22%,black 35%,transparent 100%);mask-image:radial-gradient(75% 55% at 50% 22%,black 35%,transparent 100%)}
.hero .copy{position:relative;z-index:2;text-align:center;padding:76px 0 0}
.chip{display:inline-flex;align-items:center;gap:8px;height:28px;padding:0 12px;border:1px solid var(--line);border-radius:999px;background:var(--surface)}
.chip .dot{width:6px;height:6px;border-radius:50%;background:var(--acc);box-shadow:0 0 0 3px var(--accBg)}
.hero h1{margin:22px auto 0;max-width:820px}
.hero .lede{max-width:560px;margin:18px auto 0}
.ctas{display:flex;gap:10px;justify-content:center;margin-top:28px;flex-wrap:wrap}
.stage{position:relative;height:560px;margin-top:48px}
html:not(.js) .stage,.stage.off{display:none}
.globe-wrap{position:absolute;left:50%;top:0;width:min(860px,100%);aspect-ratio:1;transform:translateX(-50%);cursor:grab;touch-action:pan-y;z-index:1}
.globe-wrap:active{cursor:grabbing}
.globe-wrap canvas{width:100%;height:100%;display:block}
.corner{position:absolute;z-index:2;max-width:200px}
.corner b{display:block;font:500 14px/20px var(--font-sans);letter-spacing:0;text-transform:none;color:var(--ink);margin-top:2px}
.corner.ctl{left:20px;top:8px}.corner.ctr{right:20px;top:8px;text-align:right}
.tourbtn{margin-top:10px;height:44px;font-size:13px;text-transform:none;letter-spacing:0}
/* corridor legend = the hero's bottom row of cells */
.legend{position:relative;z-index:3;background:var(--bg);display:grid;grid-template-columns:repeat(8,minmax(0,1fr));border-top:1px solid var(--line)}
.legend>button{appearance:none;border:0;border-left:1px solid var(--line);background:transparent;color:inherit;font:inherit;text-align:left;padding:14px 14px 16px;position:relative;cursor:pointer;min-width:0;transition:background-color .3s}
.legend>button:first-child{border-left:0}
.legend>button::after{content:"";position:absolute;left:0;right:0;top:-1px;height:2px;background:var(--sw);transform:scaleX(0);transform-origin:left;transition:transform .5s}
.legend>button.on,.legend>button:hover{background:var(--surface)}.legend>button.on::after{transform:scaleX(1)}
.legend>button:focus-visible{outline-offset:-2px;border-radius:0}
.legend .code{display:inline-flex;align-items:center;gap:6px;font:500 12px/16px var(--font-mono);color:var(--ink)}
.legend .code::before{content:"";width:8px;height:8px;border-radius:2px;background:var(--sw)}
.legend small{display:block;font-size:13px;line-height:18px;color:var(--ink2);margin-top:4px;overflow-wrap:anywhere}
.legend em{display:block;font:400 11px/14px var(--font-mono);font-style:normal;color:var(--muted);margin-top:2px;letter-spacing:.02em}
.sw1{--sw:var(--c1)}.sw2{--sw:var(--c2)}.sw3{--sw:var(--c3)}.sw4{--sw:var(--c4)}.sw5{--sw:var(--c5)}.sw6{--sw:var(--c6)}.sw7{--sw:var(--c7)}.sw8{--sw:var(--c8)}

/* stats */
.stats .grid>div{padding:28px 24px}
.stat b{display:block;font-weight:500;font-size:40px;line-height:44px;letter-spacing:-.4px;margin-top:14px;font-variant-numeric:tabular-nums}
.stat small{display:block;font-size:14px;line-height:20px;color:var(--ink2);margin-top:6px}
.caption{padding:12px 24px;border-top:1px solid var(--line)}

/* 01 route */
.routebox{position:relative;border-top:1px solid var(--line)}
.rstage{position:relative;height:456px}
.rstage .cells{left:0;right:0}
.route-svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible;pointer-events:none}
.route-bg{stroke:var(--acc);stroke-opacity:.15;stroke-width:3;fill:none;vector-effect:non-scaling-stroke}
.route-fg{stroke:var(--acc);stroke-width:3;fill:none;vector-effect:non-scaling-stroke}
html.motion .route-fg{stroke-dasharray:1;stroke-dashoffset:1}
.node{fill:var(--surface);stroke:var(--acc);stroke-width:2;transition:fill .3s;vector-effect:non-scaling-stroke}
.node.on,html:not(.motion) .node{fill:var(--acc)}
.packet{fill:var(--gPacket)}
.tag{position:absolute;z-index:3;width:260px}
.tag.t1{left:140px;top:136px}.tag.t2{left:620px;top:256px}.tag.t3{right:28px;top:380px;text-align:right}
.tag b,.tag .m{transition:color .4s}
.tag b{display:block;font:500 15px/20px var(--font-sans);letter-spacing:0;text-transform:none;color:var(--muted);margin-top:3px}
.tag .m{display:block;font:400 12px/16px var(--font-mono);color:var(--muted);margin-top:3px;letter-spacing:0;text-transform:none}
/* hops not yet reached use the muted token, never reduced opacity */
.tag.on b,html:not(.motion) .tag b{color:var(--ink)}.tag.on .m,html:not(.motion) .tag .m{color:var(--ink2)}
.vroute{display:none}
.vroute ol{list-style:none;margin:0;padding:8px 20px 8px 44px;position:relative}
.vroute ol::before{content:"";position:absolute;left:24px;top:0;bottom:0;width:3px;background:var(--accBg)}
.vroute ol::after{content:"";position:absolute;left:24px;top:0;width:3px;height:calc(var(--p,0)*100%);background:var(--acc)}
html:not(.motion) .vroute ol{--p:1}
.vroute li{position:relative;padding:20px 0;border-top:1px solid var(--line)}.vroute li:first-child{border-top:0}
.vroute li::before{content:"";position:absolute;left:-26px;top:24px;width:12px;height:12px;background:var(--surface);border:2px solid var(--acc);z-index:1}
.vroute li.on::before,html:not(.motion) .vroute li::before{background:var(--acc)}
.vroute b{display:block;font:500 16px/22px var(--font-sans);margin-top:4px}.vroute .m{display:block;font:400 12px/16px var(--font-mono);color:var(--ink2);margin-top:2px}
.steps h3{margin:10px 0 6px}.steps p{font-size:14px;line-height:21px;color:var(--ink2)}
.steps a{color:inherit;text-decoration:none}.steps a:hover h3{color:var(--acc)}

/* 02 anatomy */
.anat{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);border-top:1px solid var(--line)}
.anat>div{min-width:0}.anat>div:first-child{border-right:1px solid var(--line)}
.ledger{padding:0 24px 32px;font-size:13px;line-height:18px}
.ledger div{display:grid;grid-template-columns:72px minmax(0,1fr) auto;gap:12px;padding:11px 0;border-top:1px solid var(--line);color:var(--muted);transition:color .35s}
.ledger div span:last-child{color:var(--muted)}
.ledger div.on,html:not(.motion) .ledger div{color:var(--ink2)}
.ledger div.on span:last-child,html:not(.motion) .ledger div span:last-child{color:var(--ok)}
.ledger div span:nth-child(2){overflow-wrap:anywhere}
.iso{padding:24px}.iso svg{display:block;width:100%;height:auto;max-height:720px}
.plate .top{fill:var(--plateTop);stroke:var(--plateLine);transition:fill .35s,stroke .35s}
.plate .side{fill:var(--plateSide);stroke:var(--plateLine)}.plate .side2{fill:var(--plateSide2);stroke:var(--plateLine)}
.plate .tick{stroke:var(--line)}
.plate.on .top,html:not(.motion) .plate .top{fill:var(--plateOn);stroke:var(--acc)}
.plate .ld{stroke:var(--plateLine);stroke-dasharray:3 3}
.plate text{font-family:var(--font-mono);font-size:10px;fill:var(--muted);letter-spacing:.08em}
.plate text.n{font-family:var(--font-sans);font-weight:500;font-size:15px;fill:var(--ink);letter-spacing:0}
.plate text.d{fill:var(--ink2);letter-spacing:0}
.plate.on text.n,html:not(.motion) .plate text.n{fill:var(--acc)}
.cube1{fill:var(--cube1)}.cube2{fill:var(--cube2)}.cube3{fill:var(--cube3)}

/* 03 rails */
.tabs{display:flex;flex-wrap:wrap;border-top:1px solid var(--line)}
html:not(.js) .tabs{display:none}
.tabs button{flex:1 1 0;min-width:96px;min-height:44px;appearance:none;border:0;border-left:1px solid var(--line);background:transparent;padding:16px 12px;font:500 14px/18px var(--font-mono);color:var(--ink2);cursor:pointer;position:relative;transition:background-color .2s,color .2s}
.tabs button:first-child{border-left:0}
.tabs button::after{content:"";position:absolute;left:0;right:0;top:-1px;height:2px;background:var(--acc);transform:scaleX(0);transition:transform .35s}
.tabs button[aria-selected=true]{background:var(--surface);color:var(--ink)}.tabs button[aria-selected=true]::after{transform:scaleX(1)}
.tabs button:hover{color:var(--ink)}
.tabs button:focus-visible{outline:2px solid var(--acc);outline-offset:-2px;border-radius:0}
.panel{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,2fr);border-top:1px solid var(--line)}
.js .panels:not(.ready) .panel+.panel{display:none}
.panel>div{min-width:0}.panel>div:first-child{border-right:1px solid var(--line);padding:28px 24px}
.panel .big{font:500 40px/44px var(--font-sans);letter-spacing:-.4px;margin:12px 0 8px}
.panel .desc{font-size:14px;line-height:21px;color:var(--ink2)}
.panel .desc a{color:var(--accInk)}
.schemes>div{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(0,1fr) minmax(0,1fr);gap:16px;padding:16px 24px;border-top:1px solid var(--line);align-items:baseline}
.schemes>div:first-child{border-top:0}
.schemes b{font-weight:500;font-size:16px;overflow-wrap:anywhere}.schemes span{font-size:14px;color:var(--ink2);overflow-wrap:anywhere}
.schemes .k{display:block;font:400 12px/16px var(--font-mono);letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}

/* 04 data (contrast band) */
.band{background:var(--band);color:var(--bandBody);--line:var(--bandLine);--cell:var(--bandCell);--ink:var(--bandInk);--ink2:var(--bandInk2);--muted:var(--bandMuted);--acc:var(--bandAcc)}
.band .lbl i{color:var(--bandAcc2)}
.band h2 em{color:var(--bandAcc2)}
.band .grid.g3{border-top:1px solid var(--line)}
.ibanbox{padding:28px 24px}
.iban{display:flex;flex-wrap:wrap;gap:6px;font:500 22px/30px var(--font-mono);margin:14px 0 18px}
.iban span{padding:4px 8px;border:1px solid var(--bandChip);border-radius:6px;transition:border-color .3s,background-color .3s,color .3s;color:var(--bandBody)}
.iban span.on,html:not(.motion) .iban span{border-color:var(--bandAcc);background:var(--bandChipOn);color:var(--bandInk)}
.checks div{display:flex;justify-content:space-between;gap:12px;padding:9px 0;border-top:1px solid var(--bandLine);font-size:13px;line-height:18px;color:var(--bandMuted);transition:color .3s}
.checks div b{font:500 12px/18px var(--font-mono);color:var(--bandMuted)}
.checks div.on,html:not(.motion) .checks div{color:var(--bandInk2)}
.checks div.on b,html:not(.motion) .checks div b{color:var(--bandOk)}
.replay{margin-top:14px;min-height:44px;background:var(--bandChip);color:var(--bandInk)}
.replay:hover{background:var(--bandChipOn)}
.ssi{margin:0;padding:28px 24px;font:400 13px/22px var(--font-mono);color:var(--bandBody);white-space:pre-wrap;overflow-wrap:anywhere}
.ssi .k{color:var(--bandMuted)}.ssi .v{color:var(--bandInk)}.ssi .p{color:var(--bandAcc2)}
.ssi dl{margin:14px 0 0;display:grid;grid-template-columns:minmax(0,auto) minmax(0,1fr);gap:0 14px}
.ssi dt{color:var(--bandMuted)}.ssi dd{margin:0;color:var(--bandInk);overflow-wrap:anywhere}
.prov{display:inline-flex;gap:8px;align-items:center;margin-top:12px;padding:4px 10px;border:1px solid var(--bandChip);border-radius:999px;font:400 12px/16px var(--font-mono);color:var(--bandInk2)}
.prov::before{content:"";width:6px;height:6px;border-radius:50%;background:var(--bandOk)}
.vop{padding:28px 24px}
.vop .pair{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);gap:12px;align-items:center;margin-top:14px;font-size:14px}
.vop .pair div{padding:10px 12px;border:1px solid var(--bandChip);border-radius:8px;min-width:0;overflow-wrap:anywhere}
.vop .who{display:block}
.vop .res{margin-top:14px;display:inline-flex;gap:8px;align-items:center;padding:6px 10px;border-radius:999px;background:var(--bandWarnBg);color:var(--bandWarn);font:500 12px/16px var(--font-mono)}

/* 05 learn */
.mods{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));border-top:1px solid var(--line)}
.mods a{display:grid;grid-template-columns:52px minmax(0,1fr) auto;gap:12px;align-items:baseline;padding:14px 24px;border-top:1px solid var(--line);text-decoration:none;color:var(--ink);transition:background-color .2s}
.mods a:nth-child(-n+2){border-top:0}.mods a:nth-child(odd){border-right:1px solid var(--line)}
.mods a:hover{background:var(--surface)}.mods a:hover .n{color:var(--acc)}
.mods .n{font:500 12px/16px var(--font-mono);color:var(--muted)}
.mods b{font-weight:500;font-size:15px;line-height:21px;overflow-wrap:anywhere}
.mods small{font:400 12px/16px var(--font-mono);color:var(--muted);text-align:right}
.mods a.cap{background:var(--accBg)}.mods a.cap .n{color:var(--acc)}
.cards h3{margin:10px 0 6px}.cards p{font-size:14px;line-height:21px;color:var(--ink2)}
.cards a{color:inherit;text-decoration:none}.cards a:hover h3{color:var(--acc)}

/* 06 tools */
.tool{display:flex;flex-direction:column;gap:10px}
.tool h3{margin-top:4px}.tool h3 a{color:inherit;text-decoration:none}.tool h3 a:hover{color:var(--acc)}.tool p{font-size:14px;line-height:21px;color:var(--ink2)}
.viz{margin-top:auto;padding-top:16px}
.viz .note{margin-top:8px}
.rows{display:grid;gap:6px;font:400 12px/16px var(--font-mono);color:var(--ink2)}
.rows div{display:flex;justify-content:space-between;gap:8px;padding:6px 10px;border:1px solid var(--line);border-radius:6px;min-width:0}
.rows div span{min-width:0;overflow-wrap:anywhere}
.rows div span:first-child{flex:none}
.rows div span:last-child{text-align:right}
.rows .on{border-color:var(--accLine);background:var(--accBg);color:var(--accInk)}
.cal{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:4px;font:400 11px/14px var(--font-mono);text-align:center;color:var(--muted)}
.cal span{padding:6px 0;border:1px solid var(--line);border-radius:5px}.cal .we{background:var(--tint)}.cal .on{border-color:var(--acc);color:var(--accInk);background:var(--accBg)}.cal .hd{text-decoration:line-through}.cal .sent{border-style:dashed}
.mt{font:400 11.5px/18px var(--font-mono);color:var(--ink2);background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:10px 12px;overflow-x:auto;white-space:pre;margin:0}
.mt .hl{color:var(--accInk);background:var(--accBg)}
.tl{display:grid;gap:0;font:400 12px/16px var(--font-mono);color:var(--ink2)}
.tl div{display:grid;grid-template-columns:14px minmax(0,1fr) auto;gap:8px;align-items:center;padding:5px 0}
.tl i{width:9px;height:9px;border-radius:50%;border:2px solid var(--acc);background:var(--surface)}.tl div.on i{background:var(--acc)}

/* cta and footer */
.s-cta{padding:104px 0 112px;text-align:center;overflow:hidden}
.s-cta .cells{-webkit-mask-image:radial-gradient(60% 70% at 50% 50%,black 30%,transparent 100%);mask-image:radial-gradient(60% 70% at 50% 50%,black 30%,transparent 100%)}
.s-cta .lbl,.s-cta h2,.s-cta .lede,.s-cta .ctas{position:relative}
.s-cta h2{margin-top:18px}.s-cta .lede{max-width:500px;margin:16px auto 0}
.foot .wrap{display:flex;flex-wrap:wrap;gap:12px 24px;justify-content:space-between;align-items:center;padding:22px 24px calc(40px + env(safe-area-inset-bottom))}
.themes{display:inline-flex;border:1px solid var(--line2);border-radius:10px;overflow:hidden}
html:not(.js) .themes{display:none}
.themes button{appearance:none;border:0;border-left:1px solid var(--line2);background:transparent;color:var(--ink2);font:500 12px/16px var(--font-mono);letter-spacing:.04em;text-transform:uppercase;padding:9px 12px;min-height:44px;cursor:pointer}
.themes button:first-child{border-left:0}.themes button[aria-pressed=true]{background:var(--accBg);color:var(--accInk)}.themes button:hover{color:var(--ink)}
.themes button:focus-visible{outline-offset:-2px;border-radius:0}

/* tablet */
@media (max-width:1160px){.legend{grid-template-columns:repeat(4,minmax(0,1fr))}.legend>button:nth-child(5){border-left:0}.legend>button:nth-child(n+5){border-top:1px solid var(--line)}}
@media (max-width:980px){
  h1{font-size:48px;line-height:52px}h2{font-size:40px;line-height:44px}
  .nav .links,.nav .docs{display:none}.nav .menu{display:block}
  .head{grid-template-columns:1fr;padding:56px 20px 32px}
  .g4{grid-template-columns:repeat(2,minmax(0,1fr))}.g4>*:nth-child(3){border-left:0}.g4>*:nth-child(n+3){border-top:1px solid var(--line)}
  .g3{grid-template-columns:1fr}.g3>*{border-left:0}.g3>*+*{border-top:1px solid var(--line)}
  .anat{grid-template-columns:1fr}.anat>div:first-child{border-right:0;border-bottom:1px solid var(--line)}
  .panel{grid-template-columns:1fr}.panel>div:first-child{border-right:0;border-bottom:1px solid var(--line)}
  .rstage{display:none}.vroute{display:block}
}
/* mobile */
@media (max-width:640px){
  :root{--g:12px}
  .nav .acts .btn.pri{padding:0 12px}
  h1{font-size:38px;line-height:42px;letter-spacing:-.2px}h2{font-size:32px;line-height:36px;letter-spacing:-.3px}
  .hero .copy{padding-top:48px}.hero .ctas .btn{flex:1 1 100%}
  .stage{height:auto;aspect-ratio:1/0.82;margin-top:28px}.corner{display:none}.corner.ctl{display:block;top:auto;bottom:8px;left:8px;z-index:3}.corner.ctl i,.corner.ctl b{display:none}
  .legend{grid-template-columns:repeat(2,minmax(0,1fr))}.legend>button:nth-child(odd){border-left:0}.legend>button:nth-child(n+3){border-top:1px solid var(--line)}.legend>button:nth-child(5){border-left:0}
  .g4,.g2{grid-template-columns:1fr}.g4>*,.g2>*{border-left:0}.g4>*+*,.g2>*+*{border-top:1px solid var(--line)}
  .grid>*{padding:20px}.stat b{font-size:34px;line-height:38px}
  .mods{grid-template-columns:1fr}.mods a:nth-child(-n+2){border-top:1px solid var(--line)}.mods a:first-child{border-top:0}.mods a:nth-child(odd){border-right:0}
  .mods a{padding:13px 20px;grid-template-columns:40px minmax(0,1fr)}.mods small{display:none}
  .schemes>div{grid-template-columns:1fr;gap:4px;padding:14px 20px}
  .tabs button{flex:1 1 33%;min-width:0;padding:14px 6px;font-size:13px}.tabs button:nth-child(3n+1){border-left:0}.tabs button:nth-child(n+4){border-top:1px solid var(--line)}
  .iban{font-size:17px;line-height:24px}
  .vop .pair{grid-template-columns:1fr}.vop .pair>span{display:none}
  .foot .wrap{flex-direction:column}
  .plate text{font-size:15px}.plate text.n{font-size:21px}.plate text.d{display:none}.iso{padding:16px 8px}
}
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `cd frontend && npx vitest run src/landing/client/styles src/design-system/contrast.test.ts`
Expected: both files pass (169 tests across the two files).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/landing/client/styles/tokens.css frontend/src/landing/client/styles/landing.css frontend/src/landing/client/styles/palette.test.ts frontend/src/test/contrast.ts frontend/src/design-system/contrast.test.ts
git commit -m "feat(landing): add landing tokens and styles in light, dark and black (landing 8)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: The page, rendered to static markup

**Files:**
- Create: `frontend/src/landing/render/sections/{shared,Nav,Hero,Stats,Route,Anatomy,Rails,Data,Learn,Tools,Closing}.tsx`
- Create: `frontend/src/landing/render/LandingPage.tsx`, `frontend/src/landing/render/render.tsx`
- Test: `frontend/src/landing/render/render.test.tsx`, `tests/test_landing_content.py`

**Interfaces:**
- Consumes everything from Task 7, plus the class names from Task 8.
- Produces `renderLanding(rawFacts: unknown): string` (`render/render.tsx`), which Task 13's Vite plugin calls through `runnerImport`.
- Element ids and data attributes the enhancers (Tasks 10–12) and the E2E spec (Task 16) rely on:
  - globe: `#hero`, `#globe-stage`, `#globe`, `#globe-data` (JSON of `{code, from: [lat, lon], to: [lat, lon], fromLabel, toLabel}`), `#tour-toggle` (rendered `hidden`), `#legend` and `[data-corridor="i"]`;
  - route: `#route`, `#route-stage`, `#route-path` (`pathLength=1`), `#route-packet` and `#route-steps`, with `[data-at]` on the stage marks and stepper items;
  - anatomy: `#anatomy`, `#anatomy-svg` (`data-y0`, `data-gap`), `#anatomy-cube` and `#ledger`;
  - rails: `#rails`, `#rail-tabs`, `#rail-panels`, `#rail-tab-<code>` and `#rail-panel-<code>`;
  - data: `#data`, `#iban-demo`, `#iban-checks` and `#iban-replay` (rendered `hidden`);
  - remaining sections and hooks: `#learn`, `#tools`, `#main`, `[data-count]`, `[data-theme-choice]` and `[data-simulation]`.

Every count comes from `facts`, every example from `DEMO`, and every module, question and case from `content.ts`. Nothing on the page is typed as a number except layout (section indices, figure numbers, MT103 field tags); the digit-run test enforces that.
- The packet starts at the route's end and the anatomy cube at the last plate, so the markup is already the final state.
- The globe's corridors travel as an escaped JSON `<script>`, so the page makes no data request.
- The hero lede says "The demonstration banks and every account are fictional". The prototype's "Every bank and account is fictional" contradicted the real reference directory.

The pytest scans every seed bank name, as a whole word, against the landing sources, the rendered reference data, and the built page when it exists.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/landing/render/render.test.tsx`:

```tsx
/// <reference types="node" />
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { learnSummary } from "./content";
import { DEMO } from "./demo";
import fixture from "./facts.fixture.json";
import { parseLandingFacts } from "./facts";
import { formatAmount, formatCount, formatHours } from "./format";
import { renderLanding } from "./render";

const facts = parseLandingFacts(fixture);
const html = renderLanding(fixture);
const doc = new DOMParser().parseFromString(`<!doctype html><body>${html}</body>`, "text/html");
/** Visible text, one text node at a time, so adjacent elements never run together. */
function visibleText(root: Element): string {
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const parts: string[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.parentElement?.closest("script")) continue;
    parts.push(node.textContent ?? "");
  }
  return parts.join(" ").replace(/\s+/g, " ");
}
const text = visibleText(doc.body);

/** Paths declared in the SPA router, read from its source. */
const APP_ROUTES = [...readFileSync(resolve(__dirname, "../../app-shell/App.tsx"), "utf8").matchAll(/path="([^"]+)"/g)].map(
  (m) => `/app/${m[1]}`,
);

function routeExists(href: string): boolean {
  if (href === "/app" || href === "/" || href === "/docs" || href.startsWith("#")) return true;
  return APP_ROUTES.some((route) => new RegExp(`^${route.replace(/:[^/]+/g, "[^/]+")}$`).test(href));
}

describe("rendered landing page", () => {
  it("states every count from the facts", () => {
    const counts = [
      facts.directory.banks, facts.directory.countries, facts.ssi.rows, facts.ssi.settleableRows,
      facts.ssi.beneficiaryBanks, facts.ssi.correspondents, facts.atlas.beneficiaryCountries,
      facts.corridorRules.corridors, facts.rails.currencyCount, facts.rails.domesticSchemeCount,
      facts.rails.totalRailCount, facts.tools.verdicts, facts.tools.watchlistEntries,
      facts.tools.holidayCalendars, facts.tools.stpRules,
    ];
    for (const count of counts) expect(text).toContain(formatCount(count));
    for (const currency of facts.rails.currencies) {
      for (const scheme of currency.schemes) expect(text).toContain(scheme.name);
    }
    for (const corridor of facts.corridors) expect(text).toContain(`${corridor.origin.city} → ${corridor.destination.city}`);
  });

  it("states no number that the facts, the demonstration values or the curriculum do not supply", () => {
    const learn = learnSummary();
    const allowed = new Set<string>();
    const add = (value: unknown) => {
      if (typeof value === "number") {
        allowed.add(String(value));
        allowed.add(formatCount(value));
        allowed.add(formatAmount(value));
      } else if (typeof value === "string") {
        for (const run of value.match(/\d[\d,.]*/g) ?? []) allowed.add(run.replace(/[.,]$/, ""));
      } else if (Array.isArray(value)) value.forEach(add);
      else if (value && typeof value === "object") Object.values(value).forEach(add);
    };
    add(facts);
    add(DEMO);
    add(learn);
    add([formatHours(learn.minutes.min), formatHours(learn.minutes.max)]);
    add(DEMO.iban.sortCode.match(/.{2}/g));
    // Layout numbers: section indices, plate figure numbers, hop numbers,
    // calendar days of the demonstration week, and the MT103 field tags.
    const layout = ["01", "02", "03", "04", "05", "06", "0", "1", "2", "3", "4", "5", "0.1", "0.2", "0.3", "0.4", "0.5",
      "29", "30", "20", "23", "32", "50", "59", "71", "121", "261001", "25000,00", "0.42", "0.64", "0.45", "008", "002", "103", "20022"];
    layout.forEach((n) => allowed.add(n));
    const runs = (text.match(/\d[\d,.]*/g) ?? []).map((run) => run.replace(/[.,]$/, ""));
    const unexplained = [...new Set(runs.filter((run) => !allowed.has(run)))];
    expect(unexplained).toEqual([]);
  });

  it("states the simulation in the hero, sections 01, 02, 04 and 06, and the footer", () => {
    for (const selector of ["#hero", "#route", "#anatomy", "#data", "#tools", "footer"]) {
      const scope = doc.querySelector(selector);
      expect(scope, selector).not.toBeNull();
      expect(scope!.querySelector("[data-simulation]")?.textContent, selector).toMatch(/simulation/i);
    }
  });

  it("links only to routes that exist, and has no sign-in", () => {
    const hrefs = [...doc.querySelectorAll("a[href]")].map((a) => a.getAttribute("href")!);
    expect(hrefs.length).toBeGreaterThan(30);
    expect(hrefs.filter((href) => !routeExists(href))).toEqual([]);
    expect(text).not.toMatch(/sign in/i);
  });

  it("shows only ACCT- placeholder account numbers and no contiguous IBAN", () => {
    expect(text.match(/ACCT-\d+/g)?.length).toBeGreaterThan(0);
    expect(text).not.toMatch(/\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/);
  });

  it("gives every rail tab a labelled panel", () => {
    const tabs = [...doc.querySelectorAll('[role="tab"]')];
    expect(tabs).toHaveLength(facts.rails.currencies.length + 1);
    for (const tab of tabs) {
      const panel = doc.getElementById(tab.getAttribute("aria-controls")!);
      expect(panel?.getAttribute("aria-labelledby")).toBe(tab.id);
    }
  });

  it("renders the globe's corridor data for the client, escaped", () => {
    const data = doc.getElementById("globe-data")!.textContent!;
    expect(JSON.parse(data)).toHaveLength(facts.corridors.length);
    expect(data).not.toContain("</");
  });
});
```

Create `tests/test_landing_content.py`:

```python
"""No real bank name reaches the landing page.

Page text comes from the landing sources, the scheme reference data and the
corridor table, so all three are scanned against every bank name in the seed
directory, as is the built page when it exists.
"""
import re
from pathlib import Path

import pytest

from app.data.landing_corridors import LANDING_CORRIDORS
from app.data.payment_schemes import (
    get_international_schemes,
    get_schemes_for_currency,
    list_currencies_with_schemes,
)
from app.services.seed import BANKS

REPO_ROOT = Path(__file__).resolve().parents[1]
LANDING_SOURCES = REPO_ROOT / "frontend" / "src" / "landing"
BUILT_PAGE = REPO_ROOT / "app" / "landing_dist" / "landing.html"
NAMES = sorted({name for _bic, name, *_ in BANKS})


def _hits(text: str) -> list:
    lowered = text.lower()
    return [
        name
        for name in NAMES
        if re.search(r"(?<![a-z0-9])" + re.escape(name.lower()) + r"(?![a-z0-9])", lowered)
    ]


def _source_files():
    entry = REPO_ROOT / "frontend" / "landing.html"
    files = [entry] if entry.exists() else []
    for path in LANDING_SOURCES.rglob("*"):
        if path.is_file() and "generated" not in path.parts and path.suffix in {".ts", ".tsx", ".json", ".css"}:
            files.append(path)
    return files


def test_the_scan_has_names_and_sources_to_check():
    assert len(NAMES) > 500
    assert len(_source_files()) > 20


@pytest.mark.parametrize("path", _source_files(), ids=lambda p: str(p.relative_to(REPO_ROOT)))
def test_landing_sources_name_no_real_bank(path):
    assert _hits(path.read_text(encoding="utf-8")) == []


def test_rendered_reference_data_names_no_real_bank():
    rendered = []
    for code in list_currencies_with_schemes():
        for scheme in get_schemes_for_currency(code)["schemes"]:
            rendered += [scheme["name"], scheme["speed"], scheme["limit"], scheme["cost"]]
    international = get_international_schemes()
    rendered += [international[k] for k in ("name", "speed", "limit", "cost")]
    for corridor in LANDING_CORRIDORS:
        rendered += [corridor["origin"]["city"], corridor["destination"]["city"]]
    assert _hits("\n".join(rendered)) == []


@pytest.mark.skipif(not BUILT_PAGE.exists(), reason="landing page not built")
def test_the_built_page_names_no_real_bank():
    html = BUILT_PAGE.read_text(encoding="utf-8")
    text = re.sub(r"<script[\s\S]*?</script>|<[^>]+>", " ", html)
    assert _hits(text) == []
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd frontend && npx vitest run src/landing/render/render.test.tsx`
Expected: FAIL. `./render` cannot be resolved.

Run: `python -m pytest tests/test_landing_content.py -q`
Expected: passes for the files that exist, which proves the scan runs. The page sources it guards come next.

- [ ] **Step 3: Implement**

Create `frontend/src/landing/render/sections/shared.tsx`:

```tsx
import type { ReactNode } from "react";

/** Crosshair markers where a section's top rule meets the container rails. */
export function Pluses() {
  return (
    <>
      <span className="plus l" aria-hidden="true" />
      <span className="plus r" aria-hidden="true" />
    </>
  );
}

/** A bracketed mono label, e.g. "[ 01 / 06 ] follow every hop [ simulation ]". */
export function SectionLabel({ index, title, simulation = false }: { index: string; title: string; simulation?: boolean }) {
  return (
    <span className="lbl">
      <i>[ {index} / 06 ]</i> {title}
      {simulation ? (
        <>
          {" "}
          <i data-simulation="">[ simulation ]</i>
        </>
      ) : null}
    </span>
  );
}

export function Head({ label, title, lede, single = false }: { label: ReactNode; title: ReactNode; lede: ReactNode; single?: boolean }) {
  return (
    <div className={single ? "head single" : "head"}>
      <div className="t">
        {label}
        <h2>{title}</h2>
      </div>
      <p className="lede">{lede}</p>
    </div>
  );
}

/** The Route Loop symbol, drawn in the accent colour of the current theme. */
export function RelaySymbol() {
  return (
    <svg viewBox="0 0 128 128" aria-hidden="true">
      <path
        d="M24 17h40c14 0 24 10 24 23 0 12-8 21-22 21H39c-15 0-25 9-25 22s10 22 25 22h30"
        fill="none"
        stroke="currentColor"
        strokeWidth="13"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <g fill="currentColor">
        <circle cx="24" cy="17" r="12" />
        <circle cx="66" cy="61" r="12" />
        <circle cx="69" cy="105" r="12" />
      </g>
    </svg>
  );
}
```

Create `frontend/src/landing/render/sections/Nav.tsx`:

```tsx
import { RelaySymbol } from "./shared";

export const NAV_LINKS = [
  { label: "Learn", href: "/app/learn" },
  { label: "Explore", href: "/app/explore" },
  { label: "Operate", href: "/app/operate" },
  { label: "Atlas", href: "/app/explore/atlas" },
];

export function Nav() {
  return (
    <header className="nav">
      <div className="wrap">
        <a className="logo" href="/">
          <RelaySymbol />
          Relay
        </a>
        <nav className="links" aria-label="Primary">
          {NAV_LINKS.map((link) => (
            <a key={link.href} href={link.href}>
              {link.label}
            </a>
          ))}
        </nav>
        <div className="acts">
          <a className="docs" href="/docs">
            API docs
          </a>
          <a className="btn pri" href="/app">
            Open the simulation
          </a>
          <details className="menu">
            <summary className="btn ghost">Menu</summary>
            <nav className="menu-panel" aria-label="Menu">
              {NAV_LINKS.map((link) => (
                <a key={link.href} href={link.href}>
                  {link.label}
                </a>
              ))}
              <a href="/docs">API docs</a>
            </nav>
          </details>
        </div>
      </div>
    </header>
  );
}
```

Create `frontend/src/landing/render/sections/Hero.tsx`:

```tsx
import type { LandingFacts } from "../facts";
import { formatCount } from "../format";

const SOURCE_LABEL = { case: "case desk", rule: "corridor rule" } as const;

export function Hero({ facts }: { facts: LandingFacts }) {
  const { rails, corridors, corridorRules } = facts;
  // The globe enhancer reads its corridors from here; the page needs no data request.
  const globeData = JSON.stringify(
    corridors.map((c) => ({
      code: c.currency,
      from: [c.origin.lat, c.origin.lon],
      to: [c.destination.lat, c.destination.lon],
      fromLabel: c.origin.city.toUpperCase(),
      toLabel: c.destination.city.toUpperCase(),
    })),
  );
  return (
    <section className="hero" id="hero">
      <div className="cells" aria-hidden="true" />
      <div className="wrap copy">
        <span className="chip lbl" data-simulation="">
          <span className="dot" aria-hidden="true" />
          Simulation · no real money moves
        </span>
        <h1>
          See where a payment <em>actually</em> goes.
        </h1>
        <p className="lede">
          From IBAN checks to correspondent routing to tracking, Relay simulates the whole journey of a
          cross-border payment across {formatCount(rails.currencyCount)} currencies and{" "}
          {formatCount(rails.totalRailCount)} payment rails. The demonstration banks and every account are
          fictional.
        </p>
        <div className="ctas">
          <a className="btn pri lg" href="/app">
            Open the simulation
          </a>
          <a className="btn ghost lg" href="#route">
            Follow a payment ↓
          </a>
        </div>
      </div>
      <div className="wrap stage" id="globe-stage">
        <div className="corner ctl lbl">
          <i>[ drag ]</i>
          <b>Spin the globe any way</b>
          <button type="button" className="btn ghost tourbtn" id="tour-toggle" aria-pressed="false" hidden>
            Pause tour
          </button>
        </div>
        <div className="corner ctr lbl">
          <i>[ corridors ]</i>
          <b>
            {formatCount(corridors.length)} of {formatCount(corridorRules.corridors)} corridors, on a loop
          </b>
        </div>
        <div className="globe-wrap" aria-hidden="true">
          <canvas id="globe" />
        </div>
        <script type="application/json" id="globe-data" dangerouslySetInnerHTML={{ __html: globeData.replace(/</g, "\\u003c") }} />
      </div>
      <div className="wrap legend" id="legend" role="group" aria-label="Corridors shown on the globe">
        {corridors.map((corridor, index) => (
          <button type="button" key={corridor.currency} className={`sw${index + 1}`} data-corridor={index}>
            <span className="code">{corridor.currency}</span>
            <small>
              {corridor.origin.city} → {corridor.destination.city}
            </small>
            <em>{SOURCE_LABEL[corridor.source]}</em>
          </button>
        ))}
      </div>
    </section>
  );
}
```

Create `frontend/src/landing/render/sections/Stats.tsx`:

```tsx
import type { Demo } from "../demo";
import type { LandingFacts } from "../facts";
import { formatCount } from "../format";
import { Pluses } from "./shared";

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="stat">
      <span className="lbl">
        <i>[</i> {label} <i>]</i>
      </span>
      <b data-count="">{value}</b>
      <small>{note}</small>
    </div>
  );
}

export function Stats({ facts, demo }: { facts: LandingFacts; demo: Demo }) {
  const { directory, ssi, rails } = facts;
  return (
    <section className="s stats" aria-label="Relay in numbers">
      <Pluses />
      <div className="wrap grid g4 flush">
        <Stat label="banks" value={formatCount(directory.banks)} note={`in the directory, across ${formatCount(directory.countries)} countries`} />
        <Stat label="settlement routes" value={formatCount(ssi.rows)} note="SSI rows, each with its provenance" />
        <Stat
          label="payment rails"
          value={formatCount(rails.totalRailCount)}
          note={`${formatCount(rails.domesticSchemeCount)} domestic schemes in ${formatCount(rails.currencyCount)} currencies, plus SWIFT gpi`}
        />
        <Stat label="real money moved" value={demo.realMoneyMoved} note="it is a simulation, always" />
      </div>
      <p className="wrap caption lbl">Counts describe the reference data shipped with this release.</p>
    </section>
  );
}
```

Create `frontend/src/landing/render/sections/Route.tsx`:

```tsx
import type { Demo } from "../demo";
import { formatAmount } from "../format";
import { Head, Pluses, SectionLabel } from "./shared";

/**
 * The route path runs along the stage's own grid lines. Total length is
 * 320 + 120 + 480 + 120 + 480 = 1520, so the two inner nodes sit at
 * 320 / 1520 and 920 / 1520 of the way along it.
 */
const ROUTE_PATH = "M-200 120 H120 V240 H600 V360 H1080";
const HOPS = [
  { at: "0.211", node: { x: 113, y: 113 }, tag: "t1", role: "origin" },
  { at: "0.605", node: { x: 593, y: 233 }, tag: "t2", role: "correspondent" },
  { at: "1", node: { x: 1066, y: 353 }, tag: "t3", role: "beneficiary" },
] as const;
/** The vertical stepper fills from its own progress, so its thresholds differ. */
const STEP_AT = ["0.2", "0.55", "0.9"] as const;

export function Route({ demo }: { demo: Demo }) {
  const { payment } = demo;
  const parties = [payment.origin, payment.correspondent, payment.beneficiary];
  const notes = ["IBAN checked · mod-97", "settles through its nostro", "credited · UETR tracked"];
  const amount = `${payment.currency} ${formatAmount(payment.amount).replace(/\.00$/, "")}`;
  return (
    <section className="s" id="route">
      <Pluses />
      <div className="wrap">
        <Head
          label={<SectionLabel index="01" title="follow every hop" simulation />}
          title={
            <>
              The payment runs on the <em>page's own lines</em>.
            </>
          }
          lede={`Scroll, and ${amount} leaves ${payment.origin.name} in ${payment.origin.place}, clears through ${payment.correspondent.name} in ${payment.correspondent.place}, and lands at ${payment.beneficiary.name}. All three banks are fictional; the steps are real.`}
        />
        <div className="routebox">
          <div className="rstage" id="route-stage">
            <div className="cells" aria-hidden="true" />
            <svg className="route-svg" viewBox="0 0 1080 456" preserveAspectRatio="none" aria-hidden="true">
              <path className="route-bg" d={ROUTE_PATH} />
              <path className="route-fg" id="route-path" d={ROUTE_PATH} pathLength={1} />
              {HOPS.map((hop) => (
                <rect key={hop.at} className="node" data-at={hop.at} x={hop.node.x} y={hop.node.y} width="14" height="14" />
              ))}
              <rect className="packet" id="route-packet" width="10" height="10" x="-5" y="-5" transform="translate(1080 360)" />
            </svg>
            {HOPS.map((hop, index) => (
              <div key={hop.at} className={`tag lbl ${hop.tag}`} data-at={hop.at}>
                <i>[ 0{index + 1} ]</i> {hop.role}
                <b>
                  {parties[index].name} · {parties[index].place}
                </b>
                <span className="m">{notes[index]}</span>
              </div>
            ))}
          </div>
          <div className="vroute" id="route-steps">
            <ol>
              {HOPS.map((hop, index) => (
                <li key={hop.at} data-at={STEP_AT[index]}>
                  <span className="lbl">
                    <i>[ 0{index + 1} ]</i> {hop.role}
                  </span>
                  <b>
                    {parties[index].name} · {parties[index].place}
                  </b>
                  <span className="m">{notes[index]}</span>
                </li>
              ))}
            </ol>
          </div>
          <div className="grid g3 steps">
            <a href="/app/operate/prepare">
              <span className="lbl">Validate</span>
              <h3>Is the instruction well-formed?</h3>
              <p>IBAN checksum, BIC, amount and currency, before anything leaves {payment.origin.place}.</p>
            </a>
            <a href="/app/operate/prepare">
              <span className="lbl">Verify</span>
              <h3>Is it the right person?</h3>
              <p>The payee's name is matched before the payment is released.</p>
            </a>
            <a href="/app/operate/prepare">
              <span className="lbl">Route</span>
              <h3>Who carries it?</h3>
              <p>Settlement instructions pick the correspondent that holds the nostro.</p>
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
```

Create `frontend/src/landing/render/sections/Anatomy.tsx`:

```tsx
import type { Demo } from "../demo";
import { formatAmount } from "../format";
import { Head, Pluses, SectionLabel } from "./shared";

/** Isometric plate geometry, in SVG user units (viewBox 0 0 520 700). */
export const PLATE = { cx: 200, a: 160, b: 80, t: 10, y0: 130, gap: 112 } as const;

export function Anatomy({ demo }: { demo: Demo }) {
  const { cx, a, b, t, y0, gap } = PLATE;
  const plates: Array<[string, string, string]> = [
    ["0.1", "INSTRUCTION", `pacs.008 · ${demo.payment.currency} ${formatAmount(demo.payment.amount)}`],
    ["0.2", "VALIDATE", "IBAN · BIC · amount"],
    ["0.3", "VERIFY PAYEE", "close match, confirmed"],
    ["0.4", "ROUTE", "correspondent + SSI"],
    ["0.5", "SETTLE", "credited · UETR tracked"],
  ];
  const lastY = y0 + (plates.length - 1) * gap;
  return (
    <section className="s" id="anatomy">
      <Pluses />
      <div className="wrap">
        <div className="anat">
          <div>
            <Head
              single
              label={<SectionLabel index="02" title="anatomy of a payment" simulation />}
              title={
                <>
                  Every payment is five <em>decisions</em>.
                </>
              }
              lede="Take the instruction apart. Each layer is a check a real bank runs, and the curriculum has a lab for each."
            />
            <div className="ledger mono" id="ledger" aria-label="Illustrative timeline of the demonstration payment">
              {demo.ledger.map((row) => (
                <div key={row.time}>
                  <span>{row.time}</span>
                  <span>{row.event}</span>
                  <span>{row.result}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="iso">
            <svg viewBox="0 0 520 700" id="anatomy-svg" aria-hidden="true" data-y0={y0} data-gap={gap}>
              {plates.map(([fig, name, detail], index) => {
                const cy = y0 + index * gap;
                return (
                  <g className="plate" key={fig}>
                    <polygon className="side" points={`${cx - a},${cy} ${cx},${cy + b} ${cx},${cy + b + t} ${cx - a},${cy + t}`} />
                    <polygon className="side2" points={`${cx + a},${cy} ${cx},${cy + b} ${cx},${cy + b + t} ${cx + a},${cy + t}`} />
                    <polygon className="top" points={`${cx},${cy - b} ${cx + a},${cy} ${cx},${cy + b} ${cx - a},${cy}`} />
                    <path className="tick" d={`M${cx - a / 2} ${cy - b / 2} L${cx + a / 2} ${cy + b / 2} M${cx + a / 2} ${cy - b / 2} L${cx - a / 2} ${cy + b / 2}`} />
                    <line className="ld" x1={cx + a} y1={cy} x2="512" y2={cy} />
                    <text x="512" y={cy - 10} textAnchor="end">
                      FIG {fig}
                    </text>
                    <text className="n" x="512" y={cy + 14} textAnchor="end">
                      {name}
                    </text>
                    <text className="d" x="512" y={cy + 30} textAnchor="end">
                      {detail}
                    </text>
                  </g>
                );
              })}
              <g id="anatomy-cube" transform={`translate(0 ${lastY})`}>
                <polygon className="cube1" points={`${cx},-16 ${cx + 16},-8 ${cx},0 ${cx - 16},-8`} />
                <polygon className="cube2" points={`${cx - 16},-8 ${cx},0 ${cx},16 ${cx - 16},8`} />
                <polygon className="cube3" points={`${cx + 16},-8 ${cx},0 ${cx},16 ${cx + 16},8`} />
              </g>
            </svg>
          </div>
        </div>
      </div>
    </section>
  );
}
```

Create `frontend/src/landing/render/sections/Rails.tsx`:

```tsx
import { orderedRails, railHighlights } from "../content";
import type { LandingFacts } from "../facts";
import { formatCount } from "../format";
import { Head, Pluses, SectionLabel } from "./shared";

interface Panel {
  id: string;
  code: string;
  region: string;
  verifiedAsOf: string;
  schemes: Array<{ name: string; speed: string; limit: string; cost: string }>;
}

function count(n: number): string {
  return n === 1 ? "1 rail" : `${formatCount(n)} rails`;
}

export function Rails({ facts }: { facts: LandingFacts }) {
  const panels: Panel[] = [
    ...orderedRails(facts).map((c) => ({
      id: c.code.toLowerCase(),
      code: c.code,
      region: c.country,
      verifiedAsOf: c.verifiedAsOf,
      schemes: c.schemes,
    })),
    {
      id: "swift",
      code: "SWIFT",
      region: "Cross-border",
      verifiedAsOf: facts.rails.international.verifiedAsOf,
      schemes: [facts.rails.international],
    },
  ];
  const highlights = railHighlights(facts);
  return (
    <section className="s" id="rails">
      <Pluses />
      <div className="wrap">
        <Head
          label={<SectionLabel index="03" title="every rail, every currency" />}
          title={
            <>
              One payment. <em>{formatCount(facts.rails.totalRailCount)} rails</em> to learn.
            </>
          }
          lede={`${highlights[0].scheme} for ${highlights[0].code}, ${highlights[1].scheme} and ${highlights[2].scheme} for ${highlights[1].code}, ${highlights[3].scheme} for ${highlights[3].code}, ${highlights[4].scheme} for ${highlights[4].code}: each rail with its speed, limits and cost.`}
        />
        <div className="tabs" role="tablist" aria-label="Payment rails by currency" id="rail-tabs">
          {panels.map((panel, index) => (
            <button
              type="button"
              role="tab"
              key={panel.id}
              id={`rail-tab-${panel.id}`}
              aria-controls={`rail-panel-${panel.id}`}
              aria-selected={index === 0 ? "true" : "false"}
              tabIndex={index === 0 ? 0 : -1}
            >
              {panel.code}
            </button>
          ))}
        </div>
        <div className="panels" id="rail-panels">
          {panels.map((panel) => (
            <div className="panel" role="tabpanel" key={panel.id} id={`rail-panel-${panel.id}`} aria-labelledby={`rail-tab-${panel.id}`}>
              <div>
                <span className="lbl">
                  <i>[ {panel.code} ]</i> {panel.region}
                </span>
                <div className="big">{count(panel.schemes.length)}</div>
                <p className="desc">
                  Speed, limit and cost for each scheme, verified as of {panel.verifiedAsOf}.{" "}
                  <a href="/app/explore/schemes">Compare them in Explore</a>
                </p>
              </div>
              <div className="schemes">
                {panel.schemes.map((scheme) => (
                  <div key={scheme.name}>
                    <b>{scheme.name}</b>
                    <span>
                      <span className="k">speed</span>
                      {scheme.speed}
                    </span>
                    <span>
                      <span className="k">limit · cost</span>
                      {scheme.limit} · {scheme.cost}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
```

Create `frontend/src/landing/render/sections/Data.tsx`:

```tsx
import { Fragment } from "react";
import type { Demo } from "../demo";
import type { LandingFacts } from "../facts";
import { formatCount } from "../format";
import { Head, Pluses, SectionLabel } from "./shared";

function sortCode(digits: string): string {
  return digits.match(/.{2}/g)!.join("-");
}

export function Data({ facts, demo }: { facts: LandingFacts; demo: Demo }) {
  const { directory, ssi, atlas } = facts;
  const { iban, payee } = demo;
  const checks: Array<[string, string]> = [
    [`Country ${iban.countryCode} · length ${iban.length}`, "pass"],
    [`Check digits ${iban.checkDigits} · mod-97`, "valid"],
    [`Bank ${iban.bankCode} · sort code ${sortCode(iban.sortCode)}`, "parsed"],
    ["Next: verify the payee", "→"],
  ];
  const stats: Array<[string, number, string]> = [
    ["SSI routes", ssi.rows, `${formatCount(ssi.settleableRows)} with settlement fields`],
    ["beneficiary banks", ssi.beneficiaryBanks, "with instructions on file"],
    ["correspondents", ssi.correspondents, "distinct correspondent BICs"],
    ["atlas", atlas.beneficiaryCountries, "beneficiary countries mapped"],
  ];
  return (
    <section className="s band" id="data">
      <Pluses />
      <div className="cells dim" aria-hidden="true" />
      <div className="wrap">
        <Head
          label={<SectionLabel index="04" title="the data behind the route" simulation />}
          title={
            <>
              Real reference data. <em>Fictional money.</em>
            </>
          }
          lede={`${formatCount(directory.banks)} banks, ${formatCount(ssi.rows)} settlement routes and a correspondent atlas covering ${formatCount(atlas.beneficiaryCountries)} countries. Every SSI row shows its provenance, and every account number is an ACCT- placeholder.`}
        />
        <div className="grid g4">
          {stats.map(([label, value, note]) => (
            <div className="stat" key={label}>
              <span className="lbl">
                <i>[</i> {label} <i>]</i>
              </span>
              <b data-count="">{formatCount(value)}</b>
              <small>{note}</small>
            </div>
          ))}
        </div>
        <div className="grid g3">
          <div className="ibanbox">
            <span className="lbl">
              <i>[ beneficiary bank ]</i> watch it validate
            </span>
            <div className="iban" id="iban-demo">
              {iban.groups.map((group) => (
                <span key={group}>{group}</span>
              ))}
            </div>
            <div className="checks" id="iban-checks">
              {checks.map(([text, result]) => (
                <div key={text}>
                  <span>{text}</span>
                  <b>{result}</b>
                </div>
              ))}
            </div>
            <button type="button" className="btn replay" id="iban-replay" hidden>
              Replay
            </button>
          </div>
          <div className="ssi">
            <span className="lbl">
              <i>[ settlement instruction ]</i> sample record · fictional
            </span>
            <dl>
              {demo.ssiSample.map(([key, value]) => (
                <Fragment key={key}>
                  <dt>{key}</dt>
                  <dd>{value}</dd>
                </Fragment>
              ))}
            </dl>
            <span className="prov">source and as-of date on every real row</span>
          </div>
          <div className="vop">
            <span className="lbl">
              <i>[ verification of payee ]</i>
            </span>
            <div className="pair">
              <div>
                <span className="lbl who">entered</span>
                {payee.entered}
              </div>
              <span aria-hidden="true">→</span>
              <div>
                <span className="lbl who">on file</span>
                {payee.onFile}
              </div>
            </div>
            <span className="res">
              <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
                <circle cx="5" cy="5" r="4" fill="none" stroke="currentColor" strokeWidth="1.5" />
                <path d="M5 1a4 4 0 0 1 0 8z" fill="currentColor" />
              </svg>
              close match · confirm before sending
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
```

Create `frontend/src/landing/render/sections/Learn.tsx`:

```tsx
import type { LearnSummary } from "../content";
import { formatCount, formatHours } from "../format";
import { Head, Pluses, SectionLabel } from "./shared";

export function Learn({ learn }: { learn: LearnSummary }) {
  return (
    <section className="s" id="learn">
      <Pluses />
      <div className="wrap">
        <Head
          label={<SectionLabel index="05" title="learn it properly" />}
          title={
            <>
              <em>{formatCount(learn.coreCount)} modules</em> and a capstone.
            </>
          }
          lede={`${formatCount(learn.coreCount)} core modules, from BICs to nostro reconciliation, then a capstone that runs a full payment. Between ${formatHours(learn.minutes.min)} and ${formatHours(learn.minutes.max)} hours in all.`}
        />
        <div className="mods">
          {learn.modules.map((module) => (
            <a key={module.href} href={module.href} className={module.kind === "capstone" ? "cap" : undefined}>
              <span className="n">{module.number}</span>
              <b>{module.title}</b>
              <small>{module.kind}</small>
            </a>
          ))}
        </div>
        <div className="grid g3 cards">
          <a href="/app/learn">
            <span className="lbl">
              <i>[</i> labs <i>]</i>
            </span>
            <h3>{formatCount(learn.labCount)} hands-on labs</h3>
            <p>One per module: check an IBAN, route a payment, repair an MT103.</p>
          </a>
          <a href="/app/learn/practice">
            <span className="lbl">
              <i>[</i> practice <i>]</i>
            </span>
            <h3>{formatCount(learn.questionCount)} practice questions</h3>
            <p>
              Across the {formatCount(learn.practiceModuleCount)} core modules, with a {formatCount(learn.drillSize)}
              -question daily drill.
            </p>
          </a>
          <a href={learn.firstCaseHref}>
            <span className="lbl">
              <i>[</i> case desk <i>]</i>
            </span>
            <h3>{formatCount(learn.caseCount)} customer cases</h3>
            <p>{learn.caseCorridors.join(", ")}.</p>
          </a>
        </div>
      </div>
    </section>
  );
}
```

Create `frontend/src/landing/render/sections/Tools.tsx`:

```tsx
import type { ReactNode } from "react";
import type { Demo } from "../demo";
import type { LandingFacts } from "../facts";
import { formatAmount, formatCount } from "../format";
import { Head, Pluses, SectionLabel } from "./shared";

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

/** The Monday-to-Sunday week around the demonstration send date, in UTC. */
function weekOf(isoDate: string): Date[] {
  const sent = new Date(`${isoDate}T00:00:00Z`);
  const monday = new Date(sent);
  monday.setUTCDate(sent.getUTCDate() - ((sent.getUTCDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(monday);
    day.setUTCDate(monday.getUTCDate() + i);
    return day;
  });
}

/** MT103 field 32A: YYMMDD, currency, amount with a decimal comma. */
function field32A(valueDate: string, currency: string, amount: number): string {
  const [year, month, day] = valueDate.split("-");
  return `${year.slice(2)}${month}${day}${currency}${amount.toFixed(2).replace(".", ",")}`;
}

function Tool({ name, title, href, children, viz }: { name: string; title: string; href: string; children: string; viz: ReactNode }) {
  return (
    <div className="tool">
      <span className="lbl">
        <i>[</i> {name} <i>]</i>
      </span>
      <h3>
        <a href={href}>{title}</a>
      </h3>
      <p>{children}</p>
      <div className="viz">{viz}</div>
    </div>
  );
}

export function Tools({ facts, demo }: { facts: LandingFacts; demo: Demo }) {
  const { tools } = facts;
  const { prepare, fees, screening, valueDate, stp, tracking, payment } = demo;
  const sentDate = valueDate.sentAt.slice(0, 10);
  const holidays = new Set(valueDate.skippedHolidays);
  const message = stp.message;
  const mt103 = [
    `:20:${message.transaction_reference}`,
    `:23B:${message.bank_op_code}`,
    `:32A:${field32A(message.value_date, message.currency, message.interbank_amount)}`,
    `:50K:/${message.ordering.account}`,
    message.ordering.name.toUpperCase(),
    `:59:/${message.beneficiary.account}`,
    message.beneficiary.name.toUpperCase(),
    `:71A:${message.charge_code}`,
    `:121:${message.uetr}`,
  ];
  return (
    <section className="s" id="tools">
      <Pluses />
      <div className="wrap">
        <Head
          label={<SectionLabel index="06" title="the operator's desk" simulation />}
          title={
            <>
              Run the checks a <em>payments team</em> runs.
            </>
          }
          lede="Prepare a payment, split fees OUR, SHA or BEN, screen every hop, find the value date, check an MT103 and track it by UETR."
        />
        <div className="grid g3">
          <Tool
            name="prepare"
            title="Prepare a payment"
            href="/app/operate/prepare"
            viz={
              <>
                <div className="rows">
                  {(["lenient", "standard", "strict"] as const).map((mode) => (
                    <div key={mode} className={mode === "standard" ? "on" : undefined}>
                      <span>{mode}</span>
                      <span>{prepare.verdicts[mode]}</span>
                    </div>
                  ))}
                </div>
                <p className="lbl note">valid IBAN · payee close match</p>
              </>
            }
          >
            {`Validates the IBAN, checks the payee, picks a route and returns one of ${formatCount(tools.verdicts)} verdicts, at lenient, standard or strict settings.`}
          </Tool>
          <Tool
            name="fees"
            title="Who pays the fees?"
            href="/app/operate/fees"
            viz={
              <>
                <div className="rows">
                  {(["OUR", "SHA", "BEN"] as const).map((code) => {
                    const result = fees.byChargeCode[code];
                    return (
                      <div key={code}>
                        <span>{code}</span>
                        <span>{formatAmount(result.received)} arrives</span>
                      </div>
                    );
                  })}
                </div>
                <p className="lbl note">
                  {`${payment.currency} ${formatAmount(payment.amount)} sent · under OUR the sender adds ${formatAmount(fees.byChargeCode.OUR.senderPaysExtra)}`}
                </p>
              </>
            }
          >
            OUR, SHA or BEN: see the lift fee at each hop and what the beneficiary actually receives.
          </Tool>
          <Tool
            name="screening"
            title="Screen every hop"
            href="/app/operate/screening"
            viz={
              <>
                <div className="rows">
                  {screening.hops.map((hop, index) => (
                    <div key={hop.name}>
                      <span>
                        hop {index} · {hop.name}
                      </span>
                      <span>
                        {hop.score.toFixed(2)} · {hop.decision.toLowerCase()}
                      </span>
                    </div>
                  ))}
                </div>
                <p className="lbl note">best watchlist score at each hop</p>
              </>
            }
          >
            {`Fuzzy name matching against a fictional ${formatCount(tools.watchlistEntries)}-entry watchlist, for both parties and every bank on the route, a little stricter at each hop.`}
          </Tool>
        </div>
        <div className="grid g3">
          <Tool
            name="value date"
            title="When does it land?"
            href="/app/operate/value-date"
            viz={
              <>
                <div className="cal" aria-label={`Week of ${sentDate}`}>
                  {WEEKDAYS.map((day, index) => (
                    <span key={`h${index}`} aria-hidden="true">
                      {day}
                    </span>
                  ))}
                  {weekOf(sentDate).map((day, index) => {
                    const iso = day.toISOString().slice(0, 10);
                    const classes = [
                      index >= 5 ? "we" : "",
                      holidays.has(iso) ? "hd" : "",
                      iso === valueDate.valueDate ? "on" : "",
                      iso === sentDate ? "sent" : "",
                    ].filter(Boolean);
                    return (
                      <span key={iso} className={classes.join(" ") || undefined}>
                        {day.getUTCDate()}
                      </span>
                    );
                  })}
                </div>
                <p className="lbl note">
                  {`${valueDate.currency} ${valueDate.scheme.toUpperCase()} · sent after the ${valueDate.cutOff} cut-off · holiday skipped · T+${valueDate.businessDays}`}
                </p>
              </>
            }
          >
            {`Holiday calendars for ${formatCount(tools.holidayCalendars)} currencies, cut-off times and settlement lags from T+${tools.settlementLagDays.min} to T+${tools.settlementLagDays.max}. Instant rails ignore weekends.`}
          </Tool>
          <Tool
            name="stp check"
            title="Will it go straight through?"
            href="/app/operate/stp"
            viz={
              <>
                <pre className="mt">
                  {mt103.map((line) => (
                    <span key={line} className={line.startsWith(":59:") ? "hl" : undefined}>
                      {line}
                      {"\n"}
                    </span>
                  ))}
                </pre>
                <p className="lbl note">
                  <i>{stp.verdict}</i> · {formatCount(tools.stpRules)} / {formatCount(tools.stpRules)} rules pass
                </p>
              </>
            }
          >
            {`${formatCount(tools.stpRules)} rules check an MT103 for straight-through processing, then translate it to ISO 20022 pacs.008.`}
          </Tool>
          <Tool
            name="tracking"
            title="Track it by UETR"
            href="/app/operate/tracking"
            viz={
              <div className="tl">
                {tracking.map((step, index) => (
                  <div key={`${step.status}${index}`} className={index < tracking.length - 1 ? "on" : undefined}>
                    <i aria-hidden="true" />
                    <span>{step.status}</span>
                    <span>{step.code}</span>
                  </div>
                ))}
              </div>
            }
          >
            A simulated gpi timeline from initiated to credited, with each step mapped to its pacs.002 status code.
          </Tool>
        </div>
      </div>
    </section>
  );
}
```

Create `frontend/src/landing/render/sections/Closing.tsx`:

```tsx
import { Pluses } from "./shared";

export const THEME_CHOICES = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "black", label: "Black" },
] as const;

export function Closing({ firstModuleHref }: { firstModuleHref: string }) {
  return (
    <section className="s s-cta" aria-labelledby="cta-title">
      <Pluses />
      <div className="cells" aria-hidden="true" />
      <div className="wrap">
        <span className="lbl">
          <i>[ start ]</i> run it yourself
        </span>
        <h2 id="cta-title">
          Send a payment that goes <em>nowhere</em>.
        </h2>
        <p className="lede">
          Every bank, account and amount you create is fictional. The checks, the routing and the timeline are how
          the real system works.
        </p>
        <div className="ctas">
          <a className="btn pri lg" href="/app">
            Open the simulation
          </a>
          <a className="btn ghost lg" href={firstModuleHref}>
            Start module 1
          </a>
        </div>
      </div>
    </section>
  );
}

export function Footer() {
  return (
    <footer className="s foot">
      <Pluses />
      <div className="wrap lbl">
        <span data-simulation="">
          <i>[ simulation ]</i> demonstration institutions are fictional · reference data shows its provenance ·
          account numbers are <span className="nw">ACCT- placeholders</span>
        </span>
        <span className="themes" role="group" aria-label="Theme">
          {THEME_CHOICES.map((choice) => (
            <button type="button" key={choice.value} data-theme-choice={choice.value} aria-pressed="false">
              {choice.label}
            </button>
          ))}
        </span>
        <span>Relay · educational payment simulation</span>
      </div>
    </footer>
  );
}
```

Create `frontend/src/landing/render/LandingPage.tsx`:

```tsx
import { learnSummary } from "./content";
import type { Demo } from "./demo";
import type { LandingFacts } from "./facts";
import { Anatomy } from "./sections/Anatomy";
import { Closing, Footer } from "./sections/Closing";
import { Data } from "./sections/Data";
import { Hero } from "./sections/Hero";
import { Learn } from "./sections/Learn";
import { Nav } from "./sections/Nav";
import { Rails } from "./sections/Rails";
import { Route } from "./sections/Route";
import { Stats } from "./sections/Stats";
import { Tools } from "./sections/Tools";

export function LandingPage({ facts, demo }: { facts: LandingFacts; demo: Demo }) {
  const learn = learnSummary();
  return (
    <>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <div className="rails" aria-hidden="true">
        <i className="o1" />
        <i className="c1" />
        <i className="c2" />
        <i className="o2" />
      </div>
      <Nav />
      <main id="main">
        <Hero facts={facts} />
        <Stats facts={facts} demo={demo} />
        <Route demo={demo} />
        <Anatomy demo={demo} />
        <Rails facts={facts} />
        <Data facts={facts} demo={demo} />
        <Learn learn={learn} />
        <Tools facts={facts} demo={demo} />
        <Closing firstModuleHref={learn.firstModuleHref} />
      </main>
      <Footer />
    </>
  );
}
```

Create `frontend/src/landing/render/render.tsx`:

```tsx
/**
 * Build-time entry: vite.landing.config.ts loads this through Vite's
 * runnerImport and inlines the markup into landing.html. No React runtime
 * ships to the browser.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { DEMO } from "./demo";
import { parseLandingFacts } from "./facts";
import { LandingPage } from "./LandingPage";

export function renderLanding(rawFacts: unknown): string {
  const facts = parseLandingFacts(rawFacts);
  return renderToStaticMarkup(<LandingPage facts={facts} demo={DEMO} />);
}
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `cd frontend && npx vitest run src/landing/render && npx tsc --noEmit`
Expected: `14 passed` across `content.test.ts` and `render.test.tsx`, then no `tsc` output.

Run: `python -m pytest tests/test_landing_content.py -q && ruff check tests/test_landing_content.py`
Expected: all pass, `All checks passed!`

Check that the guards bite. Temporarily add `Trusted by 9,999 learners.` to the hero lede in `Hero.tsx`, then run `npx vitest run src/landing/render/render.test.tsx`: it fails, listing `"9,999"`. Next, temporarily add `Barclays` to the route lede in `Route.tsx`, then run `python -m pytest tests/test_landing_content.py -q`: it fails. Revert both changes.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/landing/render/sections frontend/src/landing/render/LandingPage.tsx frontend/src/landing/render/render.tsx frontend/src/landing/render/render.test.tsx tests/test_landing_content.py
git commit -m "feat(landing): render the landing page sections from facts and demo data (landing 9)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Theme writer, theme control and the motion flag

**Files:**
- Create: `frontend/src/landing/client/motion.ts`, `preferences.ts`, `theme-control.ts`
- Test: `frontend/src/landing/client/preferences.test.ts`, `frontend/src/landing/client/theme-control.test.ts`

**Interfaces:**
- Consumes, in tests only (tests are outside the boundary):
  - `defaultPreferences` and `loadPreferences()` from `lib/persistence/storage.ts`. `loadVersioned` returns the parsed record without merging defaults, and only `theme` is coerced.
  - `applyTheme(theme, prefersDark, root)` from `design-system/theme.ts`.
- Produces:
  - `motionAllowed(root?) -> boolean`;
  - `PREFERENCES_KEY`, `type ThemeChoice`, `THEME_CHOICES`, `DEFAULT_PREFERENCES`, `type PreferenceStorage`, `storedTheme(storage) -> ThemeChoice`, `writeTheme(storage, theme) -> boolean` and `pageStorage() -> PreferenceStorage | null`;
  - `applyLandingTheme(theme, prefersDark, root)`;
  - `initThemeControl(doc?, storage?, media?)`;
  - the `relay:theme` document event, which Task 12's globe listens for.

These are the spec's writer cases, each a test. The writer:
- merges `theme` into a full v1 record;
- leaves missing fields missing;
- writes the complete default record when nothing is stored;
- never overwrites another `schemaVersion`, corrupt JSON, or a JSON number, array or `null`;
- reports no write when `getItem` or `setItem` throws, or when storage is `null`;
- re-reads at click time (tested through `initThemeControl`, where a cached record would actually be possible).

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/landing/client/preferences.test.ts`:

```ts
import { afterEach, describe, expect, it } from "vitest";
import { defaultPreferences, loadPreferences } from "../../lib/persistence/storage";
import { DEFAULT_PREFERENCES, PREFERENCES_KEY, storedTheme, writeTheme, type PreferenceStorage } from "./preferences";

afterEach(() => localStorage.clear());

const FULL = {
  schemaVersion: 1,
  reducedMotion: true,
  navigationDensity: "compact",
  firstRunGuidanceSeen: ["prepare"],
  theme: "system",
};

function stored(): unknown {
  return JSON.parse(localStorage.getItem(PREFERENCES_KEY) ?? "null");
}

describe("landing theme writer", () => {
  it("keeps its default record equal to the app's", () => {
    expect(DEFAULT_PREFERENCES).toEqual(defaultPreferences);
  });

  it("merges only the theme into a full v1 record", () => {
    localStorage.setItem(PREFERENCES_KEY, JSON.stringify(FULL));
    expect(writeTheme(localStorage, "dark")).toBe(true);
    expect(stored()).toEqual({ ...FULL, theme: "dark" });
    expect(loadPreferences()).toEqual({ ...FULL, theme: "dark" });
  });

  it("leaves missing fields missing in a partial v1 record", () => {
    localStorage.setItem(PREFERENCES_KEY, JSON.stringify({ schemaVersion: 1, reducedMotion: true }));
    writeTheme(localStorage, "light");
    expect(stored()).toEqual({ schemaVersion: 1, reducedMotion: true, theme: "light" });
  });

  it("writes the complete default record when nothing is stored", () => {
    expect(writeTheme(localStorage, "black")).toBe(true);
    expect(stored()).toEqual({ ...defaultPreferences, theme: "black" });
    expect(loadPreferences()).toEqual({ ...defaultPreferences, theme: "black" });
  });

  it.each([
    ["another schemaVersion", JSON.stringify({ schemaVersion: 2, theme: "light", extra: 1 })],
    ["corrupt JSON", "{not json"],
    ["a JSON number", "42"],
    ["a JSON array", "[1,2]"],
    ["JSON null", "null"],
  ])("never overwrites %s", (_label, raw) => {
    localStorage.setItem(PREFERENCES_KEY, raw);
    expect(writeTheme(localStorage, "dark")).toBe(false);
    expect(localStorage.getItem(PREFERENCES_KEY)).toBe(raw);
  });

  it("reports no write when storage throws on read or write", () => {
    const readFails: PreferenceStorage = {
      getItem: () => {
        throw new DOMException("denied", "SecurityError");
      },
      setItem: () => undefined,
    };
    const writeFails: PreferenceStorage = {
      getItem: () => null,
      setItem: () => {
        throw new DOMException("quota", "QuotaExceededError");
      },
    };
    expect(writeTheme(readFails, "dark")).toBe(false);
    expect(writeTheme(writeFails, "dark")).toBe(false);
    expect(writeTheme(null, "dark")).toBe(false);
    expect(storedTheme(readFails)).toBe("system");
  });

  it("reads the theme only from a valid v1 record", () => {
    expect(storedTheme(localStorage)).toBe("system");
    localStorage.setItem(PREFERENCES_KEY, JSON.stringify({ ...FULL, theme: "black" }));
    expect(storedTheme(localStorage)).toBe("black");
    localStorage.setItem(PREFERENCES_KEY, JSON.stringify({ schemaVersion: 2, theme: "black" }));
    expect(storedTheme(localStorage)).toBe("system");
    localStorage.setItem(PREFERENCES_KEY, JSON.stringify({ schemaVersion: 1, theme: "neon" }));
    expect(storedTheme(localStorage)).toBe("system");
  });
});
```

Create `frontend/src/landing/client/theme-control.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { applyTheme } from "../../design-system/theme";
import type { RelayTheme } from "../../design-system/types";
import { PREFERENCES_KEY, THEME_CHOICES } from "./preferences";
import { applyLandingTheme, initThemeControl } from "./theme-control";

function fakeMedia(matches: boolean) {
  const listeners: Array<() => void> = [];
  const query = {
    matches,
    addEventListener: (_type: string, listener: () => void) => listeners.push(listener),
  } as unknown as MediaQueryList;
  return { media: () => query, fire: () => listeners.forEach((listener) => listener()), query };
}

function mountControl(): HTMLButtonElement[] {
  document.body.innerHTML = THEME_CHOICES.map(
    (theme) => `<button type="button" data-theme-choice="${theme}" aria-pressed="false">${theme}</button>`,
  ).join("");
  return Array.from(document.querySelectorAll("button"));
}

afterEach(() => {
  document.body.innerHTML = "";
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.style.colorScheme = "";
  localStorage.clear();
});

describe("applyLandingTheme", () => {
  it.each(THEME_CHOICES.flatMap((theme) => [[theme, true], [theme, false]] as const))(
    "matches the app's applyTheme for %s with osDark=%s",
    (theme, osDark) => {
      const ours = document.createElement("div");
      const app = document.createElement("div");
      applyLandingTheme(theme, osDark, ours);
      applyTheme(theme as RelayTheme, osDark, app);
      expect(ours.getAttribute("data-theme")).toBe(app.getAttribute("data-theme"));
      expect(ours.style.colorScheme).toBe(app.style.colorScheme);
    },
  );
});

describe("initThemeControl", () => {
  it("presses the stored theme on load and switches on click", () => {
    localStorage.setItem(PREFERENCES_KEY, JSON.stringify({ schemaVersion: 1, reducedMotion: false, navigationDensity: "comfortable", firstRunGuidanceSeen: [], theme: "dark" }));
    const buttons = mountControl();
    const { media } = fakeMedia(false);
    const onTheme = vi.fn();
    document.addEventListener("relay:theme", onTheme);
    initThemeControl(document, localStorage, media);
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(buttons.find((b) => b.dataset.themeChoice === "dark")!.getAttribute("aria-pressed")).toBe("true");

    buttons.find((b) => b.dataset.themeChoice === "black")!.click();
    expect(document.documentElement.getAttribute("data-theme")).toBe("black");
    expect(JSON.parse(localStorage.getItem(PREFERENCES_KEY)!).theme).toBe("black");
    expect(onTheme).toHaveBeenCalledTimes(2);
    document.removeEventListener("relay:theme", onTheme);
  });

  it("re-reads storage at click time instead of using the record seen at load", () => {
    const loaded = { schemaVersion: 1, reducedMotion: false, navigationDensity: "comfortable", firstRunGuidanceSeen: [], theme: "system" };
    localStorage.setItem(PREFERENCES_KEY, JSON.stringify(loaded));
    const buttons = mountControl();
    initThemeControl(document, localStorage, fakeMedia(false).media);
    // The app, open in another tab, changes a field after this page loaded.
    localStorage.setItem(PREFERENCES_KEY, JSON.stringify({ ...loaded, reducedMotion: true }));
    buttons.find((b) => b.dataset.themeChoice === "light")!.click();
    expect(JSON.parse(localStorage.getItem(PREFERENCES_KEY)!)).toEqual({ ...loaded, reducedMotion: true, theme: "light" });
  });

  it("changes the theme for the page only when the record is foreign", () => {
    localStorage.setItem(PREFERENCES_KEY, JSON.stringify({ schemaVersion: 2, theme: "light" }));
    const buttons = mountControl();
    initThemeControl(document, localStorage, fakeMedia(false).media);
    buttons.find((b) => b.dataset.themeChoice === "dark")!.click();
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(localStorage.getItem(PREFERENCES_KEY)).toBe(JSON.stringify({ schemaVersion: 2, theme: "light" }));
  });

  it("follows the OS while the choice is system", () => {
    mountControl();
    const { media, fire, query } = fakeMedia(false);
    initThemeControl(document, localStorage, media);
    expect(document.documentElement.style.colorScheme).toBe("light");
    (query as { matches: boolean }).matches = true;
    fire();
    expect(document.documentElement.style.colorScheme).toBe("dark");
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd frontend && npx vitest run src/landing/client/preferences.test.ts src/landing/client/theme-control.test.ts`
Expected: FAIL. `./preferences` and `./theme-control` cannot be resolved.

- [ ] **Step 3: Implement**

Create `frontend/src/landing/client/motion.ts`:

```ts
/**
 * Whether the page may animate. The pre-paint script in landing.html decides
 * once, before first paint, from prefers-reduced-motion and the stored
 * reducedMotion preference, and records it as html.motion. Every enhancer asks
 * here instead of re-deriving it.
 */
export function motionAllowed(root: HTMLElement = document.documentElement): boolean {
  return root.classList.contains("motion");
}
```

Create `frontend/src/landing/client/preferences.ts`:

```ts
/**
 * The landing page's only write to the app's storage: the theme.
 *
 * The app's loader (lib/persistence/storage.ts loadVersioned) does not merge
 * defaults, so a partial record would reach the app as-is. This writer:
 *   - re-reads storage at the moment of the write;
 *   - merges only `theme` into a valid schemaVersion 1 record, never adding,
 *     removing or repairing other fields;
 *   - writes the complete default record when nothing is stored;
 *   - never overwrites a record that is corrupt, is not an object, or has
 *     another schemaVersion. Then, and whenever storage throws, the theme
 *     changes for the current page only.
 * preferences.test.ts round-trips every case through the app's loadPreferences().
 */
export const PREFERENCES_KEY = "relay:preferences";

export type ThemeChoice = "system" | "light" | "dark" | "black";
export const THEME_CHOICES: readonly ThemeChoice[] = ["system", "light", "dark", "black"];

/** Must equal defaultPreferences in lib/persistence/storage.ts (pinned by a test). */
export const DEFAULT_PREFERENCES = {
  schemaVersion: 1,
  reducedMotion: false,
  navigationDensity: "comfortable",
  firstRunGuidanceSeen: [] as string[],
  theme: "system" as ThemeChoice,
};

export type PreferenceStorage = Pick<Storage, "getItem" | "setItem">;

type Stored =
  | { kind: "empty" }
  | { kind: "v1"; record: Record<string, unknown> }
  | { kind: "foreign" };

function isThemeChoice(value: unknown): value is ThemeChoice {
  return THEME_CHOICES.includes(value as ThemeChoice);
}

function readStored(storage: PreferenceStorage): Stored {
  const raw = storage.getItem(PREFERENCES_KEY);
  if (raw === null || raw === "") return { kind: "empty" };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { kind: "foreign" };
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return { kind: "foreign" };
  const record = parsed as Record<string, unknown>;
  return record.schemaVersion === 1 ? { kind: "v1", record } : { kind: "foreign" };
}

/** The stored theme, or "system" for anything absent, unreadable or foreign. */
export function storedTheme(storage: PreferenceStorage | null): ThemeChoice {
  if (!storage) return "system";
  try {
    const stored = readStored(storage);
    return stored.kind === "v1" && isThemeChoice(stored.record.theme) ? stored.record.theme : "system";
  } catch {
    return "system";
  }
}

/** Persist the theme if the stored record allows it. Returns whether it was written. */
export function writeTheme(storage: PreferenceStorage | null, theme: ThemeChoice): boolean {
  if (!storage) return false;
  try {
    const stored = readStored(storage);
    if (stored.kind === "foreign") return false;
    const next = stored.kind === "v1" ? { ...stored.record, theme } : { ...DEFAULT_PREFERENCES, theme };
    storage.setItem(PREFERENCES_KEY, JSON.stringify(next));
    return true;
  } catch {
    return false;
  }
}

/** localStorage, or null where reading the property itself throws (blocked storage). */
export function pageStorage(): PreferenceStorage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
```

Create `frontend/src/landing/client/theme-control.ts`:

```ts
/**
 * Footer theme control: System, Light, Dark, Black. Applies the theme the same
 * way the app's applyTheme() does (theme-control.test.ts pins the parity) and
 * announces the change with a relay:theme event so the globe can repaint.
 */
import { pageStorage, storedTheme, writeTheme, type PreferenceStorage, type ThemeChoice } from "./preferences";

const DARK_QUERY = "(prefers-color-scheme: dark)";

export function applyLandingTheme(theme: ThemeChoice, prefersDark: boolean, root: HTMLElement): void {
  if (theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
  const dark = theme === "dark" || theme === "black" || (theme === "system" && prefersDark);
  root.style.colorScheme = dark ? "dark" : "light";
}

export function initThemeControl(
  doc: Document = document,
  storage: PreferenceStorage | null = pageStorage(),
  media: (query: string) => MediaQueryList = (query) => window.matchMedia(query),
): void {
  const buttons = Array.from(doc.querySelectorAll<HTMLButtonElement>("[data-theme-choice]"));
  if (buttons.length === 0) return;
  const darkQuery = media(DARK_QUERY);
  let session: ThemeChoice | null = null;
  const current = (): ThemeChoice => session ?? storedTheme(storage);

  const apply = (theme: ThemeChoice) => {
    applyLandingTheme(theme, darkQuery.matches, doc.documentElement);
    for (const button of buttons) button.setAttribute("aria-pressed", String(button.dataset.themeChoice === theme));
    doc.dispatchEvent(new CustomEvent("relay:theme"));
  };

  for (const button of buttons) {
    button.addEventListener("click", () => {
      const theme = button.dataset.themeChoice as ThemeChoice;
      writeTheme(storage, theme);
      session = theme;
      apply(theme);
    });
  }
  darkQuery.addEventListener("change", () => {
    if (current() === "system") apply("system");
  });
  apply(current());
}
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `cd frontend && npx vitest run src/landing/client/preferences.test.ts src/landing/client/theme-control.test.ts && npx tsc --noEmit`
Expected: `23 passed` (11 and 12), then no `tsc` output.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/landing/client/motion.ts frontend/src/landing/client/preferences.ts frontend/src/landing/client/theme-control.ts frontend/src/landing/client/preferences.test.ts frontend/src/landing/client/theme-control.test.ts
git commit -m "feat(landing): add the theme control and the app-safe preference writer (landing 10)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Tabs, counters, the IBAN demo and the scroll-driven sections

**Files:**
- Create: `frontend/src/landing/client/progress.ts`, `rails-tabs.ts`, `counters.ts`, `iban-demo.ts`, `scroll-route.ts`, `anatomy.ts`
- Test: `frontend/src/landing/client/enhancers.test.ts`, `frontend/src/landing/client/progress.test.ts`

**Interfaces:**
- Consumes: `motionAllowed()` (Task 10) and the ids from Task 9.
- Produces:
  - `scrollProgress(rect, viewportHeight, startAt, span) -> number`;
  - `initRailTabs(doc?)`;
  - `countUp(element, raf?, clock?)` and `initCounters(doc?)`;
  - `IBAN_STEP_MS = 420` and `initIbanDemo(doc?)`;
  - `initScrollRoute(doc?, win?)`;
  - `cubeY(progress, firstPlateY, gap, plates)` and `initAnatomy(doc?, win?)`.

Each `init*` does nothing when its elements are missing. The motion-dependent ones also do nothing without `html.motion`, because Task 8's CSS already shows the final state.

Two behaviours in the tabs:
- They add `.ready` to `#rail-panels` after setting `hidden`, which hands control from the pre-paint CSS rule to the attribute.
- The stepper uses its own thresholds (0.2, 0.55, 0.9). The stage nodes sit at the route's real length fractions: 320/1520 and 920/1520, rendered as 0.211 and 0.605.

`scroll-route.ts` and `anatomy.ts` need layout, so beyond `scrollProgress` and `cubeY` they are covered by the E2E containment sweep in Task 16.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/landing/client/enhancers.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { countUp, initCounters } from "./counters";
import { IBAN_STEP_MS, initIbanDemo } from "./iban-demo";
import { initRailTabs } from "./rails-tabs";

afterEach(() => {
  document.body.innerHTML = "";
  document.documentElement.className = "";
  vi.useRealTimers();
});

function mountTabs(): HTMLButtonElement[] {
  const codes = ["gbp", "cad", "usd", "swift"];
  document.body.innerHTML = `
    <div role="tablist" id="rail-tabs">${codes
      .map((c, i) => `<button role="tab" id="rail-tab-${c}" aria-controls="rail-panel-${c}" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}">${c}</button>`)
      .join("")}</div>
    <div id="rail-panels">${codes.map((c) => `<div role="tabpanel" id="rail-panel-${c}" aria-labelledby="rail-tab-${c}">${c}</div>`).join("")}</div>`;
  initRailTabs(document);
  return Array.from(document.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
}

function panelVisible(code: string): boolean {
  return !document.getElementById(`rail-panel-${code}`)!.hidden;
}

describe("rail tabs", () => {
  it("shows only the selected panel once enhanced", () => {
    mountTabs();
    expect(document.getElementById("rail-panels")!.classList.contains("ready")).toBe(true);
    expect(["gbp", "cad", "usd", "swift"].map(panelVisible)).toEqual([true, false, false, false]);
  });

  it("moves with arrow keys, wrapping at both ends, and jumps with Home and End", () => {
    const tabs = mountTabs();
    const press = (tab: HTMLElement, key: string) => tab.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
    press(tabs[0], "ArrowLeft");
    expect(document.activeElement).toBe(tabs[3]);
    expect(panelVisible("swift")).toBe(true);
    press(tabs[3], "ArrowRight");
    expect(document.activeElement).toBe(tabs[0]);
    press(tabs[0], "End");
    expect(tabs[3].getAttribute("aria-selected")).toBe("true");
    expect(tabs[3].tabIndex).toBe(0);
    expect(tabs[0].tabIndex).toBe(-1);
    press(tabs[3], "Home");
    expect(panelVisible("gbp")).toBe(true);
  });

  it("selects on click", () => {
    const tabs = mountTabs();
    tabs[2].click();
    expect(panelVisible("usd")).toBe(true);
    expect(panelVisible("gbp")).toBe(false);
  });
});

describe("counters", () => {
  it("keeps the final value readable while an aria-hidden overlay animates", () => {
    document.body.innerHTML = `<b id="n">12,196</b>`;
    const element = document.getElementById("n")!;
    const frames: FrameRequestCallback[] = [];
    let now = 0;
    countUp(element, (cb) => frames.push(cb), () => now);
    expect(element.querySelector(".sr")!.textContent).toBe("12,196");
    expect(element.querySelector('[aria-hidden="true"]')!.textContent).toBe("0");
    now = 1100;
    frames.shift()!(now);
    expect(element.textContent).toBe("12,196");
    expect(element.children).toHaveLength(0);
  });

  it("leaves zero and non-numbers alone", () => {
    document.body.innerHTML = `<b id="z">0.00</b>`;
    const element = document.getElementById("z")!;
    countUp(element, () => 0, () => 0);
    expect(element.innerHTML).toBe("0.00");
  });

  it("does nothing without motion", () => {
    document.body.innerHTML = `<b data-count="">761</b>`;
    const observe = vi.fn();
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        observe = observe;
        unobserve() {}
      },
    );
    initCounters(document);
    expect(observe).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe("IBAN demo", () => {
  function mountIban() {
    document.body.innerHTML = `
      <div id="iban-demo"><span>GB82</span><span>WEST</span></div>
      <div id="iban-checks"><div>a</div><div>b</div></div>
      <button id="iban-replay" hidden>Replay</button>`;
  }

  it("plays once when visible, then offers Replay", () => {
    vi.useFakeTimers();
    mountIban();
    document.documentElement.classList.add("motion");
    let onIntersect: IntersectionObserverCallback = () => undefined;
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(callback: IntersectionObserverCallback) {
          onIntersect = callback;
        }
        observe() {}
        disconnect() {}
      },
    );
    initIbanDemo(document);
    onIntersect([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
    const replay = document.getElementById("iban-replay")!;
    expect(replay.hidden).toBe(true);
    vi.advanceTimersByTime(IBAN_STEP_MS * 2);
    expect(document.querySelectorAll("#iban-demo .on")).toHaveLength(2);
    expect(document.querySelectorAll("#iban-checks .on")).toHaveLength(0);
    vi.advanceTimersByTime(IBAN_STEP_MS * 2);
    expect(document.querySelectorAll("#iban-checks .on")).toHaveLength(2);
    expect(replay.hidden).toBe(false);
    replay.click();
    expect(replay.hidden).toBe(true);
    expect(document.querySelectorAll("#iban-demo .on")).toHaveLength(0);
    vi.unstubAllGlobals();
  });

  it("does nothing without motion, leaving the CSS final state", () => {
    mountIban();
    initIbanDemo(document);
    expect(document.querySelectorAll(".on")).toHaveLength(0);
    expect(document.getElementById("iban-replay")!.hidden).toBe(true);
  });
});
```

Create `frontend/src/landing/client/progress.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { cubeY } from "./anatomy";
import { scrollProgress } from "./progress";

describe("scroll progress", () => {
  it("runs from 0 to 1 as the element crosses the viewport, clamped", () => {
    expect(scrollProgress({ top: 900, height: 500 }, 1000, 0.8, 1)).toBe(0);
    expect(scrollProgress({ top: 550, height: 500 }, 1000, 0.8, 1)).toBeCloseTo(0.5);
    expect(scrollProgress({ top: -2000, height: 500 }, 1000, 0.8, 1)).toBe(1);
  });

  it("treats a collapsed element as finished", () => {
    expect(scrollProgress({ top: 0, height: 0 }, 1000, 0.8, 1)).toBe(1);
  });

  it("drops the anatomy cube from above the first plate to the last", () => {
    expect(cubeY(0, 130, 112, 5)).toBe(40);
    expect(cubeY(1, 130, 112, 5)).toBe(130 + 4 * 112);
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd frontend && npx vitest run src/landing/client/enhancers.test.ts src/landing/client/progress.test.ts`
Expected: FAIL. `./counters`, `./iban-demo`, `./rails-tabs`, `./anatomy` and `./progress` cannot be resolved.

- [ ] **Step 3: Implement**

Create `frontend/src/landing/client/progress.ts`:

```ts
/** Scroll progress of an element through the viewport, from 0 to 1. */
export function scrollProgress(
  rect: { top: number; height: number },
  viewportHeight: number,
  startAt: number,
  span: number,
): number {
  if (rect.height <= 0) return 1;
  const value = (viewportHeight * startAt - rect.top) / (rect.height * span);
  return Math.max(0, Math.min(1, value));
}
```

Create `frontend/src/landing/client/rails-tabs.ts`:

```ts
/**
 * WAI-ARIA tabs over the pre-rendered rail panels: automatic activation, a
 * roving tabindex, Left/Right wrapping at the ends, Home and End. Without
 * JavaScript every panel stays visible; landing.css hides the tab list then.
 */
export function initRailTabs(doc: Document = document): void {
  const list = doc.getElementById("rail-tabs");
  const panels = doc.getElementById("rail-panels");
  if (!list || !panels) return;
  const tabs = Array.from(list.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
  if (tabs.length === 0) return;

  const select = (index: number, focus: boolean) => {
    tabs.forEach((tab, i) => {
      const selected = i === index;
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
      const panel = doc.getElementById(tab.getAttribute("aria-controls") ?? "");
      if (panel) panel.hidden = !selected;
    });
    if (focus) tabs[index].focus();
  };

  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => select(index, false));
    tab.addEventListener("keydown", (event) => {
      const last = tabs.length - 1;
      const next =
        event.key === "ArrowRight" ? (index === last ? 0 : index + 1)
        : event.key === "ArrowLeft" ? (index === 0 ? last : index - 1)
        : event.key === "Home" ? 0
        : event.key === "End" ? last
        : -1;
      if (next < 0) return;
      event.preventDefault();
      select(next, true);
    });
  });

  const initial = tabs.findIndex((tab) => tab.getAttribute("aria-selected") === "true");
  select(initial < 0 ? 0 : initial, false);
  // From here the hidden attribute, not the pre-paint CSS rule, controls the panels.
  panels.classList.add("ready");
}
```

Create `frontend/src/landing/client/counters.ts`:

```ts
/**
 * Stat values count up once, on first view, over 1.1s with an ease-out. The
 * real value stays in the accessibility tree; only an aria-hidden overlay
 * animates, and the final text is restored when the count ends.
 */
import { motionAllowed } from "./motion";

const DURATION_MS = 1100;

export function countUp(
  element: HTMLElement,
  raf: (callback: FrameRequestCallback) => number = (callback) => requestAnimationFrame(callback),
  clock: () => number = () => performance.now(),
): void {
  const text = element.textContent ?? "";
  const decimals = (text.split(".")[1] ?? "").length;
  const target = Number(text.replace(/,/g, ""));
  if (!Number.isFinite(target) || target === 0) return;

  const doc = element.ownerDocument;
  const accessible = doc.createElement("span");
  accessible.className = "sr";
  accessible.textContent = text;
  const overlay = doc.createElement("span");
  overlay.setAttribute("aria-hidden", "true");
  element.replaceChildren(accessible, overlay);

  const start = clock();
  const tick = () => {
    const k = Math.min(1, (clock() - start) / DURATION_MS);
    const value = target * (1 - Math.pow(1 - k, 3));
    overlay.textContent = value.toLocaleString("en-GB", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
    if (k < 1) raf(tick);
    else element.textContent = text;
  };
  tick();
}

export function initCounters(doc: Document = document): void {
  if (!motionAllowed(doc.documentElement) || typeof IntersectionObserver === "undefined") return;
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        observer.unobserve(entry.target);
        countUp(entry.target as HTMLElement);
      }
    },
    { threshold: 0.6 },
  );
  doc.querySelectorAll<HTMLElement>("[data-count]").forEach((element) => observer.observe(element));
}
```

Create `frontend/src/landing/client/iban-demo.ts`:

```ts
/**
 * The example IBAN lights group by group, then its checks, once, when it
 * scrolls into view; then a Replay button appears. Without motion the page
 * already shows the final state (landing.css), so nothing runs.
 */
import { motionAllowed } from "./motion";

export const IBAN_STEP_MS = 420;

export function initIbanDemo(doc: Document = document): void {
  const groups = doc.getElementById("iban-demo");
  const checks = doc.getElementById("iban-checks");
  const replay = doc.getElementById("iban-replay");
  if (!groups || !checks || !replay || !motionAllowed(doc.documentElement)) return;
  const spans = Array.from(groups.children);
  const rows = Array.from(checks.children);
  const total = spans.length + rows.length;
  let step = 0;
  let timer: ReturnType<typeof setInterval> | undefined;

  const paint = () => {
    spans.forEach((span, index) => span.classList.toggle("on", step > index));
    rows.forEach((row, index) => row.classList.toggle("on", step > spans.length + index));
  };
  const play = () => {
    clearInterval(timer);
    replay.hidden = true;
    step = 0;
    paint();
    timer = setInterval(() => {
      step += 1;
      paint();
      if (step >= total) {
        clearInterval(timer);
        replay.hidden = false;
      }
    }, IBAN_STEP_MS);
  };

  replay.addEventListener("click", play);
  paint();
  if (typeof IntersectionObserver === "undefined") {
    play();
    return;
  }
  const observer = new IntersectionObserver((entries) => {
    if (entries.some((entry) => entry.isIntersecting)) {
      observer.disconnect();
      play();
    }
  });
  observer.observe(groups);
}
```

Create `frontend/src/landing/client/scroll-route.ts`:

```ts
/**
 * Section 01. Above 980px the payment runs along the stage's grid lines as the
 * section scrolls; below it, a vertical stepper fills. Each node and tag
 * activates as progress passes its data-at fraction. Without motion the page
 * shows the end state (landing.css) and nothing here runs.
 */
import { motionAllowed } from "./motion";
import { scrollProgress } from "./progress";

export function initScrollRoute(doc: Document = document, win: Window = window): void {
  if (!motionAllowed(doc.documentElement)) return;
  const stage = doc.getElementById("route-stage");
  const path = doc.getElementById("route-path") as SVGPathElement | null;
  const packet = doc.getElementById("route-packet");
  const steps = doc.getElementById("route-steps");
  const list = steps?.querySelector("ol");
  if (!stage || !path || !packet || !steps || !list) return;
  const length = path.getTotalLength();
  const marks = Array.from(stage.querySelectorAll<HTMLElement | SVGElement>("[data-at]"));
  const items = Array.from(list.querySelectorAll<HTMLElement>("li[data-at]"));

  const update = () => {
    if (stage.offsetParent) {
      const p = scrollProgress(stage.getBoundingClientRect(), win.innerHeight, 0.8, 1.05);
      // pathLength="1", so the dash offset runs from 1 (hidden) to 0 (drawn).
      path.style.strokeDashoffset = String(1 - p);
      const point = path.getPointAtLength(length * p);
      packet.setAttribute("transform", `translate(${point.x} ${point.y})`);
      for (const mark of marks) mark.classList.toggle("on", p >= Number(mark.dataset.at) - 0.001);
    }
    if (steps.offsetParent) {
      const p = scrollProgress(steps.getBoundingClientRect(), win.innerHeight, 0.75, 1);
      list.style.setProperty("--p", String(p));
      for (const item of items) item.classList.toggle("on", p >= Number(item.dataset.at));
    }
  };
  win.addEventListener("scroll", update, { passive: true });
  win.addEventListener("resize", update);
  update();
}
```

Create `frontend/src/landing/client/anatomy.ts`:

```ts
/**
 * Section 02. A cube drops through five isometric plates as the section
 * scrolls; each plate and its ledger row activate as the cube reaches it.
 */
import { motionAllowed } from "./motion";
import { scrollProgress } from "./progress";

const CUBE_START_Y = 40;

export function cubeY(progress: number, firstPlateY: number, gap: number, plates: number): number {
  return CUBE_START_Y + progress * (firstPlateY + (plates - 1) * gap - CUBE_START_Y);
}

export function initAnatomy(doc: Document = document, win: Window = window): void {
  if (!motionAllowed(doc.documentElement)) return;
  const section = doc.getElementById("anatomy");
  const svg = doc.getElementById("anatomy-svg");
  const cube = doc.getElementById("anatomy-cube");
  if (!section || !svg || !cube) return;
  const y0 = Number(svg.dataset.y0);
  const gap = Number(svg.dataset.gap);
  const plates = Array.from(svg.querySelectorAll(".plate"));
  const rows = Array.from(doc.querySelectorAll("#ledger > div"));

  const update = () => {
    const p = scrollProgress(section.getBoundingClientRect(), win.innerHeight, 0.72, 0.8);
    const y = cubeY(p, y0, gap, plates.length);
    cube.setAttribute("transform", `translate(0 ${y})`);
    plates.forEach((plate, i) => plate.classList.toggle("on", y >= y0 + i * gap - 4));
    rows.forEach((row, i) => row.classList.toggle("on", y >= y0 + i * gap - 4));
  };
  win.addEventListener("scroll", update, { passive: true });
  update();
}
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `cd frontend && npx vitest run src/landing/client/enhancers.test.ts src/landing/client/progress.test.ts && npx tsc --noEmit`
Expected: `11 passed` (8 and 3), then no `tsc` output. The `IntersectionObserver` stubs are classes, because `vi.fn(() => …)` cannot be called with `new`.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/landing/client/progress.ts frontend/src/landing/client/rails-tabs.ts frontend/src/landing/client/counters.ts frontend/src/landing/client/iban-demo.ts frontend/src/landing/client/scroll-route.ts frontend/src/landing/client/anatomy.ts frontend/src/landing/client/enhancers.test.ts frontend/src/landing/client/progress.test.ts
git commit -m "feat(landing): add tabs, counters, the IBAN demo and scroll-driven sections (landing 11)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: The hero globe

**Files:**
- Create: `frontend/src/landing/client/globe-math.ts`, `frontend/src/landing/client/globe.ts`
- Test: `frontend/src/landing/client/globe-math.test.ts`, `frontend/src/landing/client/globe.test.ts`

**Interfaces:**
- Consumes:
  - `#globe-data`, `[data-corridor]`, `#tour-toggle` and `#globe-stage` (Task 9);
  - `motionAllowed()` and the `relay:theme` event (Task 10);
  - the CSS properties `--gDot`, `--gDotMin`, `--gDotMax`, `--gGrat`, `--gLimb`, `--gPlate`, `--gPlateLine`, `--gInk`, `--gPacket`, `--gNode` and `--c1`…`--c8` (Task 8);
  - a URL for the Task 6 point set.
- Produces:
  - from `globe-math.ts`: `RAD`, `type SpherePoint`, `type Camera`, `camera(lon, lat)`, `project(p, cam, radius, cx, cy)`, `surface(lat, lon)`, `arc(from, to, segments) -> {points, mid}`, `angleDiff(a, b)`, `easeInOutCubic(t)`, `LAT_LIMIT = 75`, `clampLat(lat)`, `TOUR = {move: 1.3, draw: 1.7, hold: 1.1}`, `TOUR_STEP`, `tourPosition(clock, corridors) -> {index, phase, cycle}` and `trailAlpha(age)`;
  - from `globe.ts`: `initGlobe(pointsUrl: string, doc?, win?)`, which Task 13's `main.ts` calls with the imported URL. `globe.ts` never imports the generated file itself, so its tests run without it.

It is a port of the prototype engine (`docs/design/landing-prototype/index.html:434-556`), with these changes:
- **Fetched data.** Corridors come from the page and points are fetched. If the fetch fails, the globe shows the graticule and arcs only.
- **Pause control.** The Pause tour / Play tour control is unhidden only when motion is allowed. Focusing a legend button pauses the tour.
- **Reduced motion.** It draws frames only while something changes and has no inertia. The prototype stopped redrawing during a drag under reduced motion.
- **Theme.** Colours are re-read on `relay:theme` and on OS appearance changes.
- **Degraded.** Without a 2D context the stage collapses (`.stage.off`) and the legend remains.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/landing/client/globe-math.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { angleDiff, arc, camera, clampLat, project, surface, tourPosition, TOUR_STEP, trailAlpha } from "./globe-math";

describe("globe geometry", () => {
  it("projects the camera centre to the middle of the disc, facing the viewer", () => {
    const [x, y, z] = project(surface(18, 10), camera(10, 18), 100, 200, 200);
    expect(x).toBeCloseTo(200);
    expect(y).toBeCloseTo(200);
    expect(z).toBeCloseTo(1);
  });

  it("puts the antipode behind the globe", () => {
    const [, , z] = project(surface(-18, -170), camera(10, 18), 100, 200, 200);
    expect(z).toBeLessThan(0);
  });

  it("draws arcs from start to end, lifted in the middle", () => {
    const { points, mid } = arc([6.45, 3.39], [51.51, -0.13], 72);
    expect(points).toHaveLength(73);
    expect(points[0][3]).toBeCloseTo(1);
    expect(points[72][3]).toBeCloseTo(1);
    expect(points[36][3]).toBeGreaterThan(1.1);
    expect(mid[0]).toBeGreaterThan(6.45);
    expect(mid[0]).toBeLessThan(51.51);
  });

  it("turns the short way round", () => {
    expect(angleDiff(170, -170)).toBe(20);
    expect(angleDiff(-170, 170)).toBe(-20);
    expect(angleDiff(10, 10)).toBe(0);
  });

  it("clamps latitude to ±75°", () => {
    expect(clampLat(90)).toBe(75);
    expect(clampLat(-80)).toBe(-75);
    expect(clampLat(12)).toBe(12);
  });

  it("steps through corridors in order and loops", () => {
    expect(tourPosition(0, 8).index).toBe(0);
    expect(tourPosition(TOUR_STEP * 3 + 0.5, 8)).toMatchObject({ index: 3, cycle: 3 });
    expect(tourPosition(TOUR_STEP * 9, 8).index).toBe(1);
  });

  it("fades trails with age to a floor", () => {
    expect(trailAlpha(0)).toBeCloseTo(0.7);
    expect(trailAlpha(20)).toBe(0.16);
  });
});
```

Create `frontend/src/landing/client/globe.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { initGlobe } from "./globe";

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("globe", () => {
  it("collapses the stage and keeps the legend when there is no 2D context", () => {
    document.body.innerHTML = `
      <div id="globe-stage"><div class="globe-wrap"><canvas id="globe"></canvas></div>
        <script type="application/json" id="globe-data">[{"code":"GBP","from":[6.45,3.39],"to":[51.51,-0.13],"fromLabel":"LAGOS","toLabel":"LONDON"}]</script>
        <button id="tour-toggle" hidden>Pause tour</button></div>
      <div id="legend"><button data-corridor="0">GBP</button></div>`;
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    initGlobe("/points.json");
    expect(document.getElementById("globe-stage")!.classList.contains("off")).toBe(true);
    expect(document.querySelector("[data-corridor]")).not.toBeNull();
    expect(document.getElementById("tour-toggle")!.hidden).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("does nothing when its elements are missing", () => {
    expect(() => initGlobe("/points.json")).not.toThrow();
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd frontend && npx vitest run src/landing/client/globe-math.test.ts src/landing/client/globe.test.ts`
Expected: FAIL. `./globe-math` and `./globe` cannot be resolved.

- [ ] **Step 3: Implement**

Create `frontend/src/landing/client/globe-math.ts`:

```ts
/** Pure geometry and timing for the hero globe. No DOM; unit tested in globe-math.test.ts. */
export const RAD = Math.PI / 180;

/** [sin(lat), cos(lat), lon in degrees, radial scale]. Scale 1 is the surface. */
export type SpherePoint = [number, number, number, number];

export interface Camera {
  lon: number;
  sinLat: number;
  cosLat: number;
}

export function camera(lon: number, lat: number): Camera {
  return { lon, sinLat: Math.sin(lat * RAD), cosLat: Math.cos(lat * RAD) };
}

/**
 * Orthographic projection. Returns screen x, y, the depth z (> 0 faces the
 * viewer) and the squared distance from the centre in globe radii, which tells
 * a lifted arc point apart from one hidden behind the limb.
 */
export function project(p: SpherePoint, cam: Camera, radius: number, cx: number, cy: number): [number, number, number, number] {
  const [sinLat, cosLat, lon, k] = p;
  const l = (lon - cam.lon) * RAD;
  const cosL = Math.cos(l);
  const x = cosLat * Math.sin(l);
  const y = cam.cosLat * sinLat - cam.sinLat * cosLat * cosL;
  const z = cam.sinLat * sinLat + cam.cosLat * cosLat * cosL;
  return [cx + radius * x * k, cy - radius * y * k, z, (x * x + y * y) * k * k];
}

export function surface(lat: number, lon: number): SpherePoint {
  return [Math.sin(lat * RAD), Math.cos(lat * RAD), lon, 1];
}

function unit(lat: number, lon: number): [number, number, number] {
  return [Math.cos(lat * RAD) * Math.cos(lon * RAD), Math.cos(lat * RAD) * Math.sin(lon * RAD), Math.sin(lat * RAD)];
}

/** A great-circle arc from `from` to `to`, lifted off the surface in proportion to its length. */
export function arc(from: [number, number], to: [number, number], segments: number): { points: SpherePoint[]; mid: [number, number] } {
  const a = unit(from[0], from[1]);
  const b = unit(to[0], to[1]);
  const angle = Math.acos(Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
  const s = Math.sin(angle) || 1e-6;
  const lift = 0.12 + 0.26 * angle;
  const points: SpherePoint[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const k1 = Math.sin((1 - t) * angle) / s;
    const k2 = Math.sin(t * angle) / s;
    const v = [a[0] * k1 + b[0] * k2, a[1] * k1 + b[1] * k2, a[2] * k1 + b[2] * k2];
    const lat = Math.asin(Math.max(-1, Math.min(1, v[2]))) / RAD;
    const lon = Math.atan2(v[1], v[0]) / RAD;
    points.push([Math.sin(lat * RAD), Math.cos(lat * RAD), lon, 1 + lift * Math.sin(Math.PI * t)]);
  }
  const m = [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const norm = Math.hypot(m[0], m[1], m[2]);
  return { points, mid: [Math.asin(m[2] / norm) / RAD, Math.atan2(m[1], m[0]) / RAD] };
}

/** Signed shortest turn from longitude a to b, in degrees within [-180, 180). */
export function angleDiff(a: number, b: number): number {
  return ((((b - a + 540) % 360) + 360) % 360) - 180;
}

export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export const LAT_LIMIT = 75;
export function clampLat(lat: number): number {
  return Math.max(-LAT_LIMIT, Math.min(LAT_LIMIT, lat));
}

/** Tour timing per corridor, in seconds. */
export const TOUR = { move: 1.3, draw: 1.7, hold: 1.1 } as const;
export const TOUR_STEP = TOUR.move + TOUR.draw + TOUR.hold;

export function tourPosition(clock: number, corridors: number): { index: number; phase: number; cycle: number } {
  const step = Math.floor(clock / TOUR_STEP);
  return { index: step % corridors, phase: clock % TOUR_STEP, cycle: step };
}

/** Finished arcs fade with age, never below 0.16. */
export function trailAlpha(age: number): number {
  return Math.max(0.16, 0.7 - age * 0.09);
}
```

Create `frontend/src/landing/client/globe.ts`:

```ts
/**
 * Hero globe: a dot-matrix Earth drawn from the Atlas's map topology, turned
 * by pointer drag in any direction, touring corridors one after another.
 *
 * - Touch: the stage is touch-action: pan-y, so vertical swipes scroll the
 *   page; horizontal swipes rotate longitude only.
 * - Pause tour / Play tour (WCAG 2.2.2): paused stays paused for the page view.
 *   Focusing a legend button also pauses it.
 * - Without motion: no drift and no tour; every corridor is drawn, drag still
 *   works, and frames are drawn only while something changes.
 * - Colours come from CSS custom properties and are re-read on relay:theme.
 * - No 2D context: the stage collapses and the legend remains the corridor list.
 */
import {
  angleDiff,
  arc,
  camera,
  clampLat,
  easeInOutCubic,
  project,
  RAD,
  surface,
  tourPosition,
  TOUR,
  TOUR_STEP,
  trailAlpha,
  type Camera,
  type SpherePoint,
} from "./globe-math";
import { motionAllowed } from "./motion";

interface CorridorData {
  code: string;
  from: [number, number];
  to: [number, number];
  fromLabel: string;
  toLabel: string;
}

interface Palette {
  dot: string;
  dotMin: number;
  dotMax: number;
  graticule: string;
  limb: string;
  plate: string;
  plateLine: string;
  ink: string;
  packet: string;
  node: string;
  series: string[];
}

const DEPTH_BUCKETS = 7;
const RESUME_AFTER_IDLE_S = 3.5;
const INERTIA = 0.93;
const LABEL_MERGE_PX = 150;
const MAX_DPR = 2;
const LABEL_FONT = '500 11px "Geist Mono", ui-monospace, monospace';

function readPalette(root: HTMLElement): Palette {
  const css = getComputedStyle(root);
  const value = (name: string) => css.getPropertyValue(name).trim();
  return {
    dot: value("--gDot"),
    dotMin: Number.parseFloat(value("--gDotMin")),
    dotMax: Number.parseFloat(value("--gDotMax")),
    graticule: value("--gGrat"),
    limb: value("--gLimb"),
    plate: value("--gPlate"),
    plateLine: value("--gPlateLine"),
    ink: value("--gInk"),
    packet: value("--gPacket"),
    node: value("--gNode"),
    series: [1, 2, 3, 4, 5, 6, 7, 8].map((i) => value(`--c${i}`)),
  };
}

function graticule(): SpherePoint[][] {
  const lines: SpherePoint[][] = [];
  for (let lon = -180; lon < 180; lon += 30) {
    const line: SpherePoint[] = [];
    for (let lat = -84; lat <= 84; lat += 3) line.push(surface(lat, lon));
    lines.push(line);
  }
  for (let lat = -60; lat <= 60; lat += 30) {
    const line: SpherePoint[] = [];
    for (let lon = -180; lon <= 180; lon += 3) line.push(surface(lat, lon));
    lines.push(line);
  }
  return lines;
}

export function initGlobe(pointsUrl: string, doc: Document = document, win: Window = window): void {
  const stage = doc.getElementById("globe-stage");
  const canvas = doc.getElementById("globe") as HTMLCanvasElement | null;
  const dataNode = doc.getElementById("globe-data");
  if (!stage || !canvas || !dataNode) return;
  const context = canvas.getContext("2d");
  if (!context) {
    stage.classList.add("off");
    return;
  }
  const ctx: CanvasRenderingContext2D = context;
  const wrap = canvas.parentElement as HTMLElement;
  const root = doc.documentElement;
  const motion = motionAllowed(root);
  const corridors = JSON.parse(dataNode.textContent ?? "[]") as CorridorData[];
  const arcs = corridors.map((corridor) => ({ ...corridor, ...arc(corridor.from, corridor.to, 72) }));
  const lines = graticule();
  const legend = Array.from(doc.querySelectorAll<HTMLButtonElement>("[data-corridor]"));
  const tourToggle = doc.getElementById("tour-toggle") as HTMLButtonElement | null;
  if (arcs.length === 0) return;

  let palette = readPalette(root);
  let sinLat = new Float32Array(0);
  let cosLat = new Float32Array(0);
  let lons = new Float32Array(0);

  let size = 0;
  let radius = 0;
  let centre = 0;
  const resize = () => {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(win.devicePixelRatio || 1, MAX_DPR);
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    size = rect.width;
    radius = size * 0.47;
    centre = size / 2;
    kick();
  };

  let viewLon = 10;
  let viewLat = 18;
  let cam: Camera = camera(viewLon, viewLat);
  let tourClock = 0;
  let last = performance.now();
  let idle = 99;
  let dragging = false;
  let vx = 0;
  let vy = 0;
  let lastX = 0;
  let lastY = 0;
  let paused = false;
  let running = true;
  let looping = false;
  let shown = -1;

  const stroke = (points: SpherePoint[], to: number, surfaceOnly: boolean) => {
    let pen = false;
    ctx.beginPath();
    for (let i = 0; i <= to && i < points.length; i++) {
      const p = project(points[i], cam, radius, centre, centre);
      const visible = surfaceOnly ? p[2] > 0 : p[2] > 0 || p[3] > 1;
      if (visible) {
        if (pen) ctx.lineTo(p[0], p[1]);
        else ctx.moveTo(p[0], p[1]);
        pen = true;
      } else pen = false;
    }
    ctx.stroke();
  };

  const roundRect = (x: number, y: number, w: number, h: number, r: number) => {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  };

  const marker = (at: [number, number], colour: string, label: string, code: string, alpha: number) => {
    const p = project(surface(at[0], at[1]), cam, radius, centre, centre);
    if (p[2] <= 0.08) return;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = palette.node;
    ctx.strokeStyle = colour;
    ctx.lineWidth = 1.6;
    ctx.fillRect(p[0] - 4, p[1] - 4, 8, 8);
    ctx.strokeRect(p[0] - 4, p[1] - 4, 8, 8);
    if (label) {
      ctx.font = LABEL_FONT;
      const textWidth = ctx.measureText(label).width;
      const codeWidth = code ? ctx.measureText(code).width + 22 : 0;
      let x = p[0] + 10;
      const y = p[1] - 9;
      if (x + textWidth + codeWidth + 16 > size) x = p[0] - 10 - textWidth - codeWidth - 12;
      ctx.fillStyle = palette.plate;
      ctx.strokeStyle = palette.plateLine;
      ctx.lineWidth = 1;
      roundRect(x - 4, y - 11, textWidth + codeWidth + 12, 18, 5);
      ctx.fill();
      ctx.stroke();
      // Identity rides on the swatch; text stays ink, never the series colour.
      if (code) {
        ctx.fillStyle = colour;
        ctx.fillRect(x + 1, y - 6, 8, 8);
        ctx.fillStyle = palette.ink;
        ctx.fillText(code, x + 13, y + 2);
      }
      ctx.fillStyle = palette.ink;
      ctx.fillText(label, x + codeWidth + 2, y + 2);
    }
    ctx.globalAlpha = 1;
  };

  const frame = (now: number) => {
    const dt = Math.min(0.05, Math.max(0, now - last) / 1000);
    last = now;
    const touring = motion && !paused && !dragging && idle > RESUME_AFTER_IDLE_S;
    if (!dragging) {
      idle += dt;
      vx *= INERTIA;
      vy *= INERTIA;
      viewLon += vx;
      viewLat = clampLat(viewLat + vy);
    }
    if (touring) tourClock += dt;
    const { index: active, phase, cycle } = tourPosition(tourClock, arcs.length);
    const current = arcs[active];
    if (touring && phase < TOUR.move) {
      const e = easeInOutCubic(phase / TOUR.move) * 0.12;
      viewLon += angleDiff(viewLon, current.mid[1]) * e;
      viewLat += (Math.max(-40, Math.min(55, current.mid[0])) - viewLat) * e;
    }
    if (motion && !touring && !dragging && !paused && idle > 0.2) viewLon += dt * 3;
    cam = camera(viewLon, viewLat);

    ctx.clearRect(0, 0, size, size);
    ctx.strokeStyle = palette.limb;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(centre, centre, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = palette.graticule;
    for (const line of lines) stroke(line, line.length, true);

    const buckets = Array.from({ length: DEPTH_BUCKETS }, () => new Path2D());
    for (let i = 0; i < lons.length; i++) {
      const l = (lons[i] - cam.lon) * RAD;
      const cosL = Math.cos(l);
      const z = cam.sinLat * sinLat[i] + cam.cosLat * cosLat[i] * cosL;
      if (z <= 0) continue;
      const x = cosLat[i] * Math.sin(l);
      const y = cam.cosLat * sinLat[i] - cam.sinLat * cosLat[i] * cosL;
      const r = 0.65 + 0.8 * z;
      buckets[Math.min(DEPTH_BUCKETS - 1, (z * DEPTH_BUCKETS) | 0)].rect(centre + radius * x - r, centre - radius * y - r, r * 2, r * 2);
    }
    buckets.forEach((path, b) => {
      ctx.fillStyle = `rgba(${palette.dot},${palette.dotMin + (palette.dotMax - palette.dotMin) * (b / (DEPTH_BUCKETS - 1))})`;
      ctx.fill(path);
    });

    arcs.forEach((a, j) => {
      const age = motion ? (active - j + arcs.length) % arcs.length : 0;
      const done = !motion || cycle >= arcs.length || j < active || (j === active && phase >= TOUR.move + TOUR.draw);
      let upto = a.points.length - 1;
      if (motion && j === active) {
        upto = phase < TOUR.move ? -1 : Math.floor(Math.min(1, (phase - TOUR.move) / TOUR.draw) * (a.points.length - 1));
      } else if (!done) return;
      const alpha = j === active ? 1 : trailAlpha(age);
      const colour = palette.series[j % palette.series.length];
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = colour;
      ctx.lineWidth = j === active ? 2.6 : 1.6;
      stroke(a.points, upto, false);
      ctx.globalAlpha = 1;
      if (j === active && upto >= 0) {
        const head = project(a.points[upto], cam, radius, centre, centre);
        if (head[2] > 0 || head[3] > 1) {
          ctx.fillStyle = colour;
          ctx.globalAlpha = 0.18;
          ctx.beginPath();
          ctx.arc(head[0], head[1], 10, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
          ctx.fillStyle = palette.packet;
          ctx.fillRect(head[0] - 4, head[1] - 4, 8, 8);
        }
      }
      const labelled = j === active && upto >= 0;
      let fromLabel = a.fromLabel;
      let toLabel = a.toLabel;
      if (labelled) {
        const pf = project(surface(a.from[0], a.from[1]), cam, radius, centre, centre);
        const pt = project(surface(a.to[0], a.to[1]), cam, radius, centre, centre);
        if (Math.hypot(pf[0] - pt[0], pf[1] - pt[1]) < LABEL_MERGE_PX) {
          toLabel = `${a.fromLabel} → ${a.toLabel}`;
          fromLabel = "";
        }
      }
      marker(a.from, colour, labelled ? fromLabel : "", "", alpha);
      marker(a.to, colour, labelled ? toLabel : "", labelled ? a.code : "", alpha);
    });

    if (active !== shown) {
      shown = active;
      legend.forEach((cell, i) => cell.classList.toggle("on", i === active));
    }
    const settling = Math.abs(vx) + Math.abs(vy) > 0.01;
    if (running && (motion || dragging || settling)) win.requestAnimationFrame(frame);
    else looping = false;
  };

  function kick() {
    if (looping) return;
    looping = true;
    last = performance.now();
    win.requestAnimationFrame(frame);
  }

  const setPaused = (value: boolean) => {
    paused = value;
    if (!tourToggle) return;
    tourToggle.textContent = paused ? "Play tour" : "Pause tour";
    tourToggle.setAttribute("aria-pressed", String(paused));
  };
  if (tourToggle && motion) {
    tourToggle.hidden = false;
    tourToggle.addEventListener("click", () => {
      setPaused(!paused);
      if (!paused) idle = 99;
      kick();
    });
  }

  const goTo = (index: number) => {
    const cycleBase = Math.floor(tourClock / (arcs.length * TOUR_STEP));
    const still = paused || !motion;
    tourClock = cycleBase * arcs.length * TOUR_STEP + index * TOUR_STEP + (still ? TOUR.move + TOUR.draw : 0);
    idle = 99;
    dragging = false;
    vx = 0;
    vy = 0;
    if (still) {
      viewLon = arcs[index].mid[1];
      viewLat = Math.max(-40, Math.min(55, arcs[index].mid[0]));
    }
    kick();
  };
  legend.forEach((cell, index) => {
    cell.addEventListener("focus", () => {
      if (motion && !paused) setPaused(true);
    });
    cell.addEventListener("click", () => goTo(index));
  });

  wrap.addEventListener("pointerdown", (event) => {
    dragging = true;
    idle = 0;
    lastX = event.clientX;
    lastY = event.clientY;
    vx = 0;
    vy = 0;
    if (event.pointerType !== "touch") wrap.setPointerCapture(event.pointerId);
    kick();
  });
  wrap.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    const dx = event.clientX - lastX;
    const dy = event.clientY - lastY;
    lastX = event.clientX;
    lastY = event.clientY;
    const k = 160 / radius;
    vx = -dx * k;
    // Touch rotates longitude only; vertical swipes belong to the page.
    vy = event.pointerType === "touch" ? 0 : dy * k;
    viewLon += vx;
    viewLat = clampLat(viewLat + vy);
    kick();
  });
  const release = () => {
    dragging = false;
    if (!motion) {
      vx = 0;
      vy = 0;
    }
  };
  wrap.addEventListener("pointerup", release);
  wrap.addEventListener("pointercancel", release);
  // The browser cancels the pointer when a pan-y swipe scrolls the page.
  wrap.addEventListener("lostpointercapture", release);

  const repaint = () => {
    palette = readPalette(root);
    kick();
  };
  doc.addEventListener("relay:theme", repaint);
  win.matchMedia?.("(prefers-color-scheme: dark)").addEventListener("change", repaint);

  if (typeof ResizeObserver !== "undefined") new ResizeObserver(resize).observe(canvas);
  else win.addEventListener("resize", resize);
  if (typeof IntersectionObserver !== "undefined") {
    new IntersectionObserver((entries) => {
      running = entries.some((entry) => entry.isIntersecting);
      if (running) kick();
    }).observe(wrap);
  }

  resize();
  // Land points are a separate fetched asset; without them the globe still
  // shows its graticule and arcs.
  fetch(pointsUrl)
    .then((response) => (response.ok ? (response.json() as Promise<number[]>) : []))
    .then((points) => {
      const count = Math.floor(points.length / 2);
      sinLat = new Float32Array(count);
      cosLat = new Float32Array(count);
      lons = new Float32Array(count);
      for (let i = 0; i < count; i++) {
        const lat = points[2 * i] * RAD;
        sinLat[i] = Math.sin(lat);
        cosLat[i] = Math.cos(lat);
        lons[i] = points[2 * i + 1];
      }
      kick();
    })
    .catch(() => undefined);
}
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `cd frontend && npx vitest run src/landing/client/globe-math.test.ts src/landing/client/globe.test.ts && npx tsc --noEmit`
Expected: `9 passed` (7 and 2), then no `tsc` output. Drag, tour, pause and legend behaviour are covered in a real browser by Task 16.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/landing/client/globe-math.ts frontend/src/landing/client/globe.ts frontend/src/landing/client/globe-math.test.ts frontend/src/landing/client/globe.test.ts
git commit -m "feat(landing): add the dot-matrix globe with its corridor tour (landing 12)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: The separate landing build

**Files:**
- Modify: `frontend/package.json` and `frontend/package-lock.json` (add the two `@fontsource` packages, exact; add the `build:landing` script)
- Create: `frontend/landing.html`, `frontend/vite.landing.config.ts`, `frontend/src/landing/client/main.ts`, `frontend/src/landing/brand/relay-symbol.svg`
- Create: `frontend/scripts/build-landing.mjs`, `frontend/scripts/check-landing-build.mjs`
- Modify: `frontend/src/design-system/theme.test.ts` (lines 206–319: run the pre-paint matrix against both HTML files)
- Test: `frontend/scripts/check-landing-build.test.ts`, `frontend/src/design-system/theme.test.ts`

**Interfaces:**
- Consumes:
  - `renderLanding()` (Task 9), every `init*` from Tasks 10–12, and the styles from Task 8;
  - `scripts/export_landing_facts.py` (Task 5) and `scripts/build-globe-points.mjs` (Task 6);
  - Vite 8.2.1's `runnerImport<T>(moduleId, inlineConfig?) -> Promise<{module: T, dependencies: string[]}>` and its `build.rolldownOptions`, `publicDir: false` and `build.modulePreload`.
- Produces:
  - from `vite.landing.config.ts`: `LANDING_OUT_DIR`, `LANDING_FACTS_PATH`, `landingStaticRender(factsPath?)` and `landingFontPreloads()`;
  - from `build-landing.mjs`: `hashTree(dir)`, `findPython()` and `buildLanding()`;
  - from `check-landing-build.mjs`: `BUDGETS` and `checkLandingBuild(dist?) -> string[]`;
  - the npm script `build:landing`;
  - the output `app/landing_dist/landing.html` and `app/landing_dist/assets/*` that Task 1 serves.

How the pieces work:
- **Entry and favicon.** `landing.html`'s first `<script>` is a byte-for-byte copy of `index.html`'s pre-paint theme script. The second adds `js`, and `motion` unless reduced motion is asked for. The favicon is the Route Loop symbol. `frontend/public/brand/` is not on `main`, and `publicDir: false` keeps anything there out of this build.
- **Static render.** The plugin reads `generated/facts.json` with `fs` rather than importing it: `tsc` checks all of `src/`, and an import of a gitignored file would break the `/app` build on a clean checkout.
- **Canonical link.** It carries `vite-ignore`, or Vite tries to bundle `href="/"` and fails with `EISDIR`.
- **Python lookup.** `build-landing.mjs` picks the first Python that can import the app (`RELAY_PYTHON`, the repo's `.venv`, the common checkout's `.venv`, `python3`, `python`). It hashes `app/static/relay` before and after, and fails if the `/app` output changed.

- [ ] **Step 1: Install the fonts**

Run: `cd frontend && npm install --save-exact @fontsource/geist@5.3.0 @fontsource/geist-mono@5.3.0`
Expected: both appear under `dependencies` in `package.json`, pinned without `^`. Both are SIL OFL 1.1. The Latin woff2 files the page uses total 59,604 bytes.

Then add the build script to `frontend/package.json`, directly after `"build"`:

```json
    "build:landing": "node scripts/build-landing.mjs",
```

- [ ] **Step 2: Write the failing tests**

Create `frontend/scripts/check-landing-build.test.ts`:

```ts
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkLandingBuild } from "./check-landing-build.mjs";

describe("check-landing-build", () => {
  it("reports a missing build instead of passing", () => {
    expect(checkLandingBuild(mkdtempSync(join(tmpdir(), "landing-dist-")))).toHaveLength(1);
  });

  it("fails on source maps and leftover markers", () => {
    const dist = mkdtempSync(join(tmpdir(), "landing-dist-"));
    mkdirSync(join(dist, "assets"));
    writeFileSync(join(dist, "landing.html"), "<!doctype html><!--landing-body-->");
    writeFileSync(join(dist, "assets", "landing-1.js"), "x");
    writeFileSync(join(dist, "assets", "landing-1.js.map"), "{}");
    writeFileSync(join(dist, "assets", "globe-points-1.json"), "[]");
    const failures = checkLandingBuild(dist);
    expect(failures).toContain("source maps present");
    expect(failures).toContain("an unreplaced <!--landing-...--> marker remains");
  });
});
```

Modify `frontend/src/design-system/theme.test.ts`. Apply this change:

```diff
@@ -221,14 +221,26 @@ const INDEX_HTML = readFileSync(
   "utf8",
 );

+// The landing page (landing.html, built by vite.landing.config.ts) carries a
+// copy of the same script, so a theme chosen in either surface paints the same.
+const LANDING_HTML = readFileSync(
+  resolve(dirname(fileURLToPath(import.meta.url)), "../../landing.html"),
+  "utf8",
+);
+
+function prePaintSource(html: string): string {
+  const match = /<script>([\s\S]*?)<\/script>/.exec(html);
+  if (!match) throw new Error("no inline pre-paint <script> found");
+  return match[1];
+}
+
 interface PrePaintResult {
   dataTheme: string | null;
   colorScheme: string;
 }

-function runPrePaintScript(rawStored: string | null, osDark: boolean): PrePaintResult {
-  const match = /<script>([\s\S]*?)<\/script>/.exec(INDEX_HTML);
-  if (!match) throw new Error("index.html: no inline pre-paint <script> found");
+function runPrePaintScript(rawStored: string | null, osDark: boolean, html: string = INDEX_HTML): PrePaintResult {
+  const source = prePaintSource(html);

   const root = document.createElement("div");
   const fakeDocument = { documentElement: root };
@@ -238,7 +250,7 @@ function runPrePaintScript(rawStored: string | null, osDark: boolean): PrePaintR
   const fakeMatchMedia = (query: string) => ({ matches: osDark && query.includes("dark") });

   // eslint-disable-next-line no-new-func
-  new Function("document", "localStorage", "matchMedia", match[1])(
+  new Function("document", "localStorage", "matchMedia", source)(
     fakeDocument,
     fakeLocalStorage,
     fakeMatchMedia,
@@ -254,7 +266,14 @@ function reference(theme: RelayTheme, osDark: boolean): PrePaintResult {
   return { dataTheme: root.getAttribute("data-theme"), colorScheme: root.style.colorScheme };
 }

-describe("pre-paint theme script", () => {
+it("landing.html carries a byte-for-byte copy of index.html's pre-paint script", () => {
+  expect(prePaintSource(LANDING_HTML)).toBe(prePaintSource(INDEX_HTML));
+});
+
+describe.each([
+  ["index.html", INDEX_HTML],
+  ["landing.html", LANDING_HTML],
+])("pre-paint theme script in %s", (_file, html) => {
   const matrix: Array<[RelayTheme, boolean]> = [
     ["system", true],
     ["system", false],
@@ -274,7 +293,7 @@ describe("pre-paint theme script", () => {
       firstRunGuidanceSeen: [],
       theme,
     });
-    expect(runPrePaintScript(stored, osDark)).toEqual(reference(theme, osDark));
+    expect(runPrePaintScript(stored, osDark, html)).toEqual(reference(theme, osDark));
   });

   it("treats a pre-theme preferences object as system", () => {
@@ -284,24 +303,24 @@ describe("pre-paint theme script", () => {
       navigationDensity: "compact",
       firstRunGuidanceSeen: ["overview"],
     });
-    expect(runPrePaintScript(legacy, true)).toEqual(reference("system", true));
+    expect(runPrePaintScript(legacy, true, html)).toEqual(reference("system", true));
   });

   it("treats absent, corrupt and unknown values as system", () => {
-    expect(runPrePaintScript(null, true)).toEqual(reference("system", true));
-    expect(runPrePaintScript("not-json{", true)).toEqual(reference("system", true));
+    expect(runPrePaintScript(null, true, html)).toEqual(reference("system", true));
+    expect(runPrePaintScript("not-json{", true, html)).toEqual(reference("system", true));
     expect(
-      runPrePaintScript(JSON.stringify({ schemaVersion: 1, theme: "midnight-neon" }), true),
+      runPrePaintScript(JSON.stringify({ schemaVersion: 1, theme: "midnight-neon" }), true, html),
     ).toEqual(reference("system", true));
     // Wrong schemaVersion is rejected wholesale by loadVersioned, so the
     // pre-paint script must fall back to the default rather than trust it.
-    expect(runPrePaintScript(JSON.stringify({ schemaVersion: 99, theme: "dark" }), false)).toEqual(
+    expect(runPrePaintScript(JSON.stringify({ schemaVersion: 99, theme: "dark" }), false, html)).toEqual(
       reference("system", false),
     );
   });

   it("does not throw when storage is denied", () => {
-    const match = /<script>([\s\S]*?)<\/script>/.exec(INDEX_HTML);
+    const source = prePaintSource(html);
     const root = document.createElement("div");
     const denied = {
       getItem: () => {
@@ -309,7 +328,7 @@ describe("pre-paint theme script", () => {
       },
     };
     expect(() =>
-      new Function("document", "localStorage", "matchMedia", match![1])(
+      new Function("document", "localStorage", "matchMedia", source)(
         { documentElement: root },
         denied,
         () => ({ matches: false }),
```

- [ ] **Step 3: Run them and watch them fail**

Run: `cd frontend && npx vitest run scripts/check-landing-build.test.ts src/design-system/theme.test.ts`
Expected: FAIL. `./check-landing-build.mjs` cannot be resolved, and `theme.test.ts` fails with `ENOENT` for `landing.html`.

- [ ] **Step 4: Implement**

Create `frontend/src/landing/brand/relay-symbol.svg`:

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><path d="M24 17h40c14 0 24 10 24 23 0 12-8 21-22 21H39c-15 0-25 9-25 22s10 22 25 22h30" fill="none" stroke="#533AFD" stroke-width="13" stroke-linecap="round" stroke-linejoin="round"/><g fill="#533AFD"><circle cx="24" cy="17" r="12"/><circle cx="66" cy="61" r="12"/><circle cx="69" cy="105" r="12"/></g></svg>
```

Create `frontend/landing.html`:

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <title>Relay — see where a payment actually goes</title>
    <!--
      Pre-paint theme. A byte-for-byte copy of the first inline script in
      index.html (theme.test.ts asserts the copy and executes it against
      applyTheme()), so the landing page and /app resolve the stored theme
      identically and a dark-mode visitor never sees a white flash.
    -->
    <script>
      (function () {
        var theme = "system";

        // Reading storage is fallible (denied in private mode, corrupt JSON).
        // Isolate it: a failed READ must still leave the OS preference to be
        // applied below, or a dark-OS user with corrupt storage gets a white
        // flash on every load.
        try {
          var raw = localStorage.getItem("relay:preferences");
          var parsed = raw ? JSON.parse(raw) : null;
          // loadVersioned rejects any non-1 schemaVersion WHOLESALE, and only
          // an explicit light/dark overrides the OS.
          if (
            parsed &&
            parsed.schemaVersion === 1 &&
            (parsed.theme === "light" || parsed.theme === "dark" || parsed.theme === "black")
          ) {
            theme = parsed.theme;
          }
        } catch (e) {
          /* keep the "system" default */
        }

        var dark =
          theme === "dark" ||
          theme === "black" ||
          (theme === "system" &&
            typeof matchMedia === "function" &&
            matchMedia("(prefers-color-scheme: dark)").matches);

        // "system" stamps NOTHING: the dark palette is guarded as
        // :root:not([data-theme="light"]), so an absent attribute is what lets
        // the OS drive.
        if (theme !== "system") {
          document.documentElement.setAttribute("data-theme", theme);
        }
        document.documentElement.style.colorScheme = dark ? "dark" : "light";
      })();
    </script>
    <!--
      Pre-paint motion flags. html.js: JavaScript runs, so enhanced layouts may
      hide what the enhancers reveal. html.motion: neither the OS nor the stored
      reducedMotion preference asks for reduced motion. Without these classes the
      page renders every animated element in its final state.
    -->
    <script>
      (function () {
        var root = document.documentElement;
        root.classList.add("js");
        var reduced = false;
        try {
          var stored = JSON.parse(localStorage.getItem("relay:preferences") || "null");
          reduced = !!(stored && stored.schemaVersion === 1 && stored.reducedMotion === true);
        } catch (e) {
          /* no stored preference */
        }
        if (!reduced && typeof matchMedia === "function") {
          reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
        }
        if (!reduced) root.classList.add("motion");
      })();
    </script>
    <meta name="description" content="Relay is an educational simulation of cross-border payments: IBAN checks, correspondent routing, settlement instructions, rails and tracking. No real money moves." />
    <meta name="robots" content="index,follow" />
    <link rel="canonical" href="/" vite-ignore />
    <meta property="og:type" content="website" />
    <meta property="og:title" content="Relay — see where a payment actually goes" />
    <meta property="og:description" content="An educational simulation of cross-border payments. No real money moves." />
    <meta name="twitter:card" content="summary" />
    <meta name="twitter:title" content="Relay — see where a payment actually goes" />
    <meta name="twitter:description" content="An educational simulation of cross-border payments. No real money moves." />
    <meta name="theme-color" content="#F9FAFC" media="(prefers-color-scheme: light)" />
    <meta name="theme-color" content="#040A15" media="(prefers-color-scheme: dark)" />
    <link rel="icon" type="image/svg+xml" href="./src/landing/brand/relay-symbol.svg" />
    <!--landing-preloads-->
  </head>
  <body>
    <!--landing-body-->
    <script type="module" src="./src/landing/client/main.ts"></script>
  </body>
</html>
```

Create `frontend/src/landing/client/main.ts`:

```ts
/**
 * Landing page client entry. Imports only src/landing/client and the generated
 * point set (scripts/check-landing-boundary.mjs). Each enhancer does nothing
 * when its elements are missing.
 */
import "@fontsource/geist/latin-400.css";
import "@fontsource/geist/latin-500.css";
import "@fontsource/geist/latin-600.css";
import "@fontsource/geist-mono/latin-400.css";
import "@fontsource/geist-mono/latin-500.css";
import "./styles/tokens.css";
import "./styles/landing.css";
import pointsUrl from "../generated/globe-points.json?url";
import { initAnatomy } from "./anatomy";
import { initCounters } from "./counters";
import { initGlobe } from "./globe";
import { initIbanDemo } from "./iban-demo";
import { initRailTabs } from "./rails-tabs";
import { initScrollRoute } from "./scroll-route";
import { initThemeControl } from "./theme-control";

initThemeControl();
initRailTabs();
initGlobe(pointsUrl);
initScrollRoute();
initAnatomy();
initCounters();
initIbanDemo();
```

Create `frontend/vite.landing.config.ts`:

```ts
/**
 * The landing page build. A separate Vite run from vite.config.ts on purpose:
 * one build with two HTML entries makes Vite emit a shared preload chunk that
 * both pages load, which would change the /app output. This config never
 * touches app/static, and the /app config is not edited.
 *
 * Sections are React components rendered to static markup here, at build time,
 * through runnerImport. No React runtime ships to the landing page.
 */
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig, runnerImport, type Plugin } from "vite";

const ROOT = fileURLToPath(new URL(".", import.meta.url));
export const LANDING_OUT_DIR = fileURLToPath(new URL("../app/landing_dist", import.meta.url));
export const LANDING_FACTS_PATH = fileURLToPath(new URL("./src/landing/generated/facts.json", import.meta.url));
const BODY_MARKER = "<!--landing-body-->";
const PRELOAD_MARKER = "<!--landing-preloads-->";
/** Heading and body weights: the two faces above the fold. */
const PRELOADED_FONTS = [/geist-latin-500-normal-[\w-]+\.woff2$/, /geist-latin-400-normal-[\w-]+\.woff2$/];

export function landingStaticRender(factsPath = LANDING_FACTS_PATH): Plugin {
  return {
    name: "relay-landing-static-render",
    transformIndexHtml: {
      order: "pre",
      async handler(html) {
        if (!html.includes(BODY_MARKER)) throw new Error(`landing.html has no ${BODY_MARKER} marker`);
        if (!existsSync(factsPath)) {
          throw new Error(`Landing facts not found at ${factsPath}. Run: npm run build:landing`);
        }
        const facts: unknown = JSON.parse(readFileSync(factsPath, "utf8"));
        const { module } = await runnerImport<{ renderLanding: (facts: unknown) => string }>(
          "/src/landing/render/render.tsx",
          { configFile: false, root: ROOT, mode: "production", logLevel: "error" },
        );
        return html.replace(BODY_MARKER, module.renderLanding(facts));
      },
    },
  };
}

export function landingFontPreloads(): Plugin {
  return {
    name: "relay-landing-font-preloads",
    transformIndexHtml: {
      order: "post",
      handler(html, ctx) {
        const files = Object.keys(ctx.bundle ?? {});
        const links = PRELOADED_FONTS.map((pattern) => files.find((file) => pattern.test(file)))
          .filter((file): file is string => Boolean(file))
          .map((file) => `<link rel="preload" as="font" type="font/woff2" href="/landing/${file}" crossorigin />`);
        return html.replace(PRELOAD_MARKER, links.join("\n    "));
      },
    },
  };
}

export default defineConfig({
  root: ROOT,
  base: "/landing/",
  publicDir: false,
  plugins: [landingStaticRender(), landingFontPreloads()],
  build: {
    outDir: LANDING_OUT_DIR,
    emptyOutDir: true,
    sourcemap: false,
    modulePreload: { polyfill: false },
    rolldownOptions: {
      input: fileURLToPath(new URL("./landing.html", import.meta.url)),
    },
  },
});
```

Create `frontend/scripts/check-landing-build.mjs`:

```js
/**
 * Landing artifact gate: budgets, no source maps, no references to the /app
 * bundle or to secrets. Run after `vite build --config vite.landing.config.ts`.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const DIST = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "app", "landing_dist");
export const BUDGETS = {
  javascript: 25 * 1024,
  globePoints: 20 * 1024,
  fonts: 75 * 1024,
};

export function checkLandingBuild(dist = DIST) {
  const failures = [];
  const html = join(dist, "landing.html");
  const assets = join(dist, "assets");
  if (!existsSync(html) || !existsSync(assets)) return [`landing build not found in ${dist}`];
  const files = readdirSync(assets);
  const gzip = (name) => gzipSync(readFileSync(join(assets, name))).length;
  const sum = (names) => names.reduce((total, name) => total + gzip(name), 0);

  const js = sum(files.filter((f) => f.endsWith(".js")));
  const points = sum(files.filter((f) => /^globe-points-.+\.json$/.test(f)));
  const fonts = files.filter((f) => f.endsWith(".woff2")).reduce((t, f) => t + readFileSync(join(assets, f)).length, 0);
  if (js > BUDGETS.javascript) failures.push(`JavaScript ${js} B gzip exceeds ${BUDGETS.javascript}`);
  if (points === 0) failures.push("globe point set missing");
  if (points > BUDGETS.globePoints) failures.push(`globe points ${points} B gzip exceed ${BUDGETS.globePoints}`);
  if (fonts > BUDGETS.fonts) failures.push(`woff2 fonts ${fonts} B exceed ${BUDGETS.fonts}`);
  if (files.some((f) => f.endsWith(".map"))) failures.push("source maps present");

  const page = readFileSync(html, "utf8");
  if (page.includes("<!--landing-")) failures.push("an unreplaced <!--landing-...--> marker remains");
  if (/\/app\/assets\/|\/static\//.test(page)) failures.push("landing.html references the /app bundle or /static");
  const texts = [["landing.html", page], ...files.filter((f) => /\.(js|css)$/.test(f)).map((f) => [f, readFileSync(join(assets, f), "utf8")])];
  for (const [name, text] of texts) {
    if (/SENTRY_AUTH_TOKEN|sntrys_/.test(text)) failures.push(`${name} mentions a Sentry token`);
  }
  console.log(`landing JS ${js} B gzip · globe points ${points} B gzip · fonts ${fonts} B woff2`);
  return failures;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const failures = checkLandingBuild();
  if (failures.length > 0) {
    for (const failure of failures) console.error(`❌ ${failure}`);
    process.exit(1);
  }
  console.log("✅ landing build checks: PASS");
}
```

Create `frontend/scripts/build-landing.mjs`:

```js
/**
 * Build the landing page: facts export, globe points, the separate Vite build,
 * then the artifact checks. Any failure exits non-zero, so a deploy with the
 * flag on fails closed.
 *
 * The /app build output (app/static/relay) is hashed before and after; the
 * landing build must leave it byte-identical.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const FRONTEND = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPO = resolve(FRONTEND, "..");
const APP_OUTPUT = join(REPO, "app", "static", "relay");

export function hashTree(dir) {
  if (!existsSync(dir)) return "absent";
  const hash = createHash("sha256");
  const walk = (current) => {
    for (const name of readdirSync(current).sort()) {
      const path = join(current, name);
      if (statSync(path).isDirectory()) walk(path);
      else hash.update(relative(dir, path)).update("\0").update(readFileSync(path)).update("\0");
    }
  };
  walk(dir);
  return hash.digest("hex");
}

/** A Python that can import the app: RELAY_PYTHON, the repo's .venv, then python3/python. */
export function findPython() {
  const commonRoot = (() => {
    try {
      const common = execFileSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd: REPO, encoding: "utf8" }).trim();
      return dirname(common);
    } catch {
      return REPO;
    }
  })();
  const candidates = [
    process.env.RELAY_PYTHON,
    join(REPO, ".venv", "bin", "python"),
    join(commonRoot, ".venv", "bin", "python"),
    "python3",
    "python",
  ].filter(Boolean);
  for (const candidate of candidates) {
    const probe = spawnSync(candidate, ["-c", "import sqlalchemy, schwifty"], { cwd: REPO, stdio: "ignore" });
    if (probe.status === 0) return candidate;
  }
  throw new Error("No Python with the app's dependencies found. Set RELAY_PYTHON or create .venv.");
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, stdio: "inherit" });
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}`);
}

export function buildLanding() {
  const before = hashTree(APP_OUTPUT);
  run(findPython(), ["scripts/export_landing_facts.py"], REPO);
  run(process.execPath, ["scripts/build-globe-points.mjs"], FRONTEND);
  run(process.execPath, [join(FRONTEND, "node_modules", "vite", "bin", "vite.js"), "build", "--config", "vite.landing.config.ts"], FRONTEND);
  run(process.execPath, ["scripts/check-landing-build.mjs"], FRONTEND);
  const after = hashTree(APP_OUTPUT);
  if (before !== after) throw new Error("The landing build changed app/static/relay; it must not touch the /app output.");
  console.log("landing build: PASS (/app output unchanged)");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    buildLanding();
  } catch (error) {
    console.error(`landing build failed: ${error.message}`);
    process.exit(1);
  }
}
```

- [ ] **Step 5: Run the tests, then the build**

Run: `cd frontend && npx vitest run scripts/check-landing-build.test.ts src/design-system/theme.test.ts && npx tsc --noEmit`
Expected: `38 passed` (2 and 36), including 11 `pre-paint theme script in landing.html` cases. Then no `tsc` output.

Run: `cd frontend && npm run build && npm run build:landing`
Expected: the landing build ends with:

```text
landing JS 5236 B gzip · globe points 19730 B gzip · fonts 59604 B woff2
✅ landing build checks: PASS
landing build: PASS (/app output unchanged)
```

Byte counts may differ slightly; every value must stay under budget.

Run, from the repository root:

```bash
RELAY_LANDING_ENABLED=1 python -c "
import re
from fastapi.testclient import TestClient
from app.main import app
client = TestClient(app)
page = client.get('/', follow_redirects=False)
script = client.get(re.findall(r'/landing/assets/[^\\\"]+[.]js', page.text)[0])
print(page.status_code, page.headers['cache-control'], 'Harborline Bank' in page.text, script.status_code, script.headers['cache-control'])
"
```

Expected: `200 no-cache True 200 public, max-age=31536000, immutable`. Without `RELAY_LANDING_ENABLED=1`, `GET /` is `302 /app`.

Run: `git status --short`
Expected: only the files of this task. `app/landing_dist/` and `frontend/src/landing/generated/` are ignored.

- [ ] **Step 6: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/landing.html frontend/vite.landing.config.ts frontend/src/landing/client/main.ts frontend/src/landing/brand/relay-symbol.svg frontend/scripts/build-landing.mjs frontend/scripts/check-landing-build.mjs frontend/scripts/check-landing-build.test.ts frontend/src/design-system/theme.test.ts
git commit -m "feat(landing): build the landing page separately from /app (landing 13)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: The landing import boundary

**Files:**
- Create: `frontend/scripts/check-landing-boundary.mjs`
- Modify: `frontend/package.json` (add `check:landing-boundary` after `check:bundle`), `.github/workflows/ci.yml` (after the Base UI step)
- Test: `frontend/scripts/check-landing-boundary.test.ts`

**Interfaces:**
- Produces:
  - `RENDER_DATA_MODULES: string[]`;
  - `checkBoundary(root: string) -> string[]` (violations; an empty list means it passes);
  - a CLI, `node scripts/check-landing-boundary.mjs [frontendRoot]`;
  - the npm script `check:landing-boundary`.

The rules are the Global Constraints' import boundary. The allowlisted data modules may themselves import only each other (type imports aside), so a CSS or runtime import added to `curriculum.ts` later fails here, before it breaks the build-time renderer. Dynamic `import()` is rejected on both sides.

- [ ] **Step 1: Write the failing test**

Create `frontend/scripts/check-landing-boundary.test.ts`:

```ts
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { checkBoundary, RENDER_DATA_MODULES } from "./check-landing-boundary.mjs";

const FRONTEND = resolve(__dirname, "..");

/** A throwaway frontend tree with the allowlisted data modules present. */
function tree(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "landing-boundary-"));
  for (const module of RENDER_DATA_MODULES) files[module] ??= "export const ok = 1;\n";
  for (const [path, source] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), source);
  }
  return root;
}

describe("check-landing-boundary", () => {
  it("passes on the real tree", () => {
    expect(checkBoundary(FRONTEND)).toEqual([]);
  });

  it("rejects a client import of app code", () => {
    const root = tree({
      "src/landing/client/main.ts": 'import { loadPreferences } from "../../lib/persistence/storage";\n',
      "src/lib/persistence/storage.ts": "export const loadPreferences = () => 1;\n",
    });
    expect(checkBoundary(root)).toEqual(["src/landing/client/main.ts: imports src/lib/persistence/storage.ts"]);
  });

  it("rejects a client package import and a dynamic import", () => {
    const root = tree({ "src/landing/client/a.ts": 'import * as Sentry from "@sentry/react";\nvoid import("./b");\n' });
    expect(checkBoundary(root)).toEqual([
      "src/landing/client/a.ts: dynamic import()",
      'src/landing/client/a.ts: imports package "@sentry/react"',
    ]);
  });

  it("rejects a render import outside the data allowlist", () => {
    const root = tree({
      "src/landing/render/x.tsx": 'import { LAB_REGISTRY } from "../../features/learn/labRegistry";\n',
      "src/features/learn/labRegistry.tsx": "export const LAB_REGISTRY = {};\n",
    });
    expect(checkBoundary(root)).toEqual(["src/landing/render/x.tsx: imports src/features/learn/labRegistry.tsx"]);
  });

  it("rejects an allowlisted data module that starts importing app code", () => {
    const root = tree({
      "src/features/learn/curriculum.ts": 'import "./Lab.css";\nexport const CURRICULUM = [];\n',
      "src/features/learn/Lab.css": "",
    });
    expect(checkBoundary(root)).toEqual([
      "src/features/learn/curriculum.ts: imports src/features/learn/Lab.css, which the build-time renderer cannot vouch for",
    ]);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd frontend && npx vitest run scripts/check-landing-boundary.test.ts`
Expected: FAIL. `./check-landing-boundary.mjs` cannot be resolved.

- [ ] **Step 3: Implement**

Create `frontend/scripts/check-landing-boundary.mjs`:

```js
/**
 * Landing import boundary.
 *
 * - src/landing/client/** ships to the browser. It may import only other
 *   client files, the generated globe point set as a URL, and the Geist
 *   @fontsource stylesheets. Nothing from the app, so no app code or runtime
 *   reaches the landing bundle.
 * - src/landing/render/** runs at build time. It may import other render
 *   files, react, react-dom/server, zod, and the pure data modules listed in
 *   RENDER_DATA_MODULES, which may themselves import only each other (type
 *   imports aside).
 * - Neither side may use dynamic import().
 *
 * Usage: node scripts/check-landing-boundary.mjs [frontendRoot]
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const RENDER_DATA_MODULES = [
  "src/features/learn/curriculum.ts",
  "src/features/learn/practice/questionBank.ts",
  "src/features/learn/practice/selectDaily.ts",
  "src/features/learn/cases/caseCatalog.ts",
  "src/features/learn/cases/caseTypes.ts",
];
const RENDER_PACKAGES = new Set(["react", "react-dom/server", "zod"]);
const CLIENT_GENERATED = "src/landing/generated/globe-points.json?url";
const CLIENT_PACKAGE = /^@fontsource\/geist(-mono)?\/latin-\d00\.css$/;

const IMPORT = /^\s*(?:import|export)\s+(type\s+)?(?:[^"';]*?\sfrom\s+)?["']([^"']+)["']/gm;
const DYNAMIC = /\bimport\s*\(/;

function walk(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return walk(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

function resolveRelative(root, file, specifier) {
  const [path, query] = specifier.split("?");
  const base = resolve(dirname(file), path);
  const found = [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts")].find((p) => existsSync(p) && statSync(p).isFile());
  const rel = relative(root, found ?? base).split("\\").join("/");
  return query ? `${rel}?${query}` : rel;
}

function imports(file) {
  const source = readFileSync(file, "utf8");
  return { dynamic: DYNAMIC.test(source), list: [...source.matchAll(IMPORT)].map((m) => ({ typeOnly: Boolean(m[1]), specifier: m[2] })) };
}

export function checkBoundary(root) {
  const violations = [];
  const relFile = (file) => relative(root, file).split("\\").join("/");

  for (const file of walk(join(root, "src/landing/client"))) {
    const { dynamic, list } = imports(file);
    if (dynamic) violations.push(`${relFile(file)}: dynamic import()`);
    for (const { specifier } of list) {
      if (CLIENT_PACKAGE.test(specifier)) continue;
      if (!specifier.startsWith(".")) {
        violations.push(`${relFile(file)}: imports package "${specifier}"`);
        continue;
      }
      const target = resolveRelative(root, file, specifier);
      if (target === CLIENT_GENERATED) continue;
      if (!target.startsWith("src/landing/client/")) violations.push(`${relFile(file)}: imports ${target}`);
    }
  }

  for (const file of walk(join(root, "src/landing/render"))) {
    const { dynamic, list } = imports(file);
    if (dynamic) violations.push(`${relFile(file)}: dynamic import()`);
    for (const { specifier } of list) {
      if (!specifier.startsWith(".")) {
        if (!RENDER_PACKAGES.has(specifier)) violations.push(`${relFile(file)}: imports package "${specifier}"`);
        continue;
      }
      const target = resolveRelative(root, file, specifier);
      if (target.startsWith("src/landing/render/") || RENDER_DATA_MODULES.includes(target)) continue;
      violations.push(`${relFile(file)}: imports ${target}`);
    }
  }

  for (const module of RENDER_DATA_MODULES) {
    const file = join(root, module);
    if (!existsSync(file)) {
      violations.push(`${module}: listed in RENDER_DATA_MODULES but missing`);
      continue;
    }
    const { dynamic, list } = imports(file);
    if (dynamic) violations.push(`${module}: dynamic import()`);
    for (const { typeOnly, specifier } of list) {
      if (typeOnly) continue;
      const target = specifier.startsWith(".") ? resolveRelative(root, file, specifier) : specifier;
      if (!RENDER_DATA_MODULES.includes(target)) violations.push(`${module}: imports ${target}, which the build-time renderer cannot vouch for`);
    }
  }
  return violations;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = resolve(process.argv[2] ?? process.cwd());
  const violations = checkBoundary(root);
  if (violations.length > 0) {
    console.error("Landing boundary violation:");
    for (const violation of violations) console.error(`  ${violation}`);
    process.exit(1);
  }
  console.log("Landing boundary: PASS");
}
```

Add the script to `frontend/package.json`, directly after `"check:bundle"`. Add a comma to the `check:bundle` line, so it reads:

```json
    "check:bundle": "node scripts/check-bundle.mjs",
    "check:landing-boundary": "node scripts/check-landing-boundary.mjs"
```

Modify `.github/workflows/ci.yml` — the `frontend` job. Apply this change:

```diff
@@ -223,6 +223,10 @@ jobs:
         run: npm run check:base-ui-boundary
         working-directory: frontend

+      - name: Landing import boundary
+        run: npm run check:landing-boundary
+        working-directory: frontend
+
   # Exercise the same fail-closed gate developers run before asking for
   # review. This deliberately runs in a clean environment so DB isolation,
   # artifact scanning, Sentry credential clearing, and final HEAD validation
```

- [ ] **Step 4: Run the tests and the check**

Run: `cd frontend && npx vitest run scripts/check-landing-boundary.test.ts && npm run check:landing-boundary`
Expected: `5 passed`, then `Landing boundary: PASS`.

- [ ] **Step 5: Commit**

```bash
git add frontend/scripts/check-landing-boundary.mjs frontend/scripts/check-landing-boundary.test.ts frontend/package.json .github/workflows/ci.yml
git commit -m "feat(landing): enforce the landing import boundary in CI (landing 14)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 15: Deploy the landing page behind the flag

**Files:**
- Create: `frontend/scripts/build-landing-if-enabled.mjs`
- Modify: `vercel.json` (`buildCommand`), `tests/tutor/test_config.py:271`, `scripts/verify_tutor_release.py:65` (both pin the command by exact equality)
- Modify: `README.md` (the Vercel environment variables table)
- Test: `frontend/scripts/build-landing-if-enabled.test.ts`, `tests/test_landing_deploy.py`

**Interfaces:**
- Consumes: `buildLanding()` from Task 13.
- Produces:
  - `TRUE_VALUES` and `landingEnabled(env?) -> boolean`, with the same spellings as `_env_flag`;
  - the build command `cd frontend && npm run build && node scripts/build-landing-if-enabled.mjs`.

With the flag off, the hook prints `RELAY_LANDING_ENABLED is off: skipping the landing build.` and exits 0, having done nothing but read the flag. The pytest proves this with a `PATH` that contains only `node`: if the hook reached the facts export, it would fail for lack of Python. With the flag on, any failure in the landing build fails the deploy.

`test_vercel_bundle.py` needs no change. Its startup probe requests `GET /` with the flag unset, follows the redirect and expects no 5xx. It copies only tracked files, so the gitignored `landing_dist` is never in its bundle, but it is on disk in a real Vercel build and `excludeFiles` keeps it.

- [ ] **Step 1: Write the failing tests**

Create `frontend/scripts/build-landing-if-enabled.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { landingEnabled } from "./build-landing-if-enabled.mjs";

describe("build-landing-if-enabled", () => {
  it("uses the same fail-closed spellings as app/config.py _env_flag", () => {
    for (const on of ["1", "true", "TRUE", " yes ", "on"]) expect(landingEnabled({ RELAY_LANDING_ENABLED: on })).toBe(true);
    for (const off of ["", "0", "false", "off", "no", "ture", "enabled"]) expect(landingEnabled({ RELAY_LANDING_ENABLED: off })).toBe(false);
    expect(landingEnabled({})).toBe(false);
  });
});
```

Create `tests/test_landing_deploy.py`:

```python
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
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd frontend && npx vitest run scripts/build-landing-if-enabled.test.ts`
Expected: FAIL. `./build-landing-if-enabled.mjs` cannot be resolved.

Run: `python -m pytest tests/test_landing_deploy.py -q`
Expected: `test_build_runs_the_app_build_first_then_the_flag_gated_landing_hook` fails on the old command, and the hook tests fail with `Cannot find module`.

- [ ] **Step 3: Implement**

Create `frontend/scripts/build-landing-if-enabled.mjs`:

```js
/**
 * Vercel build hook. With RELAY_LANDING_ENABLED off this reads the flag and
 * exits 0, doing nothing else, so the /app deploy is exactly today's. With it
 * on, the landing build runs and any failure fails the deploy.
 *
 * The true spellings match app/config.py _env_flag: 1, true, yes, on (any case,
 * surrounding whitespace ignored). Everything else is off.
 */
import { fileURLToPath } from "node:url";

export const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);

export function landingEnabled(env = process.env) {
  const raw = env.RELAY_LANDING_ENABLED;
  return raw !== undefined && TRUE_VALUES.has(raw.trim().toLowerCase());
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (!landingEnabled()) {
    console.log("RELAY_LANDING_ENABLED is off: skipping the landing build.");
  } else {
    const { buildLanding } = await import("./build-landing.mjs");
    try {
      buildLanding();
    } catch (error) {
      console.error(`landing build failed: ${error.message}`);
      process.exit(1);
    }
  }
}
```

Modify `vercel.json`. Apply this change:

```diff
@@ -1,7 +1,7 @@
 {
   "$schema": "https://openapi.vercel.sh/vercel.json",
   "installCommand": "cd frontend && npm ci && cd .. && pip install '.[ai]'",
-  "buildCommand": "cd frontend && npm run build",
+  "buildCommand": "cd frontend && npm run build && node scripts/build-landing-if-enabled.mjs",
   "functions": {
     "app/main.py": {
       "maxDuration": 30,
```

Modify `tests/tutor/test_config.py`. Apply this change:

```diff
@@ -268,7 +268,9 @@ def test_the_vercel_build_and_function_budget_match_the_tutor_contract():
         vercel = json.load(handle)

     assert vercel["installCommand"] == "cd frontend && npm ci && cd .. && pip install '.[ai]'"
-    assert vercel["buildCommand"] == "cd frontend && npm run build"
+    assert vercel["buildCommand"] == (
+        "cd frontend && npm run build && node scripts/build-landing-if-enabled.mjs"
+    )
     max_duration = vercel["functions"]["app/main.py"]["maxDuration"]
     assert isinstance(max_duration, int)
     assert max_duration == 30
```

Modify `scripts/verify_tutor_release.py`. Apply this change:

```diff
@@ -62,7 +62,9 @@ def main() -> int:

     if vercel.get("installCommand") != "cd frontend && npm ci && cd .. && pip install '.[ai]'":
         _fail("vercel installCommand no longer matches the production AI build")
-    if vercel.get("buildCommand") != "cd frontend && npm run build":
+    if vercel.get("buildCommand") != (
+        "cd frontend && npm run build && node scripts/build-landing-if-enabled.mjs"
+    ):
         _fail("vercel buildCommand no longer matches the production frontend build")

     function = vercel.get("functions", {}).get("app/main.py", {})
```

In `README.md`, under **Deploying to Vercel → Environment variables**, add this row after `DATABASE_URL`:

```markdown
| `RELAY_LANDING_ENABLED` | `true` to launch the landing page | Optional, off by default. On (`1`, `true`, `yes`, `on`), the build also builds the landing page and `/` serves it instead of redirecting to `/app`. Read at process start and in the build command, so a change needs a redeploy. |
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `cd frontend && npx vitest run scripts/build-landing-if-enabled.test.ts`
Expected: `1 passed`.

Run: `python -m pytest tests/test_landing_deploy.py tests/tutor/test_config.py tests/test_vercel_bundle.py -q && python scripts/verify_tutor_release.py && ruff check .`
Expected: all pass; `tutor release contract OK: …`; `All checks passed!`. `verify_tutor_release.py` needs the `/app` build from Task 13.

Run: `cd frontend && node scripts/build-landing-if-enabled.mjs && RELAY_LANDING_ENABLED=1 node scripts/build-landing-if-enabled.mjs | tail -1`
Expected: `RELAY_LANDING_ENABLED is off: skipping the landing build.`, then `landing build: PASS (/app output unchanged)`.

- [ ] **Step 5: Commit**

```bash
git add frontend/scripts/build-landing-if-enabled.mjs frontend/scripts/build-landing-if-enabled.test.ts tests/test_landing_deploy.py vercel.json tests/tutor/test_config.py scripts/verify_tutor_release.py README.md
git commit -m "feat(landing): build the landing page on deploy only when the flag is on (landing 15)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 16: End-to-end coverage in a dedicated Playwright project

**Files:**
- Modify: `frontend/playwright.config.ts`, `scripts/run_e2e_server.sh` (port from `RELAY_E2E_PORT`), `frontend/e2e/global-setup.ts` (also build the landing page)
- Create: `frontend/e2e/helpers/landingAudits.ts`
- Test: `frontend/e2e/landing.spec.ts`

**Interfaces:**
- Consumes: the built `app/landing_dist` (Task 13), served by a second uvicorn with the flag on.
- Produces:
  - `containmentAudit(): string[]` and `contrastAudit(): string[]`, self-contained so Playwright can serialise them into `page.evaluate`;
  - the Playwright project `landing` (Chromium, `baseURL` `http://127.0.0.1:8001`);
  - a config-level `testIgnore: /landing\.spec\.ts$/` that keeps the seven existing projects off the spec.

The second `webServer` runs `run_e2e_server.sh` with `RELAY_LANDING_ENABLED=1`, `RELAY_E2E_PORT=8001` and its own SQLite file in the OS temp directory, so two servers never seed one file. It is never reused: a developer's flag-off server on 8001 would make every landing test run against the redirect. Playwright merges a `webServer`'s `env` over `process.env`. The spec sets viewports, colour schemes, stored preferences and JavaScript per test, so one project covers the matrix.

- [ ] **Step 1: Write the failing test**

Create `frontend/e2e/helpers/landingAudits.ts`:

```ts
/**
 * In-page audits for the landing page. Each function is self-contained so
 * Playwright can serialise it into page.evaluate().
 */

/**
 * Containment: every bordered box contains its in-flow descendants (±1px),
 * no box is wider than its content allows unless it scrolls on purpose,
 * route tags stay on the stage, and the page never scrolls sideways.
 */
export function containmentAudit(): string[] {
  const issues: string[] = [];
  const sideways = document.documentElement.scrollWidth - window.innerWidth;
  if (sideways > 1) issues.push(`page scrolls sideways by ${sideways}px`);
  const selector = [
    ".grid>*", ".mods>a", ".schemes>div", ".legend>button", ".tabs button", ".panel>div", ".anat>div",
    ".ledger div", ".vroute li", ".checks div", ".rows div", ".cal span", ".head", ".btn", ".chip",
    ".stat", ".tool", ".themes button", ".vop .pair div", ".iban span", ".prov", ".res", ".menu-panel a",
  ].join(",");
  for (const box of Array.from(document.querySelectorAll<HTMLElement>(selector))) {
    if (!box.offsetParent) continue;
    const outer = box.getBoundingClientRect();
    if (outer.width === 0) continue;
    for (const child of Array.from(box.querySelectorAll<HTMLElement>("*"))) {
      const style = getComputedStyle(child);
      if (style.position === "absolute" || style.position === "fixed" || child.closest("svg,canvas,.cells,.mt")) continue;
      const inner = child.getBoundingClientRect();
      if (inner.width === 0 || inner.height === 0) continue;
      if (inner.left < outer.left - 1 || inner.right > outer.right + 1 || inner.top < outer.top - 1 || inner.bottom > outer.bottom + 1) {
        issues.push(`${box.className || box.tagName} > ${child.tagName.toLowerCase()} "${(child.textContent ?? "").trim().slice(0, 40)}" overflows its box`);
        break;
      }
    }
    if (box.scrollWidth > box.clientWidth + 1 && getComputedStyle(box).overflowX !== "auto") {
      issues.push(`${box.className || box.tagName} content is wider than its box (${box.scrollWidth} > ${box.clientWidth})`);
    }
  }
  const stage = document.getElementById("route-stage");
  if (stage?.offsetParent) {
    const bounds = stage.getBoundingClientRect();
    for (const tag of Array.from(stage.querySelectorAll<HTMLElement>(".tag"))) {
      const rect = tag.getBoundingClientRect();
      if (rect.width !== 260) issues.push(`route tag is ${rect.width}px wide, not 260px`);
      if (rect.left < bounds.left - 1 || rect.right > bounds.right + 1 || rect.bottom > bounds.bottom + 1) {
        issues.push(`route tag "${(tag.textContent ?? "").trim().slice(0, 30)}" leaves the stage`);
      }
    }
  }
  return Array.from(new Set(issues));
}

/**
 * Rendered text contrast. The text colour is composited with every ancestor's
 * opacity over the composited backgrounds, then held to WCAG 2.2 AA: 4.5:1, or
 * 3:1 for text of 24px or larger, or 18.66px and bold.
 */
export function contrastAudit(): string[] {
  type Rgba = [number, number, number, number];
  const parse = (value: string): Rgba | null => {
    const m = value.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?/);
    return m ? [Number(m[1]), Number(m[2]), Number(m[3]), m[4] === undefined ? 1 : Number(m[4])] : null;
  };
  const over = (top: Rgba, bottom: Rgba): Rgba => [0, 1, 2].map((i) => top[i] * top[3] + bottom[i] * (1 - top[3])).concat(1) as Rgba;
  const channel = (v: number) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  const luminance = (c: Rgba) => 0.2126 * channel(c[0]) + 0.7152 * channel(c[1]) + 0.0722 * channel(c[2]);
  const background = (element: Element): Rgba => {
    const layers: Rgba[] = [];
    for (let node: Element | null = element; node; node = node.parentElement) {
      const colour = parse(getComputedStyle(node).backgroundColor);
      if (colour && colour[3] > 0) {
        layers.push(colour);
        if (colour[3] >= 1) break;
      }
    }
    let base = parse(getComputedStyle(document.body).backgroundColor) ?? [255, 255, 255, 1];
    for (let i = layers.length - 1; i >= 0; i--) base = over(layers[i], base);
    return base;
  };
  const failures: string[] = [];
  for (const element of Array.from(document.querySelectorAll<HTMLElement>("body *"))) {
    if (!element.offsetParent || element.closest("svg,canvas,[aria-hidden=true]")) continue;
    const ownText = Array.from(element.childNodes).some((n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? "").trim());
    if (!ownText) continue;
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 || rect.bottom < 0 || rect.top > window.innerHeight) continue;
    const style = getComputedStyle(element);
    let opacity = 1;
    for (let node: Element | null = element; node; node = node.parentElement) opacity *= Number(getComputedStyle(node).opacity);
    let fg = parse(style.color);
    if (!fg) continue;
    const bg = background(element);
    fg = [fg[0], fg[1], fg[2], fg[3] * opacity];
    if (fg[3] < 1) fg = over(fg, bg);
    const [l1, l2] = [luminance(fg), luminance(bg)];
    const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    const size = Number.parseFloat(style.fontSize);
    const large = size >= 24 || (size >= 18.66 && Number(style.fontWeight) >= 700);
    if (ratio < (large ? 3 : 4.5)) {
      failures.push(`${ratio.toFixed(2)}:1 at ${size}px "${(element.textContent ?? "").trim().slice(0, 36)}"`);
    }
  }
  return failures;
}
```

Create `frontend/e2e/landing.spec.ts`:

```ts
import { expect, test, type Page } from "@playwright/test";
import { containmentAudit, contrastAudit } from "./helpers/landingAudits";

/**
 * The landing page at /, served with RELAY_LANDING_ENABLED on (playwright.config.ts
 * gives this project its own flag-on server). It sets viewports, themes and motion
 * per test, so one Chromium project covers the matrix.
 */
const WIDTHS = [390, 768, 1024, 1440];
const PREFS = (overrides: Record<string, unknown>) =>
  JSON.stringify({ schemaVersion: 1, reducedMotion: false, navigationDensity: "comfortable", firstRunGuidanceSeen: [], theme: "system", ...overrides });
const SCROLL_STOPS = 12;

async function storePreferences(page: Page, value: string) {
  await page.addInitScript((raw) => localStorage.setItem("relay:preferences", raw), value);
}

async function sweep(page: Page, check: () => Promise<string[]>): Promise<string[]> {
  const found = new Set<string>();
  const height = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
  for (let i = 0; i < SCROLL_STOPS; i++) {
    await page.evaluate((y) => window.scrollTo({ top: y, behavior: "instant" }), Math.round((height * i) / (SCROLL_STOPS - 1)));
    await page.waitForTimeout(150);
    for (const issue of await check()) found.add(issue);
  }
  return [...found];
}

test.describe("landing page layout and contrast", () => {
  for (const width of WIDTHS) {
    for (const theme of ["light", "dark", "black"] as const) {
      test(`${theme} at ${width}px: nothing overflows, every text pair passes AA, no errors`, async ({ page }) => {
        const errors: string[] = [];
        page.on("pageerror", (error) => errors.push(String(error)));
        page.on("console", (message) => {
          if (message.type() === "error") errors.push(message.text());
        });
        await page.setViewportSize({ width, height: 900 });
        // Black is stored, so test it under an OS light setting: its block must be self-contained.
        await page.emulateMedia({ colorScheme: theme === "dark" ? "dark" : "light" });
        if (theme === "black") await storePreferences(page, PREFS({ theme: "black" }));
        await page.goto("/", { waitUntil: "load" });
        if (theme === "black") await expect(page.locator("html")).toHaveAttribute("data-theme", "black");

        expect(await sweep(page, () => page.evaluate(containmentAudit))).toEqual([]);
        expect(await sweep(page, () => page.evaluate(contrastAudit))).toEqual([]);
        expect(errors).toEqual([]);
      });
    }
  }
});

test.describe("landing page behaviour", () => {
  test("serves the landing page at / with the simulation stated", async ({ page }) => {
    const response = await page.goto("/");
    expect(response?.status()).toBe(200);
    expect(response?.headers()["cache-control"]).toBe("no-cache");
    for (const selector of ["#hero", "#route", "#anatomy", "#data", "#tools", "footer"]) {
      await expect(page.locator(`${selector} [data-simulation]`).first()).toBeAttached();
    }
    await expect(page.getByRole("link", { name: /sign in/i })).toHaveCount(0);
  });

  test("rail tabs follow the WAI-ARIA keyboard pattern", async ({ page }) => {
    await page.goto("/");
    const tabs = page.getByRole("tab");
    await tabs.first().focus();
    await page.keyboard.press("ArrowLeft");
    await expect(tabs.last()).toBeFocused();
    await expect(page.locator("#rail-panel-swift")).toBeVisible();
    await page.keyboard.press("Home");
    await expect(tabs.first()).toHaveAttribute("aria-selected", "true");
    await expect(page.locator("#rail-panel-gbp")).toBeVisible();
    await page.keyboard.press("End");
    await expect(tabs.last()).toHaveAttribute("aria-selected", "true");
    await expect(page.locator("#rail-panel-gbp")).toBeHidden();
  });

  test("a legend button activates its corridor and pausing holds the tour", async ({ page }) => {
    await page.goto("/");
    const toggle = page.locator("#tour-toggle");
    await expect(toggle).toHaveText("Pause tour");
    const third = page.locator("[data-corridor]").nth(2);
    await third.click();
    // Focusing a legend button pauses the tour (WCAG 2.2.2).
    await expect(toggle).toHaveText("Play tour");
    await expect(third).toHaveClass(/\bon\b/);
    await page.waitForTimeout(9000);
    await expect(third).toHaveClass(/\bon\b/);
    await toggle.click();
    await expect(toggle).toHaveText("Pause tour");
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
  });

  test("the IBAN demo plays once, then offers Replay", async ({ page }) => {
    await page.goto("/");
    await page.locator("#iban-demo").scrollIntoViewIfNeeded();
    await expect(page.locator("#iban-replay")).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("#iban-checks .on")).toHaveCount(4);
  });

  test("counters keep the final value readable while they count", async ({ page }) => {
    await page.goto("/");
    const first = page.locator(".stats [data-count]").first();
    const text = (await first.textContent()) ?? "";
    await first.scrollIntoViewIfNeeded();
    await expect(first.locator(".sr")).toHaveText(text);
    await expect(first.locator(".sr")).toHaveCount(0, { timeout: 3000 });
    await expect(first).toHaveText(text);
  });

  test("a vertical swipe that starts on the mobile globe scrolls the page", async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const page = await context.newPage();
    await page.goto("/");
    const box = (await page.locator(".globe-wrap").boundingBox())!;
    const x = box.x + box.width / 2;
    const y = Math.min(box.y + box.height / 2, 700);
    const cdp = await context.newCDPSession(page);
    const touch = (type: string, ty: number) =>
      cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y: ty }] });
    await touch("touchStart", y);
    for (let step = 1; step <= 10; step++) await touch("touchMove", y - step * 30);
    await touch("touchEnd", y - 300);
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(100);
    await context.close();
  });
});

test.describe("landing page without JavaScript or motion", () => {
  test("every section and every rail panel renders without JavaScript", async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    await page.goto("/");
    for (const id of ["hero", "route", "anatomy", "rails", "data", "learn", "tools"]) await expect(page.locator(`#${id}`)).toBeVisible();
    const panels = page.getByRole("tabpanel");
    const count = await panels.count();
    expect(count).toBeGreaterThan(1);
    for (let i = 0; i < count; i++) await expect(panels.nth(i)).toBeVisible();
    await expect(page.locator("#globe-stage")).toBeHidden();
    await expect(page.locator(".legend")).toBeVisible();
    await context.close();
  });

  for (const how of ["media query", "stored preference"] as const) {
    test(`reduced motion by ${how}: end states and no tour`, async ({ page }) => {
      if (how === "media query") await page.emulateMedia({ reducedMotion: "reduce" });
      else await storePreferences(page, PREFS({ reducedMotion: true }));
      await page.goto("/");
      await expect(page.locator("html")).not.toHaveClass(/\bmotion\b/);
      await expect(page.locator("#tour-toggle")).toBeHidden();
      await expect(page.locator("#iban-replay")).toBeHidden();
      const tag = page.locator("#route-stage .tag b").first();
      const [ink, colour] = await tag.evaluate((el) => [
        getComputedStyle(document.documentElement).getPropertyValue("--ink").trim(),
        getComputedStyle(el).color,
      ]);
      expect(ink).not.toBe("");
      // End state: every hop is reached, so tags use the ink token, not muted.
      const muted = await page.evaluate(() => {
        const probe = document.createElement("span");
        probe.style.color = "var(--muted)";
        document.body.append(probe);
        const value = getComputedStyle(probe).color;
        probe.remove();
        return value;
      });
      expect(colour).not.toBe(muted);
    });
  }
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd frontend && E2E_SKIP_BUILD=1 npx playwright test --project=landing`
Expected: Playwright reports that the project `landing` does not exist.

- [ ] **Step 3: Implement**

Modify `frontend/playwright.config.ts`. Apply this change:

```diff
@@ -1,5 +1,11 @@
+import { tmpdir } from "node:os";
+import { join } from "node:path";
 import { defineConfig, devices } from "@playwright/test";

+// The landing page runs only in its own project, against its own flag-on server.
+const LANDING_SPEC = /landing\.spec\.ts$/;
+const LANDING_PORT = 8001;
+
 export default defineConfig({
   testDir: "./e2e",
   // Rebuilds the bundle the suite actually exercises. See e2e/global-setup.ts:
@@ -17,6 +23,7 @@ export default defineConfig({
   // navigation timeout, never an assertion — so the budget is the problem, not
   // any one test. The three full-pipeline tests keep their own 120s overrides.
   timeout: 60_000,
+  testIgnore: LANDING_SPEC,
   use: {
     baseURL: "http://127.0.0.1:8000",
     trace: "on-first-retry",
@@ -80,16 +87,47 @@ export default defineConfig({
         reducedMotion: "reduce",
       },
     },
+    // ─── Landing page ─────────────────────────────────────────────────────────
+    // landing.spec.ts sets its own viewports, themes and motion settings, so a
+    // single Chromium project covers the matrix. Its server has
+    // RELAY_LANDING_ENABLED on; every other project ignores the spec.
+    {
+      name: "landing",
+      testMatch: LANDING_SPEC,
+      testIgnore: [],
+      use: {
+        browserName: "chromium",
+        baseURL: `http://127.0.0.1:${LANDING_PORT}`,
+        viewport: { width: 1440, height: 900 },
+      },
+    },
+  ],
+  webServer: [
+    {
+      // Start from the repository root so the shared launcher can resolve the
+      // current worktree's environment, a linked worktree's common .venv, or uv's
+      // project environment. reuseExistingServer still lets a developer-run
+      // uvicorn (or a prior run) short-circuit the spawn.
+      cwd: "..",
+      command: "./scripts/run_e2e_server.sh",
+      url: "http://127.0.0.1:8000/api/health",
+      reuseExistingServer: true,
+      timeout: 30_000,
+    },
+    {
+      // Never reused: a developer's flag-off server on this port would make
+      // every landing test assert against the redirect instead of the page.
+      cwd: "..",
+      command: "./scripts/run_e2e_server.sh",
+      url: `http://127.0.0.1:${LANDING_PORT}/api/health`,
+      reuseExistingServer: false,
+      timeout: 30_000,
+      env: {
+        RELAY_LANDING_ENABLED: "1",
+        RELAY_E2E_PORT: String(LANDING_PORT),
+        // Its own database, so two servers never seed the same SQLite file.
+        DATABASE_URL: `sqlite:///${join(tmpdir(), "relay-landing-e2e.db")}`,
+      },
+    },
   ],
-  webServer: {
-    // Start from the repository root so the shared launcher can resolve the
-    // current worktree's environment, a linked worktree's common .venv, or uv's
-    // project environment. reuseExistingServer still lets a developer-run
-    // uvicorn (or a prior run) short-circuit the spawn.
-    cwd: "..",
-    command: "./scripts/run_e2e_server.sh",
-    url: "http://127.0.0.1:8000/api/health",
-    reuseExistingServer: true,
-    timeout: 30_000,
-  },
 });
```

Modify `scripts/run_e2e_server.sh`. Apply this change:

```diff
@@ -13,7 +13,8 @@ if [[ -n "$common_git_dir" ]]; then
   common_root="$(cd -- "$(dirname -- "$common_git_dir")" && pwd)"
 fi

-server_args=(app.main:app --host 127.0.0.1 --port 8000)
+# RELAY_E2E_PORT lets the landing project run a second, flag-on server.
+server_args=(app.main:app --host 127.0.0.1 --port "${RELAY_E2E_PORT:-8000}")

 for uvicorn_path in "$repo_root/.venv/bin/uvicorn" "$common_root/.venv/bin/uvicorn"; do
   if [[ -x "$uvicorn_path" ]]; then
```

Modify `frontend/e2e/global-setup.ts`. Apply this change:

```diff
@@ -19,4 +19,6 @@ export default function globalSetup(config: FullConfig): void {
     return;
   }
   execFileSync("npm", ["run", "build"], { stdio: "inherit", cwd: config.rootDir });
+  // The landing project serves app/landing_dist; rebuild it for the same reason.
+  execFileSync("npm", ["run", "build:landing"], { stdio: "inherit", cwd: config.rootDir });
 }
```

- [ ] **Step 4: Run the landing project and check isolation**

Run: `cd frontend && npm run build && npm run build:landing && E2E_SKIP_BUILD=1 npx playwright test --project=landing`
Expected: `21 passed` (about 40 seconds).

Run: `cd frontend && E2E_SKIP_BUILD=1 npx playwright test --list | grep -c "landing.spec"; E2E_SKIP_BUILD=1 npx playwright test --list | grep "landing.spec" | grep -vc "\[landing\]"`
Expected: `21`, then `0`. No other project runs the spec, and each existing project keeps its test count.

Check that the audits bite. Temporarily add a spec, `e2e/sanity-landing.spec.ts`. In it, call `page.addStyleTag({ content: ".stat small{white-space:nowrap;font-size:40px} .tag.t3{width:300px} .lede{color:#E9ECF2 !important}" })`, then assert that `containmentAudit` reports an overflow and a `not 260px` tag, and that `contrastAudit` reports at least one failure. Run it with `--project=landing`; it passes. Delete it.

- [ ] **Step 5: Commit**

```bash
git add frontend/playwright.config.ts scripts/run_e2e_server.sh frontend/e2e/global-setup.ts frontend/e2e/helpers/landingAudits.ts frontend/e2e/landing.spec.ts
git commit -m "test(landing): cover the landing page end to end in its own project (landing 16)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 17: Documentation, then the full verification gate

**Files:**
- Modify: `CLAUDE.md`, `README.md`, `frontend/README.md`, `DESIGN.md`

No behaviour changes in this task. Each edit below gives the exact text to find and its replacement.

- [ ] **Step 1: `CLAUDE.md`**

In the **Backend (`app/`)** tree, after the `main.py` line, add:

```text
  landing.py        landing page at / behind RELAY_LANDING_ENABLED (off by default)
```

In the **Frontend (`frontend/`)** tree, after the `lib/persistence/` line, add:

```text
  landing/          landing page, built separately (vite.landing.config.ts):
                    render/ runs at build time, client/ ships to the browser
```

After the **AI tutor (`app/tutor/`)** section, add this section:

```markdown
### Landing page (`/`)

Off by default; `/` redirects to `/app` until `RELAY_LANDING_ENABLED` is on and `app/landing_dist/`
is built. Spec: `docs/superpowers/specs/2026-10-01-relay-landing-and-visual-language-design.md`.

Rules that are easy to break by accident:

- **Flag off is today, exactly.** `mount_landing()` returns before touching the filesystem, and the
  Vercel hook (`frontend/scripts/build-landing-if-enabled.mjs`) only reads the flag. Do not move landing
  work ahead of either check.
- **Never import `frontend/src/landing/generated/`** from tracked TypeScript except as a `?url` asset.
  It is gitignored, and `tsc` checks all of `src/`, so a static import breaks the `/app` build on every
  clean checkout. The renderer reads `facts.json` with `fs` in `vite.landing.config.ts`.
- **The /app build must not change.** The landing page has its own Vite config; `build-landing.mjs`
  fails if `app/static/relay` changes. Do not add a second entry to `vite.config.ts`.
- **Every fact comes from data.** Counts come from `scripts/export_landing_facts.py`; examples from
  `src/landing/render/demo.json`, each checked by `tests/test_landing_demo_claims.py`. A digit-run test
  rejects hand-typed numbers and a pytest rejects real bank names.
- **Import boundary.** `npm run check:landing-boundary`: browser code imports only `src/landing/client/`;
  build-time code imports only the listed pure data modules.
```

In **Testing**, after the end-to-end block, add:

```bash
# Landing page (needs the /app build first for the e2e servers)
cd frontend && npm run build:landing                          # facts, points, landing build, checks
cd frontend && npm run test:e2e -- --project=landing          # landing project, its own flag-on server
```

In **Known issues**, replace:

```text
  skips in every project except `case-reduced-motion`. The six-project Chromium matrix therefore
  has 10 intentional skips; the generic `mobile` project requires the WebKit browser binary.
```

with:

```text
  skips in every project except `case-reduced-motion`. The `landing` project runs only
  `landing.spec.ts` and every other project ignores it (config-level `testIgnore`), so it adds no
  skips. The generic `mobile` project requires the WebKit browser binary.
```

The old "10" was stale. Specs added on 2026-08-25 skip by viewport too, so a static count across the six Chromium projects gives 27, unconfirmed by a run. The rule is the durable statement.

- [ ] **Step 2: `README.md`**

In **Frontend (Relay — React + TypeScript + Vite)**, after the production-build block, add:

````markdown
The landing page at `/` is a separate build, and only serves when `RELAY_LANDING_ENABLED` is on:
```bash
cd frontend && npm run build:landing
RELAY_LANDING_ENABLED=1 uvicorn app.main:app --reload
```
````

- [ ] **Step 3: `frontend/README.md`**

In the **Architecture** tree, after the `lib/persistence/` line, add:

```text
  landing/            landing page (separate build: vite.landing.config.ts):
                      render/ at build time, client/ in the browser, generated/ (ignored)
```

Under **Production build**, after `Outputs to app/static/relay/ …`, add:

````markdown
The landing page builds separately and never touches `app/static/relay/`:

```bash
cd frontend && npm run build:landing   # writes app/landing_dist/
```
````

In **Testing**, replace `# Bundle budget check (≤200KB gzip eager shell)` with `# Bundle budget check (≤210KiB gzip eager shell)`. `check-bundle.mjs` enforces 215,040 bytes. Then add, at the end of that block:

```bash
# Landing import boundary and the landing E2E project
npm run check:landing-boundary
npm run test:e2e -- --project=landing
```

- [ ] **Step 4: `DESIGN.md`**

In the **Adoption status** table, replace the landing row's source cell `Landing tokens, defined below` with:

```text
`frontend/src/landing/client/styles/tokens.css` (values defined below)
```

- [ ] **Step 5: Run the full verification gate**

Run: `cd frontend && npm ci && npm run build && npm run build:landing && cd .. && scripts/verify_before_push.sh origin/main`
Expected: all 10 steps pass. The gate runs:
- ruff;
- `tsc`;
- the `/app` build;
- the full pytest suite on an isolated SQLite file;
- the full Vitest suite with `--no-file-parallelism`;
- the bundle budget;
- the artifact scan;
- the working-tree delta check, which proves no build output is untracked.

Run: `cd frontend && npm run check:landing-boundary && npm run check:base-ui-boundary && E2E_SKIP_BUILD=1 npm run test:e2e -- --project=landing`
Expected: both boundaries `PASS`; `21 passed`.

Run: `cd frontend && E2E_SKIP_BUILD=1 npm run test:e2e`
Expected: every Chromium project passes, with only the intentional skips. The `mobile` project needs WebKit installed (`npx playwright install webkit`); if it is not installed, say so in the PR rather than skipping silently.

CI's `codex-automation` job runs `tests/test_codex_automation.sh`. Run it locally if your environment allows: in the planning spike it sat idle for over 40 minutes and was stopped. Its five `ci.yml` assertions do not touch the `frontend` job this plan edits.

- [ ] **Step 6: Whole-ticket coherence check**

Answer each against the final diff (`git diff origin/main...HEAD`). Any "yes" or "unclear" blocks the PR.

1. **Does any new code run with the flag off that did not run before?** The only new work should be `_env_flag()` in `mount_landing()`, the `LANDING_HTML is not None` check in `root()`, and the hook reading the flag. Evidence: `test_flag_off_mounts_nothing_and_reads_no_file`, `test_importing_the_app_with_flag_off_registers_no_landing_route`, and `test_the_build_hook_does_nothing_with_the_flag_off`.
2. **Is the `/app` build config, entry or output different?** `vite.config.ts` and `index.html` must be untouched in the diff, and `build-landing.mjs` reports `/app output unchanged`.
3. **Can the page state a fact not taken from data?** Evidence: the digit-run scan, the facts-appear test, and `test_landing_demo_claims.py`.
4. **Can the page name a real bank or show a real account number?** Evidence: `test_landing_content.py` and the `ACCT-` and IBAN render test.
5. **Can a theme write corrupt the app's preferences?** Evidence: `preferences.test.ts`, round-tripped through `loadPreferences()`.
6. **Does anything overflow, or fail contrast, at any width or theme?** Evidence: the E2E audit matrix (12 tests).
7. **With motion off or JavaScript off, is every element in its final state and every panel visible?** Evidence: the three E2E tests in "without JavaScript or motion".

- [ ] **Step 7: Commit**

```bash
git add CLAUDE.md README.md frontend/README.md DESIGN.md
git commit -m "docs(landing): document the landing build, flag and rules (landing 17)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Then re-read the full diff from the top, check `git diff --check origin/main...HEAD`, and confirm that only intended files changed: no `app/landing_dist/`, no `generated/`, no `app/static/relay/`. Record the commands and results in the PR.

---

## Self-review against the spec

| Spec requirement | Task |
|---|---|
| Invariant 1: facts from data, demo values tested, real links, no Sign in | 5, 4, 9 (digit scan, facts-appear, route links), 7 |
| Invariant 2: simulation stated; fictional institutions; no real names; `ACCT-` only | 9 (render and content tests), 4 |
| Invariant 3: flag off is today; `/app` byte-identical | 1, 13 (hash guard), 15 |
| Invariant 4: containment at four widths | 8, 16 |
| Invariant 5: final states without motion or JavaScript; pause control | 8, 11, 12, 13 (pre-paint flags), 16 |
| Invariant 6: preference contract; AA in all themes | 10, 8 (palette), 16 (contrast audit) |
| Separate build, Vite 8 names, output outside `app/static`, immutable assets, `no-cache` page | 13, 1 |
| Deploy hook, pinned build command, `excludeFiles`, `.env.example`, README | 15, 1 |
| Static-first rendering with `runnerImport`; renderer and client allowlists | 9, 13, 14 |
| Themes: tokens, byte-identical pre-paint, writer parity, canvas colours | 8, 13, 10, 12 |
| Data sources: export, fixture, STP registry, corridor table, demo claims | 5, 2, 3, 4 |
| Page structure: nav with `<details>`, hero, stats, sections 01–06, CTA, footer, head | 9, 13 |
| Interaction: globe, route, anatomy, tabs, counters, IBAN | 12, 11, 16 |
| Responsive table and rail geometry | 8, 16 |
| Accessibility: landmarks, skip link, focus, legend as text equivalent | 9, 8, 16 |
| Budgets: JS, points, fonts | 13 (`check-landing-build.mjs`), 6 |
| Degraded states: no context, no JS, fonts, points fail, export fails, build missing | 12, 16, 8, 12, 13 and 15, 1 |
| Testing items 1–15 | 1–16 |
| Rollout: flag only; no data to unwind | 1, 15 |
| Documentation | 2, 15, 17 |

---


---

## Execution handoff

Plan complete. Two ways to run it:

1. **Subagent-driven (recommended).** A fresh subagent per task, with a two-stage review between tasks
   (superpowers:subagent-driven-development).
2. **Inline.** Tasks executed in one session with checkpoints (superpowers:executing-plans).
