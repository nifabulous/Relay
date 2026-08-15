# Make Payment Simulation Honest: Payment Pacing and Payment Schemes Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make prepared-payment tracking reveal a persisted, time-aware payment journey while keeping explicitly created admin/demo tracking instant, and replace the empty GBP-first Payment Schemes page with a source-cited, accessible catalogue covering the ten supported currencies plus International / SWIFT.

**Architecture:** Keep the existing synchronous FastAPI/SQLAlchemy and React/TanStack Query architecture. Store the complete simulated event plan in `payment_events`; add schedule mode and a reveal override so the API can expose only events that are due or manually advanced. Keep payment-scheme facts in the backend data catalogue, expose the international rail through the same API family, and render the catalogue through small accessible tab/detail components instead of adding more conditional logic to `ExplorePage.tsx`.

**Tech Stack:** FastAPI, SQLAlchemy, Alembic, pytest, Ruff, React, TypeScript, TanStack Query, Zod, Vitest, React Testing Library, MSW, Vite.

## Global Constraints

- Preserve the current public contract for `POST /api/track/create`: admin-created/demo timelines remain instant and return a terminal result in the existing endpoint response.
- Prepared payments are the only scheduled flow. `app/services/prepare.py` must pass an explicit scheduled mode; do not change the prepare-payment response shape or remove its existing Track payment link.
- Persist the full planned event chain. Do not keep future events only in Python memory and do not delete a local database to “migrate” it.
- Do not add websockets, background workers, cron jobs, or a new queue. Time-based visibility is computed at read time; manual controls update persisted reveal metadata.
- Keep the existing 30–90 second simulated timing model and fee calculations unchanged. This work changes visibility and presentation, not fee math, routing recommendations, or settlement behavior.
- `skip` advances one persisted event, not an entire correspondent hop. Label it “Advance one event” in the UI so the control matches the event model. `complete` reveals all remaining events.
- `skip` and `complete` are safe to repeat. If the payment is already terminal, return the current `TrackPaymentResponse` unchanged. Unknown UETRs return 404. Do not add an ad-hoc `detail` field to the response schema.
- Preserve existing legacy learner consumers of `/api/schemes`; new fields must be additive and optional to old clients.
- Every displayed payment rail must have a primary operator/source reference and a `verifiedAsof` value. Record official operator/regulator URLs during implementation; do not use aggregator or unsourced prose for limits, timing, protections, or roadmap claims.
- Preserve unrelated working-tree edits. Only touch files listed in the relevant task plus the new plan itself; never reset, clean, or overwrite the user’s existing changes.
- Use TDD: add a failing focused test before each behavior change, then implement the smallest change that makes it pass.

---

## Phase 0: Lock the contracts and source-backed data shape

### Task 0.1: Create the implementation fixtures and acceptance matrix first

**Files:**
- Modify `tests/test_tracking.py`
- Modify `tests/test_prepare.py`
- Modify `tests/test_schemes.py`
- Modify `frontend/src/features/operate/tracking/TrackingPage.test.tsx`
- Modify `frontend/src/features/explore/ExplorePage.test.tsx`
- Add `frontend/src/features/explore/schemeFixtures.ts`

- [ ] Add tests for the scheduled/instant distinction, time injection, persisted pending rows, one-event advancement, completion, idempotent terminal controls, and restart-safe visibility. Use fixed UTC datetimes; never sleep in tests.
- [ ] Add scheme contract tests for `family`, `variants`, `sources`, `verifiedAsof`, rich detail fields, NGN RTGS, KES bank transfer, and the international response.
- [ ] Add frontend fixtures containing one enriched USD rail, one Interac parent with three variants, and one SWIFT gpi response so UI tests do not duplicate large inline JSON.
- [ ] Add an acceptance matrix in test names/comments mapping each requirement to a test. This is the checklist used during implementation and review.

**Verification:** Run the focused backend and frontend tests once. They should fail for the new behaviors, while the existing suite remains otherwise runnable.

### Task 0.2: Define the additive API schemas before wiring UI

**Files:**
- Modify `app/schemas.py`
- Modify `frontend/src/api/schemas.ts`
- Modify `frontend/src/api/queryKeys.ts`
- Modify `frontend/src/api/schemas.test.ts`

