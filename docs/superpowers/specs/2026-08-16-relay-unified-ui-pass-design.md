# Relay unified UI pass

Date: 2026-08-16
Branch: `codex/ui-changes`
Status: Approved direction; implementation pending written-spec review

## Problem

Relay has a strong visual foundation, but the experience currently behaves like a set of individually improved screens rather than one coherent learning and payment-exploration workspace.

The most important friction is structural:

- The first-time homepage action leads to a generic Explore screen instead of a payment walkthrough.
- The global Explore search claims to search banks but only searches a static client-side index.
- Bank Directory only accepts a BIC and cannot browse by country or bank name.
- Payment Schemes renders a summary table and every rail's full detail in one long page.
- The glossary is too small for the concepts already present elsewhere in the product.
- The tutor exists in the backend but has no visible product entry point.
- Mobile layouts expose clipped horizontal content and dense long-form surfaces.
- Prepare Payment presents many currencies without making supported rails and limitations clear.
- The local SQLite database can be behind the current SSI model, causing bank detail and health failures.

The pass should improve the whole journey without replacing Relay's visual language or turning the product into a generic dashboard.

## Goals

1. Make the next action obvious for first-time and returning learners.
2. Give every shared navigation and search affordance an honest, working destination.
3. Make dense payment data progressively discoverable instead of rendering everything at once.
4. Make mobile layouts readable and operable without hidden horizontal content.
5. Make empty, loading, unavailable, and degraded-data states explicit and recoverable.
6. Preserve the existing Relay design system: dark canvas, quiet surfaces, blue action color, structural borders, restrained typography, and payment-route visuals.
7. Repair the local SSI schema mismatch non-destructively and add regression coverage so the UI is not built on a broken data path.

## Non-goals

- Rebrand Relay or replace the existing typography, palette, icon language, or shell model.
- Build a production payment execution flow; Relay remains an educational simulation.
- Add a live external bank-data provider or claim that illustrative bank data is production-grade.
- Add a second navigation taxonomy beyond Overview, Learn, Explore, and Operate.
- Build a full conversational tutor experience if the configured tutor backend is unavailable; the UI must still explain that state clearly.
- Refactor unrelated Sentry, admin, or legacy learning surfaces unless a change is required to support this pass.

## Experience model

### 1. Shared shell

The desktop top bar becomes a compact workspace header:

- Relay identity and simulation banner remain persistent.
- A global search trigger is available from every route and supports `⌘K`/`Ctrl+K`.
- An Ask tutor control is visible when the tutor is available and remains discoverable with an unavailable state when it is not.
- Preferences remains the entry point for appearance, motion, navigation density, and settings.

On mobile, the top bar keeps the Relay identity and exposes the same search and tutor actions without displacing the bottom navigation. The primary navigation remains the existing four workspaces.

The global search is a command surface, not a second page-specific search implementation. It groups results into Banks, Glossary, Lessons, Payment schemes, and Tools. It must support keyboard navigation, an explicit empty state, loading/error states for bank search, and deep links to the selected result.

### 2. Overview / homepage

The homepage keeps one dominant action and removes the first-visit dead end.

First visit:

- Eyebrow: `START HERE`
- Title: `Explore how a payment moves`
- Supporting copy explains that the learner will follow one illustrative payment across the route.
- A small route preview uses the existing `PaymentRoute` component.
- Primary action opens a real three-step walkthrough, not a generic Explore search page.
- Secondary actions are a simple list: Find a bank, Compare a payment rail, Prepare a simulated payment.
- Progress is compact and secondary; recent activity is hidden until it contains meaningful activity.

Returning visit:

- The primary action resumes the most recently unfinished case, lesson, or payment workflow when one exists.
- The same secondary actions remain available without equal-weight card tiles.
- Progress, review due, badges, and activity remain available below the dominant task.

The walkthrough may initially be a focused route/story state built from existing route primitives. It must have a clear start, step indicator, explanation of the active hop, and a next action back to the relevant learning or exploration surface.

### 3. Explore and discovery

Explore remains the search-first workspace, but its search contract becomes accurate.

The frontend static index continues to cover glossary terms, lessons, schemes, and tools. Bank results are fetched through a dedicated read-only directory search endpoint supporting:

- partial bank name
- partial BIC
- country code or country name
- deterministic result ordering
- a bounded result set

The UI shows the source/type of each result and avoids mixing bank records with glossary hits that merely mention the word “bank.” Selecting a bank opens its detail route and preserves the search context when the user returns.

### 4. Bank Directory

Bank Directory becomes a browse-and-search surface with two complementary entry modes:

- Country selector/filter first, followed by a bank list.
- Search by bank name or BIC for users who already know what they need.

The result list uses compact selectable rows with bank name, BIC, country, and city. The existing bank detail view remains the destination for identity, settlement instructions, provenance, and the Prepare Payment action.

SSI loading and failure are shown as a scoped state inside the bank result, never as if the bank itself was not found. If the data is illustrative or unverified, the provenance treatment stays visible at the point of use.

### 5. Payment Schemes

Payment Schemes becomes a two-level selection model:

- First level: currency/market tabs remain horizontally scrollable and keyboard accessible.
- Second level: rail selector for the active market, using compact buttons or a selectable list.
- Main content: one rail's summary and details at a time.

The summary comparison remains available as a compact “Compare rails” section, but it no longer precedes every full detail article on the same page. The selected rail detail includes speed, limits, cost, use case, operator, how it works, settlement, protections, roadmap, and sources, with sections collapsed or progressively revealed where the content is long.

On mobile, the comparison table uses readable labelled cards with a short caption and a visible “Choose a rail to see details” cue. Horizontal tab scrolling remains intentional and must have enough affordance to signal additional markets.

### 6. Glossary

