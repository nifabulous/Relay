# CLAUDE.md — Relay Educational Payment Simulation

> Guidance for AI coding agents working on this codebase.

## What this project is

An **educational payment simulation** for learning how cross-border payments work. Two halves:

1. **FastAPI backend** (`app/`) — validates IBAN/BIC, looks up banks, suggests correspondent intermediaries, simulates VoP / fees / sanctions / tracking / MT103 STP. 22 API endpoints under `/api/*`.
2. **Relay frontend** (`frontend/`) — React 19 + TypeScript 7 + Vite 8 application with four workspaces: Overview, Learn, Explore, Operate. Served at `/app`.
3. **Legacy frontend** (`app/static/`) — vanilla HTML/JS/CSS at `/learn` and `/ui`. Being replaced by Relay. Still available until parity is reached.

**It is NOT a production payment system.** No real money moves. Every "payment" is simulated. Account numbers are `ACCT-` placeholders.

## Quick start

```bash
cd swift-routing
python3 -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"

# Backend
uvicorn app.main:app --reload

# Frontend (separate terminal)
cd frontend && npm install && npm run dev
```

- API docs: http://127.0.0.1:8000/docs
- Relay app: http://127.0.0.1:8000/app (or http://127.0.0.1:5173/app/ via Vite dev)
- Legacy learn: http://127.0.0.1:8000/learn (still available)
- Legacy admin: http://127.0.0.1:8000/ui (still available)

## Architecture

### Backend (`app/`)
```
app/
  main.py           FastAPI app, lifespan, static serving (/app, /learn, /ui)
  routers/          11 domain routers (directory, routing, ssi, vop, tracking, etc.)
  services/         domain logic (validator, routing, vop, prepare, seed, etc.)
  models.py         SQLAlchemy 2.0 models
  schemas.py        Pydantic v2 request/response schemas
  auth.py           API key authentication (X-Admin-Key header)
```

### Frontend (`frontend/`)
```
frontend/src/
  app-shell/        AppShell (rail + bottom nav), AppErrorBoundary, router
  design-system/    tokens.css, Button, StatusChip, AsyncRegion, PaymentRoute
  api/              typed client (apiRequest/apiPost), Zod schemas, query keys
  lib/persistence/  versioned localStorage, legacy progress migration
  features/
    overview/       adaptive home with selectPrimaryAction decision table
    explore/        CommandSearch, BankDirectory, Glossary
    operate/
      prepare/      PreparePaymentPage with partial-results pattern
      tools/        FeePage, ScreeningPage, ValueDatePage, StpPage
      tracking/     TrackingPage with timeline
    learn/          curriculum.ts (16 entries: 15 modules + capstone), labs, practice, cases,
                    LearnIndexPage, LearnModulePage
```