- [ ] Add a backend source-reference shape and an international-scheme response shape. Keep the existing `/api/schemes?currency=...` response fields intact.
- [ ] Add Zod schemas/types for `SchemeSource`, `SchemeVariant`, enriched `SchemeInfo`, and `InternationalSchemesResponse`.
- [ ] Add a query-key factory for the international catalogue and retain the existing parameterized currency key.
- [ ] Make the new frontend fields tolerant of older fixtures, but make the production backend data and backend tests require them for all newly displayed rails.

**Verification:** Add schema parsing tests for a legacy minimal scheme, an enriched scheme, an Interac variant list, and the SWIFT response. Run the schema-focused Vitest file.

---

## Phase 1: Add restart-safe payment-event scheduling

### Task 1.1: Add the model fields and non-destructive migrations

**Files:**
- Modify `app/models.py` (`PaymentEvent`)
- Add `alembic/versions/20260813_add_payment_event_schedule.py`
- Add `app/services/schema_compat.py`
- Modify `app/main.py`
- Add `tests/test_schema_compat.py`

- [ ] Add `PaymentEvent.schedule`, a non-null string with allowed values `instant` and `scheduled`, defaulting to `instant` for backward compatibility.
- [ ] Add nullable `PaymentEvent.revealed_at`, storing an ISO UTC timestamp only when a scheduled event is manually exposed. Keep `timestamp` as the planned event time shown to learners.
- [ ] Write the Alembic upgrade to add both columns, backfill existing rows as `instant`, and preserve all event rows. Write a downgrade using Alembic’s SQLite-safe batch operation.
- [ ] Add `ensure_sqlite_schema(engine)` for the existing zero-setup development path: inspect `payment_events`, add only missing columns with `ALTER TABLE`, and never drop or rewrite data. New databases should still be created by `Base.metadata.create_all`.
- [ ] Call the compatibility helper immediately after development `create_all` in `app/main.py`; production continues to use `alembic upgrade head`.
- [ ] Test a legacy SQLite `payment_events` table containing an event, run the compatibility helper, and assert that the row survives and receives `schedule="instant"` semantics. Test that a current schema is a no-op.

**Verification:** Run `pytest -q tests/test_schema_compat.py`; run `alembic upgrade head` against a temporary SQLite database and inspect the resulting columns. Run `ruff check app tests`.

### Task 1.2: Refactor timeline visibility around an injectable clock

**Files:**
- Modify `app/services/tracking.py`
- Modify `tests/test_tracking.py`

- [ ] Preserve the current `generate_timeline(...)` default as `schedule="instant"` so direct service callers and existing demo tests remain unchanged.
- [ ] Add an explicit `schedule` argument and persist it on every generated row. For scheduled timelines, persist the entire planned chain and set only the initial event’s `revealed_at` when needed; do not omit future rows.
- [ ] Add a UTC-normalizing helper that parses the stored ISO timestamps and a visibility predicate: an event is visible when it is instant, its planned timestamp is at or before `now`, or `revealed_at` is set.
- [ ] Add `get_visible_timeline(session, uetr, now=None)` and keep `get_timeline` available for full-plan/internal assertions. `get_payment_status(..., now=None)` must use only visible events and must never leak future statuses.
- [ ] Compute current status, event count, last updated, final amount, and fees from visible events. A scheduled payment with only `INITIATED` visible must be non-terminal and must not show a final amount or total fees.
- [ ] Make `get_payment_status` accept an injected `now` for deterministic tests; production defaults to current UTC.

**Verification:** Tests prove that an instant timeline is fully visible, a scheduled timeline initially exposes only `INITIATED`, due timestamps become visible without mutation, and hidden rows survive a new SQLAlchemy session.

### Task 1.3: Add service-level advancement operations

**Files:**
- Modify `app/services/tracking.py`
- Modify `tests/test_tracking.py`

- [ ] Add `advance_payment(session, uetr, now=None)` that finds the first hidden event in planned order, sets `revealed_at` to `now`, commits, and returns the visible status. If no hidden event remains, return the current status without changing rows.
- [ ] Add `complete_payment(session, uetr, now=None)` that sets `revealed_at` on all remaining hidden events, commits once, and returns the visible status.
- [ ] Make both operations no-ops for instant timelines and already-terminal payments.
- [ ] Cover a scheduled credited path and a scheduled rejected path. Confirm that advancing reveals exactly one event, completion reveals the terminal event, and repeating either operation does not duplicate rows or change the planned timestamps.