The glossary keeps grouped sections and live filtering, but the index is expanded to cover the rails and terms already exposed by the app. The initial additions include Interac e-Transfer, Auto-Deposit, Request Money, NIBSS Instant Pay, NUBAN, KEPSS, PesaLink, FedNow, Faster Payments, BACS, and related identifiers where the product already has scheme or lesson content.

Definitions remain concise and educational, with source/provenance treatment where a term describes a current operator rule rather than a stable concept. Search must match both term and definition and preserve a useful zero-result recovery action.

### 7. Tutor

Add a shared tutor launcher and a lightweight tutor panel. The panel supports:

- a clear current-context label
- a question input
- loading, answer, unavailable, rate-limited, and error states
- a link to continue the current lesson or page after the answer

The launcher queries `/api/tutor/availability` and does not imply that a disabled tutor is a frontend failure. When unavailable, the control opens an explanatory state with the next best action: continue the lesson, search the glossary, or use the relevant page guidance.

### 8. Learn and responsive behavior

The Learn landing page keeps case-first prioritization but replaces the partially clipped mobile carousel with a clearer browsing pattern. The first case remains prominent; additional cases are accessible through a visible continuation control or a stacked mobile list. Desktop may retain a horizontal track if the affordance and focus behavior are clear.

All route-level lazy loading uses a shared page loading state rather than `fallback={null}`. Loading states reserve meaningful space and communicate the destination being loaded.

Inputs and forms use short, readable placeholder examples and rely on visible labels/helper copy for important constraints. Prepare Payment gets a scope note that separates:

- supported currency entry validation
- available domestic scheme catalogue coverage
- International / SWIFT educational routing
- bank-specific SSI availability

The currency list remains broad where the backend accepts ISO codes, but the UI must not imply that every currency has a domestic rail catalogue or bank-published SSI.

### 9. Data health and routing reliability

The local SQLite compatibility layer must add missing SSI columns (`as_of`, `status`, `verified_by`) in a non-destructive, idempotent way, or the development database must be upgraded with the existing migration path after verifying its baseline. Health and seed failures must not be silently hidden from the relevant UI.

The `/app` and `/app/` entry paths should resolve consistently for direct navigation and refresh. Deep links must continue to serve the SPA entry point.

## Component boundaries

- `AppShell`: shared header actions, search launcher, tutor launcher, and route-level loading boundary.
- `CommandSearch` / new search services: shared command UI and grouped result contract.
- `BankDirectoryPage` plus a small bank search result component: browse, filter, and selection states.
- `SchemeTabs` plus a new rail selector/detail composition: market selection and progressive rail details.
- `OverviewPage` plus a focused walkthrough route/state: first-time and return-task orchestration.
- `GlossaryPage`: expanded term data and filtering only; no duplicated search logic.
- `TutorPanel`: availability, chat states, and context handoff.
- `AsyncRegion` and a shared page loader: consistent async states across routes.
- `schema_compat.py` / Alembic migration coverage: local SSI schema repair and regression tests.

These boundaries keep data fetching separate from presentation and avoid adding page-specific versions of global search, loading, or tutor controls.

## Data flow and error handling

1. Shell-level search opens locally with static results immediately and requests bank matches only when the query is eligible.
2. Bank search responses are schema-validated and capped; invalid or unavailable results show a recoverable search state.
3. Bank detail loads bank identity and SSI independently. A failed SSI request preserves the bank identity and offers a scoped retry.
4. Schemes query only the active market and render only the selected rail detail. Switching markets clears the previous selected rail until the new data arrives.
5. Tutor availability is a cheap read. Chat errors are presented as tutor-specific states and never replace the page content.
6. Health failures do not make the homepage blank. The overview may omit status counts when unavailable, while the relevant data surface explains the degraded state.
7. All mutations and existing educational simulation disclaimers remain unchanged.

## Accessibility requirements

- Preserve semantic headings and landmarks.
- Keep tabs keyboard navigable with correct `aria-selected`, `aria-controls`, and focus management.
- Make search results a labelled listbox/menu with active descendant or roving focus, Escape close, and return focus to the trigger.
- Keep all form fields visibly labelled and associate inline errors with `aria-describedby`.
- Provide non-color state cues for active, error, unavailable, and selected states.
- Ensure mobile horizontal regions either become stacked content or expose a clear continuation affordance.
- Respect reduced-motion preferences in the tutor panel, page loader, and route transitions.
- Do not claim full WCAG compliance from visual inspection; automated and keyboard checks remain part of implementation verification.

## Verification plan

Before handoff:

- Add focused unit/component tests for homepage first visit and resume behavior, grouped search, bank search states, scheme selection, glossary additions, tutor availability, and the page loader.
- Add backend tests for bank directory search and idempotent SSI schema compatibility.
- Run the full frontend test suite and backend test suite.
- Verify `/api/health`, `/api/lookup`, and `/api/ssi` against the repaired local database.
- Test direct navigation to `/app`, `/app/`, `/app/explore`, `/app/explore/banks`, and `/app/explore/schemes`.
- Perform live browser checks at the existing mobile viewport and a desktop viewport, including keyboard navigation for search and schemes.
- Confirm no horizontal page overflow and inspect intentional scroll regions for focus/continuation affordances.
- Verify the browser returns to `/app/explore/schemes` after QA with temporary viewport overrides removed.

## Rollout order

1. Repair SSI schema compatibility and add loading/error foundations.
2. Add shared shell search/tutor controls and the real search contracts.
3. Rework homepage first-time/resume action and walkthrough entry.
4. Rework Bank Directory and glossary data/search.
5. Rework Payment Schemes progressive disclosure.
6. Tighten Learn and Prepare Payment responsive/scope guidance.
7. Run full verification and perform a final visual review.