### Design system
The canonical design contract is `DESIGN.md`. All components consume tokens from `design-system/tokens.css`. Key principles:
- Blue (#3157D5) reserved for actions, selection, progress only
- Thin structural borders, no decorative shadows or colored card edges
- Status with text + icon + color (never color alone)
- WCAG 2.2 AA contrast (≥4.5:1) on all semantic tokens
- Route-level code splitting (React.lazy per feature)
- Eager shell ≤200KB gzip

## Architecture

```
app/
├── main.py              # FastAPI app, lifespan (seed-on-startup), static serving
├── config.py            # DATABASE_URL from env (SQLite default, Postgres in prod)
├── db.py                # SQLAlchemy engine, SessionLocal, get_db dependency
├── auth.py              # admin_required dependency (X-Admin-Key header)
├── models.py            # SQLAlchemy models (Bank, CorridorRule, SSI, PaymentEvent, etc.)
├── schemas.py           # Pydantic v2 request/response schemas
├── routers/             # Domain routers (split from a former 921-line god-file)
│   ├── _shared.py       # Shared constants (_SSI_DISCLAIMER, _VOP_ADVICE, etc.)
│   ├── directory.py     # /health, /validate, /lookup
│   ├── routing.py       # /route, /us-bank
│   ├── imports.py       # /import/fedwire, /fedach, /ssi (auth-gated)
│   ├── ssi.py           # /ssi
│   ├── vop.py           # /verify-payee
│   ├── tracking.py      # /track/create, /track/{uetr}, /track/{uetr}/skip|complete
│   ├── schemes.py       # /schemes, /schemes/international
│   ├── prepare.py       # /prepare-payment
│   ├── analytics.py     # /fees/simulate, /screen, /value-date, /message/stp-check
│   └── progress.py      # /progress
├── services/            # Business logic (pure functions, testable without DB)
│   ├── validator.py     # IBAN/BIC validation (delegates to schwifty)
│   ├── vop.py           # Verification of Payee (name matching)
│   ├── routing.py       # Correspondent bank routing (curated corridor table)
│   ├── fee_calculator.py# OUR/SHA/BEN fee simulation
│   ├── stp_checker.py   # MT103 STP checker (12-rule primer)
│   ├── value_date.py    # Settlement date calculation
│   ├── screening.py     # Sanctions screening (fictional watchlist)
│   ├── tracking.py      # UETR + simulated gpi timeline
│   ├── prepare.py       # Orchestration: validate → VoP → route → SSI → recommendation
│   ├── recommendation.py# Decision matrix (PROCEED/REVIEW/STOP/etc.)
│   ├── idempotency.py   # Idempotency-Key resolution
│   ├── progress.py      # Badge computation
│   ├── ssi_importer.py  # SSI CSV/JSON import + upsert
│   ├── fed_importer.py  # Fedwire/FedACH import (fail-closed, no default URL)
│   └── seed.py          # Seed data (237 banks, 559 SSI, 72 corridor rules)
├── data/                # Static reference data (payment schemes, watchlist, MT103 samples)
└── static/              # Frontend (vanilla HTML/JS/CSS)
    ├── index.html       # Admin SPA shell (/ui)
    ├── learn.html       # Learning labs shell (/learn)
    ├── css/             # app.css + learn.css (shared token system)
    └── js/              # learn-utils.js (shared esc/utils), lab modules, visualizers
```

### Key patterns

- **Router → Service → Model** layering. Routers are thin (validation, error mapping). Services are pure functions that take a `Session` arg. Models are anemic SQLAlchemy 2.0 entities.
- **Auth**: `admin_required` dependency gates mutating endpoints (`/import/*`, `/track/create`). Dev mode (no `ADMIN_API_KEY` set) is open; prod requires the `X-Admin-Key` header.
- **Migrations**: `create_all` in dev (SQLite). Alembic in prod (`alembic upgrade head`). The baseline migration exists; new models need `alembic revision --autogenerate`.
- **Frontend**: Relay is the React/TypeScript application under `frontend/`; the legacy vanilla
  surface remains under `app/static/`. In the legacy surface, `window.LearnUtils` holds shared
  utils (`esc`, `fmtMoney`, `api`, `getProgress`), `window.LearnLabs` is the lab registry, and
  `window.PaymentViz` provides the animated chain and timeline visualizers.

## Testing

```bash
python -m pytest tests/ -q              # full suite (687 tests)
python -m pytest tests/test_api.py -v   # specific file
python -m pytest tests/ --cov=app       # coverage (~92%)

# Frontend unit/integration tests
cd frontend && npm test -- --run  # 961 tests (Vitest workers capped at 4)

# End-to-end tests
cd frontend && npm run test:e2e                    # chromium projects green; WebKit 'mobile' project needs WebKit installed
```

Tests use in-memory SQLite with `StaticPool`. Three fixture tiers in `conftest.py`:
- `db_session` — shared session for service-level tests
- `db_session_clean` — fresh DB per test for seed-data assertions
- `client` — session-scoped `TestClient` with its own isolated DB

## Linting

```bash
ruff check .        # E/F/I rules (real bugs). UP disabled (fights py39 target).
ruff check . --fix  # auto-fix import order etc.
```

## Development conventions

- **Python 3.9+** (uses `Optional[str]`, not `str | None`). Check syntax compat.
- **TDD**: write the failing test first, watch it fail, write minimal code to pass. No production code without a failing test.
- **One commit per item**: each fix/feature gets its own commit with a clear message.
- **Commit message format**: `type(scope): description (item-number)` — e.g. `fix(validation): reject negative amounts (1.3)`.
- **SSI account numbers** must always be `ACCT-` placeholders. Test `TestAllSSIAccountsArePlaceholders` enforces this. Never add real account numbers.
- **SIMULATION disclaimers** must appear on the API title, every payment-shaped response, and the UI banners. Don't remove them.
- **The `esc()` function** lives in `learn-utils.js`. Never copy it into a lab file — use `LearnUtils.esc` or `var esc = LearnUtils.esc`.

## Important files

- `IMPLEMENTATION_PLAN.md` — the full remediation plan (Tiers 0-3), with file:line citations, acceptance criteria, and sequencing rules. Track progress here.
- `ROADMAP.md` — the original product roadmap for the learning-lab curriculum (Phase 1-6).
- `ENGINEERING_ROADMAP.md` — the engineering health roadmap (post-review).
- `.github/workflows/ci.yml` — CI: pytest + ruff on Python 3.9-3.12.

## Known issues

- The frontend's default parallel Vitest run is load-sensitive for the preferred-tier Case Desk
  scenario; use `--no-file-parallelism` for the verified full suite.
- Every E2E skip is intentional and the total scales with the project count, so quote the rule
  rather than a number. The learner-state round trip skips in *every* project (the Learning backup
  panel is hidden); the reduced-motion case journey skips in every project *except*
  `case-reduced-motion`. A 6-project chromium run skips 11; a full 7-project run including the
  WebKit `mobile` project skips 13.
- `fed_importer.py` has no remote default URL — you must set `FEDWIRE_URL`/`FEDACH_URL` env vars to import Fedwire/FedACH data.