**Verification:** Run the tracking service tests and inspect row counts before/after each operation.

### Task 1.4: Wire prepare and tracking HTTP endpoints

**Files:**
- Modify `app/services/prepare.py`
- Modify `app/routers/tracking.py`
- Modify `tests/test_prepare.py`
- Modify `tests/test_tracking.py`

- [ ] Pass `schedule="scheduled"` from the prepare-payment timeline call.
- [ ] Pass `schedule="instant"` explicitly from admin `POST /api/track/create`; preserve idempotency replay behavior.
- [ ] Add public `POST /api/track/{uetr}/skip` and `POST /api/track/{uetr}/complete` routes that call the service operations and return the existing `TrackPaymentResponse` through `_build_track_response`.
- [ ] Use the same 404 behavior as GET for unknown UETRs and keep controls unauthenticated because the tracking link is already learner-facing. Do not expose full hidden plans through any route.
- [ ] Update endpoint docstrings to describe scheduled visibility and the distinction between instant admin/demo creation and prepared payments.
- [ ] Add endpoint tests: prepared payment starts at `INITIATED`, GET advances automatically when a fixed clock is past a planned timestamp, skip reveals one event, complete reveals terminal state, instant create remains terminal, unknown UETR returns 404, and repeated controls are idempotent.

**Verification:** Run `pytest -q tests/test_tracking.py tests/test_prepare.py tests/test_schema_compat.py`; run the full backend suite before moving to frontend work.

---

## Phase 2: Expand and source the payment-scheme catalogue

### Task 2.1: Add backend data validation and official source metadata

**Files:**
- Modify `app/data/payment_schemes.py`
- Modify `tests/test_schemes.py`

- [ ] Add a uniform `sources` list to every displayed rail, with `label` and canonical official `url`, and keep a currency-level `verifiedAsof` value.
- [ ] Add `family` and `variants` only where a rail has meaningful sub-products; use the exact Interac variants `Auto-Deposit`, `Request Money`, and `Standard security-question claim` under the `Interac e-Transfer` family. Keep variants descriptive rather than pretending they are separate settlement rails.
- [ ] Add `CBN RTGS` to NGN with its own operator, timing, limits, settlement, protections, reversibility, roadmap, and source references.
- [ ] Add a KES bank-transfer rail distinct from the existing EFT entry, with wording that explains the difference between bank credit transfer and batch EFT.
- [ ] Enrich at least one major rail for each of USD, AUD, JPY, AED, INR, NGN, and KES with `howItWorks`, `limits`, `processingWindows` where applicable, `settlement`, `reversible`, `protections`, `roadmap`, and `sources`. Fill the same fields for GBP, CAD, and EUR rails that are already enriched.
- [ ] Use only claims verified against primary operator/regulator sources at implementation time. Record the verification month, and make uncertain bank-set limits explicit instead of presenting a universal number.
- [ ] Add data tests that every supported currency has at least one rail, every rail has required summary fields and a source, every currency has `verifiedAsof`, NGN contains RTGS, KES contains both EFT and the distinct bank-transfer rail, and Interac variants are present.

**Verification:** Run `pytest -q tests/test_schemes.py`; manually inspect the JSON for each of the ten currencies and the source links before frontend integration.

### Task 2.2: Add the International / SWIFT catalogue endpoint

**Files:**
- Modify `app/data/payment_schemes.py`
- Modify `app/routers/schemes.py`
- Modify `app/schemas.py`
- Modify `tests/test_schemes.py`

- [ ] Add one `INTERNATIONAL_SCHEMES` response describing `SWIFT gpi`: same-day to 1–3 business days depending on corridor/cut-off, bank/correspondent-set fees and limits, correspondent routing, UETR tracking, MT103/pacs.008 references, and finality/reversibility caveats.
- [ ] Include a roadmap note about CBPR+ and the MT103 retirement direction, explicitly marked as a roadmap rather than a current behavior.
- [ ] Add `GET /api/schemes/international`; keep `/api/schemes` list and per-currency behavior unchanged.
- [ ] Add a backend response model or typed validation boundary for the new response so malformed international data cannot silently reach the UI.
- [ ] Test 200 response shape, required SWIFT gpi facts, source references, and that the existing list endpoint still returns exactly the ten domestic currencies.

