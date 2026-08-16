# CLAUDE.md — Relay Educational Payment Simulation

> Guidance for AI coding agents working on this codebase.

## What this project is

An **educational payment simulation** for learning how cross-border payments work. Two halves:

1. **FastAPI backend** (`app/`) — validates IBAN/BIC, looks up banks, suggests correspondent intermediaries, simulates VoP / fees / sanctions / tracking / MT103 STP. 27 API endpoints under `/api/*`.
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
  tutor/            AI tutor — OFF by default, no AI dependency in the base install
  data/tutor_*.py   concept cards, lesson cards, and the citable source catalogue
```

### AI tutor (`app/tutor/`)

Disabled by default; `/api/tutor/chat` answers 503 until `TUTOR_ENABLED`,
`TUTOR_MODEL`, and the provider key are all set. Spec:
`docs/superpowers/specs/2026-08-13-relay-ai-tutor.md`.

Rules that are easy to break by accident:

- **Provider types are named in `engine.py` only, imported lazily inside a
  function.** A test greps the whole `app/` package for `pydantic_ai`. An eager
  or stray import takes down every route in the base install, tutor or not.
- **Redaction is unconditional and runs at the provider boundary, never before
  retrieval.** Retrieval keys on the identifiers redaction removes.
- **Grounding is enforced, not requested.** A citation must name a document
  retrieved *for that turn* and quote it verbatim. An uncited factual answer is
  replaced, not flagged.
- **The tool registry is three reads.** Adding a fourth method widens what the
  model can reach; a test pins the set.
- **`turn_id` must stay lowercase** — the frontend analytics allowlist rejects
  uppercase, so feedback would vanish silently rather than error.
- **One question fixture** (`tests/tutor/retrieval_questions.json`) serves the
  retrieval benchmark, the golden set, and the live evaluator. Refusal items are
  excluded from retrieval grading — they never reach retrieval.

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
python -m pytest tests/ -q              # full backend suite
python -m pytest tests/test_api.py -v   # specific file
python -m pytest tests/ --cov=app       # coverage (~92%)

# Frontend unit/integration tests
cd frontend && npm test -- --run --no-file-parallelism  # full frontend suite

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

- **Python 3.10+** (floor raised from 3.9 on 2026-08-14 so the AI stack can install;
  `pydantic-ai`, `openai>=3`, `langfuse`, `presidio` and `pgvector` all require 3.10+).
  Existing code still uses `Optional[str]` / `List[str]`; ruff's UP rules stay off so
  there is no mass rewrite. New code may use `X | None` freely.
- **TDD**: write the failing test first, watch it fail, write minimal code to pass. No production code without a failing test.
- **One commit per item**: each fix/feature gets its own commit with a clear message.
- **Commit message format**: `type(scope): description (item-number)` — e.g. `fix(validation): reject negative amounts (1.3)`.
- **SSI account numbers** must always be `ACCT-` placeholders. Test `TestAllSSIAccountsArePlaceholders` enforces this. Never add real account numbers.
- **SIMULATION disclaimers** must appear on the API title, every payment-shaped response, and the UI banners. Don't remove them.
- **The `esc()` function** lives in `learn-utils.js`. Never copy it into a lab file — use `LearnUtils.esc` or `var esc = LearnUtils.esc`.

## Agent reliability protocol

The agent's first implementation, local test run, and automated review are all
evidence—not proof. Before any commit or externally visible write, the agent
must complete these gates and report the actual commands/results:

1. **Lock the contract.** Write down the requested behavior, invariants,
   affected surfaces, failure modes, acceptance criteria, and explicit
   out-of-scope items. If any requirement is unclear, stop and ask instead of
   implementing a partial interpretation.
2. **Use TDD for behavior changes.** Add a focused regression test, confirm it
   fails for the old behavior when practical, implement the smallest fix, then
   run that test and the surrounding suite.
3. **Review the complete change, not just the last edit.** Inspect the full
   `origin/main...HEAD` diff, every changed file, affected callers/configuration,
   generated output, deployment settings, and data/privacy boundaries. Do not
   stop after finding the first issue.
4. **Run two separate review passes before commit.** First perform a
   correctness pass (happy path, error path, state transitions, compatibility,
   migrations). Then perform an adversarial pass (security, privacy, secrets,
   prompt injection, authorization, malformed input, retries, concurrency,
   dependency/runtime behavior, and misleading tests). The second pass must be
   done with the diff treated as if another engineer wrote it.
5. **Test the real boundary.** Do not let a mock replace the behavior under
   test. Fakes must enforce limits and record arguments; mocked plugins must be
   paired with a pinned-package or integration test; build/deploy tests must
   inspect final artifacts for source maps, credentials, and public references.
   Verify third-party APIs against installed types/runtime before changing code.
6. **Verify in layers.** Run focused tests, the full relevant suite, typecheck,
   lint, production build, bundle/artifact checks, and (when applicable) a
   browser/API smoke test. A test that was not run is not a passing check.
7. **Audit the final diff after tests.** Re-read the staged diff from top to
   bottom, check `git diff --check`, confirm only intended files are staged,
   inspect the commit's parent/base, and look for accidental generated files,
   secrets, broad rewrites, or one-line “fixes” that bypass the real path.
8. **Use exact evidence.** Never claim “fixed,” “all tests pass,” or “ready to
   merge” from memory or from an older head. Record the current commit SHA,
   commands, results, skipped checks, and remaining human verification.

The local gate for this protocol is `scripts/verify_before_push.sh origin/main`.
Pass the exact base ref or SHA for the change; the gate refuses to run if it
cannot resolve that base and checks the committed base-to-HEAD range in
addition to staged/unstaged changes. It is a convenience and a fail-closed
checklist, not authorization to push, merge, deploy, or change repository
settings. External writes still require the user's explicit direction.

## Maintainer pull request completion checklist

This is a human-operated checklist, not an instruction or authorization for
Codex, CI, hooks, or any other automation. It grants no permission to write to
Git, GitHub, deployments, or environments. Automated reviewers remain
read-only unless a human separately authorizes a specific write operation.

For every pushed change, the maintainer should:

1. Confirm the branch's PR is still open before pushing. If it is already
   merged or closed, branch from the latest `origin/main` and open a follow-up
   PR instead of pushing to the completed PR's branch.
2. After the push, inspect checks, review threads, inline comments, and
   top-level comments for the exact pushed head SHA. Do not treat an old green
   check or old review as current.
3. Resolve every actionable comment, add or update regression tests, and rerun
   relevant validation before the next push.
4. Repeat the inspection after each push until there are no unresolved
   actionable comments, all required checks pass on the exact head SHA, and the
   PR is mergeable.
5. Merge only after an explicit human decision, then verify that GitHub reports
   the PR as merged. Never bypass a required human or deployment approval.

Use thread-aware GitHub reads when review state matters. Preserve unrelated
working-tree changes and never stage secrets.

## Important files

- `IMPLEMENTATION_PLAN.md` — the full remediation plan (Tiers 0-3), with file:line citations, acceptance criteria, and sequencing rules. Track progress here.
- `ROADMAP.md` — the original product roadmap for the learning-lab curriculum (Phase 1-6).
- `ENGINEERING_ROADMAP.md` — the engineering health roadmap (post-review).
- `.github/workflows/ci.yml` — CI: pytest + ruff on Python 3.10-3.12.

## Known issues

- The frontend's default parallel Vitest run is load-sensitive for the preferred-tier Case Desk
  scenario; use `--no-file-parallelism` for the verified full suite.
- Every E2E skip is intentional and the total scales with the project count, so quote the rule
  rather than a number. The learner-state round trip runs in `desktop` and skips in the five case
  viewport projects because coverage is not viewport-dependent. The reduced-motion case journey
  skips in every project except `case-reduced-motion`. The six-project Chromium matrix therefore
  has 10 intentional skips; the generic `mobile` project requires the WebKit browser binary.
- `fed_importer.py` has no remote default URL — you must set `FEDWIRE_URL`/`FEDACH_URL` env vars to import Fedwire/FedACH data.