**Verification:** Run `pytest -q tests/test_schemes.py`; run a FastAPI OpenAPI generation smoke test to ensure the new route is documented.

---

## Phase 3: Redesign the Payment Schemes frontend

### Task 3.1: Build the accessible catalogue primitives

**Files:**
- Add `frontend/src/features/explore/schemeCatalog.ts`
- Add `frontend/src/features/explore/SchemeTabs.tsx`
- Add `frontend/src/features/explore/SchemeDetails.tsx`
- Add `frontend/src/features/explore/SchemeTable.tsx`
- Add `frontend/src/features/explore/SchemeDetails.css`
- Modify `frontend/src/features/explore/ExplorePage.test.tsx`

- [ ] Define the display order as `USD`, `GBP`, `EUR`, `CAD`, `NGN`, `KES`, `INR`, `AUD`, `JPY`, `AED`, followed by `International / SWIFT`; keep API currency lookup codes separate from labels.
- [ ] Implement `SchemeTabs` with `role="tablist"`, `role="tab"`, `aria-selected`, `aria-controls`, `role="tabpanel"`, roving focus, ArrowLeft/ArrowRight, Home/End, and Enter/Space activation. Keep the active tab in state and default it to USD.
- [ ] Implement the summary table/card component with a responsive layout that keeps Rail, Speed, Limit, Cost, Use case, and Operator readable on narrow screens.
- [ ] Implement detail sections for how it works, limits/timing, settlement, protections/reversibility, roadmap, and sources. Hide sections only when their data is absent; do not render empty headings.
- [ ] Render family/variant information under the parent rail without implying that Interac variants are separate settlement rails.
- [ ] Add component tests for default USD selection, keyboard traversal, ARIA linkage, responsive-safe semantic structure, enriched detail rendering, variant rendering, and source links.

**Verification:** Run the new component tests with `cd frontend && npm test -- --run src/features/explore/ExplorePage.test.tsx`.

### Task 3.2: Replace the empty GBP-first page and add SWIFT loading

**Files:**
- Modify `frontend/src/features/explore/ExplorePage.tsx`
- Modify `frontend/src/api/schemas.ts`
- Modify `frontend/src/api/queryKeys.ts`
- Modify `frontend/src/test/handlers.ts`
- Modify `frontend/src/features/explore/ExplorePage.test.tsx`

- [ ] Remove the null initial state and render USD immediately on first load. The page should not show an empty screen waiting for a pill click.
- [ ] Replace the current `aria-pressed` pill group with `SchemeTabs`; preserve loading, empty, retryable error, and no-data states through `AsyncRegion`.
- [ ] Use the international query only when the SWIFT tab is active and render it through the same detail component with an explicit “International / SWIFT” scope label.
- [ ] Extend MSW handlers with enriched scheme and international fixtures while retaining legacy defaults used by learner tests.
- [ ] Add tests for default USD fetch, switching currencies without stale content, SWIFT fetch/render, retry behavior, and the existing `/app/explore/schemes` route.

**Verification:** Run the Explore tests plus all learner tests that consume `/api/schemes` to prove additive compatibility.

---

## Phase 4: Make scheduled tracking visible and controllable in Relay

### Task 4.1: Add polling and mutation behavior to TrackingPage

**Files:**
- Modify `frontend/src/features/operate/tracking/TrackingPage.tsx`
- Modify `frontend/src/features/operate/tracking/TrackingPage.test.tsx`
- Modify `frontend/src/features/operate/tracking/TrackingPage.css`

- [ ] Configure the existing track query to refetch every 4.5 seconds only while data is non-terminal; stop polling once `is_terminal` is true and do not poll when no UETR is submitted.
- [ ] Add `Advance one event` and `Complete simulation` buttons when the current response is non-terminal. Use `apiPost` with `TrackPaymentResponseSchema`, invalidate/refetch the current UETR query after success, and disable buttons while the mutation is pending.
- [ ] Add a small live status message for mutation success/error and preserve the simulation disclaimer. Do not put mutation details into the backend response contract.
- [ ] Keep the existing UETR URL synchronization and manual lookup behavior intact.
- [ ] Add tests that a non-terminal response polls, terminal data stops polling, skip posts to the correct UETR and refreshes the timeline, complete posts to the correct endpoint, controls disappear after terminal state, and mutation errors are visible with retry-safe state.

**Verification:** Run `cd frontend && npm test -- --run src/features/operate/tracking/TrackingPage.test.tsx src/features/operate/tracking/PaymentTimeline.test.tsx`.

### Task 4.2: Update timeline language and preserve all existing consumers

**Files:**
- Modify `frontend/src/features/operate/tracking/PaymentTimeline.tsx` only if the scheduled state needs new copy/layout
- Modify `frontend/src/features/operate/tracking/PaymentTimeline.test.tsx`
- Modify `frontend/src/features/learn/labs/Lab6Content.test.tsx`
- Modify `frontend/src/features/learn/labs/CapstoneContent.test.tsx`
- Modify `frontend/src/features/learn/labs/ExceptionsReturnsContent.test.tsx`

- [ ] Keep the existing uppercase status normalization and rejection presentation. Scheduled `INITIATED`, `ACCEPTED`, `IN_PROGRESS`, and `FORWARDED` statuses must continue to map to the current visual language.
- [ ] If copy is added, describe the result as a simulation and distinguish “still scheduled” from “failed”; do not label every non-terminal state as an error.
- [ ] Test the shared component with partial timelines and confirm Lab 6, Capstone, and exception/return lessons still render without controls that are not supplied by their parent.

**Verification:** Run all tracking/timeline and learner tests.

---

## Phase 5: Documentation, full verification, and handoff

### Task 5.1: Update project documentation and API examples

**Files:**
- Modify `README.md`
- Modify `docs/PROJECT_OVERVIEW.md` only where the API behavior is documented
- Add or update API examples near the tracking/schemes documentation location used by the repository

- [ ] Document that prepared payments reveal `INITIATED` first, become visible as planned timestamps arrive, and support manual advance/complete controls.
- [ ] Document that `POST /api/track/create` remains an instant admin/demo path.
- [ ] Document the ten domestic scheme currencies and the International / SWIFT endpoint, including the educational-data/source disclaimer.
- [ ] Replace stale test counts only after running the final commands; do not copy expected counts from the pasted proposal.

### Task 5.2: Run the complete verification matrix

- [ ] Backend: `source .venv/bin/activate && pytest -q`.
- [ ] Backend lint: `source .venv/bin/activate && ruff check app tests`.
- [ ] Migration smoke test: run `alembic upgrade head` against a temporary SQLite database, then run the compatibility test against an old-schema database containing a payment event.
- [ ] Frontend unit/integration: `cd frontend && npm test -- --run`.
- [ ] Frontend typecheck/build: `cd frontend && npm run build`.
- [ ] Frontend bundle budget: `cd frontend && npm run check:bundle`.
- [ ] E2E smoke coverage: `cd frontend && npm run test:e2e` if the repository’s browser dependencies are available; otherwise record the exact environment blocker rather than claiming E2E coverage.
- [ ] Review `git diff --check`, inspect the migration diff, and confirm no database deletion or unrelated working-tree changes occurred.

### Task 5.3: Final acceptance review

- [ ] Start a prepared payment and confirm the first tracking response contains only the visible initial event, not future banks or terminal amounts.
- [ ] Advance one event, reload the tracking page, and confirm the revealed event survives the reload.
- [ ] Complete the simulation and confirm polling stops at the terminal status.
- [ ] Create an admin/demo tracked payment and confirm it still returns the complete terminal timeline immediately.
- [ ] Open Payment Schemes and confirm USD is selected by default, all domestic tabs are keyboard reachable, International / SWIFT is last, and enriched/source sections render.
- [ ] Confirm NGN RTGS, KES bank transfer, and Interac variants are visible and clearly distinguished from neighboring rails.
- [ ] Confirm all existing learner scheme/tracking consumers pass unchanged.

## Definition of Done

- Prepared timelines are persisted in full but reveal only due or manually advanced events; the behavior is deterministic under test and survives process/session reloads.
- Admin/demo tracking remains instant and idempotent.
- Skip/complete endpoints are documented, tested, safe to repeat, and do not expose hidden events.
- All ten domestic currencies and International / SWIFT are available from an accessible default-selected tab interface.
- Displayed scheme claims have official source references and verification dates; NGN RTGS, KES bank transfer, and Interac variants are represented accurately as distinct concepts.
- Backend tests, Ruff, frontend tests, TypeScript/build, bundle budget, migration smoke test, and available E2E checks pass.
- No unrelated user changes are reverted or folded into the implementation.
