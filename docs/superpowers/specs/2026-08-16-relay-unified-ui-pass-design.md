# Relay unified UI pass

Date: 2026-08-16
Branch: `codex/ui-changes`
Status: Reviewed direction; implementation pending final written-spec approval

## Superpowers design review summary

The initial specification scored **7/10**: it identified the right product problems and respected Relay's established visual language, but left route structure, responsive behavior, interaction states, and two backend contracts open to interpretation. This revision resolves those choices and raises the implementation-readiness score to **9/10**.

| Dimension | Initial | Reviewed | Resolution |
|---|---:|---:|---|
| Information architecture | 7 | 9 | Added the route hierarchy, shared-surface ownership, and URL state rules. |
| Interaction states | 6 | 9 | Added a required state matrix for every new or changed async surface. |
| User journey | 7 | 9 | Added first-visit, returning, lookup, and recovery storyboards. |
| Visual distinctiveness | 8 | 9 | Anchored the redesign to `PaymentRoute` and the anti-template constraints. |
| Design-system alignment | 8 | 9 | Mapped new surfaces to existing tokens, primitives, and shape rules. |
| Responsive and accessibility | 6 | 9 | Defined behavior at 390, 768, 1024, and 1440 acceptance widths. |
| Implementation readiness | 6 | 9 | Resolved API, persistence, routing, SSI, and verification decisions. |

## What already exists

This pass extends proven product foundations instead of rebuilding them:

- `AppShell` already owns the desktop rail, mobile bottom navigation, simulation banner, preferences entry, and route outlet.
- `PaymentRoute` already provides Relay's responsive route signature and reduced-motion behavior.
- `CommandSearch` already provides grouped static results for glossary terms, lessons, schemes, and tools.
- `OverviewPage` and `selectPrimaryAction` already contain most returning-user ranking inputs, including unfinished timestamps.
- `SchemeTabs`, `SchemeTable`, and `SchemeDetails` already contain the market and rail content that will be recomposed.
- The bank lookup, SSI, tutor availability, tutor answer, health, and learning APIs already exist.
- `AsyncRegion`, buttons, form controls, status chips, panels, mobile record lists, tokens, and typography are shared design-system primitives.
- Existing Alembic migrations describe the current SSI shape; `schema_compat.py` is the correct local-development compatibility hook.

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

## NOT in scope

- Rebrand Relay or replace the existing typography, palette, icon language, or shell model.
- Build a production payment execution flow; Relay remains an educational simulation.
- Add a live external bank-data provider or claim that illustrative bank data is production-grade.
- Add a second navigation taxonomy beyond Overview, Learn, Explore, and Operate.
- Build a full conversational tutor experience if the configured tutor backend is unavailable; the UI must still explain that state clearly.
- Refactor unrelated Sentry, admin, or legacy learning surfaces unless a change is required to support this pass.

## Screen hierarchy and route ownership

```text
/app/                         Overview and adaptive primary action
├── walkthrough              Three-step illustrative payment walkthrough
├── learn                    Learning catalogue and active work
│   └── :moduleId            Existing lesson/module route
├── explore                  Search-first discovery workspace
│   ├── banks                Country browse and bank-name/BIC search
│   │   └── :bic             Existing bank identity and SSI detail
│   ├── schemes              Market and rail selection
│   └── glossary             Terminology reference
├── operate                  Existing educational payment preparation
└── settings                 Existing preferences surface

Shared AppShell surfaces
├── Command search           Dialog at >=768px; full-width top sheet below 768px
└── Tutor                    Non-modal side panel at >=1024px; full-width top sheet below 1024px
```

`/app` and `/app/` must resolve to the same SPA route. Search and tutor are shell-owned overlays, not routes and not duplicated page implementations. Explore embeds the shared search engine in-page while the shell trigger presents the same result model in an overlay. The browser back button closes an open mobile top sheet before leaving the current page.

## Experience model

### 1. Shared shell

The desktop top bar becomes a compact workspace header:

- Relay identity and simulation banner remain persistent.
- A global search trigger is available from every route and supports `⌘K`/`Ctrl+K`.
- An Ask tutor control is visible when the tutor is available and remains discoverable with an unavailable state when it is not.
- Preferences remains the entry point for appearance, motion, navigation density, and settings.

On mobile, the top bar keeps the Relay identity and exposes the same search and tutor actions without displacing the bottom navigation. The primary navigation remains the existing four workspaces.

The global search is a command surface, not a second page-specific search implementation. It groups results into Banks, Glossary, Lessons, Payment schemes, and Tools. It must support keyboard navigation, an explicit empty state, loading/error states for bank search, and deep links to the selected result.

At 768px and wider, search opens as a focus-trapped dialog centered within the application work area. Below 768px it opens as a full-width top sheet above the bottom navigation, with the query field focused and a visible close action. The result model, result rendering, keyboard behavior, and query parsing are shared between this surface and Explore.

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

The walkthrough is the dedicated `/app/walkthrough` route built from existing route primitives. It uses one illustrative route and three steps: prepare the instruction, trace the institutions, and understand settlement. It has a visible `1 of 3` step indicator, explains the active hop, persists completion locally, and ends with actions to start the first relevant lesson or explore the demonstrated rail. It is never forced on returning users.

Returning-task ranking is deterministic: choose the newest unfinished payment, case, or lesson by its activity timestamp; if no unfinished work exists, choose the next incomplete module; if all modules are complete, offer the review queue. The existing `unfinishedLearnAt` and `unfinishedOperateAt` inputs must be wired into `OverviewPage` instead of being discarded.

### 3. Explore and discovery

Explore remains the search-first workspace, but its search contract becomes accurate.

The frontend static index continues to cover glossary terms, lessons, schemes, and tools. Bank results are fetched through a dedicated read-only directory search endpoint supporting:

- partial bank name
- partial BIC
- country code or country name
- deterministic result ordering
- a bounded result set

The endpoint contract is `GET /api/banks?q={name-or-bic}&country={ISO-3166-1-alpha-2}&limit=25&offset=0`. `q` and `country` are independently optional, at least one must be present, `limit` is capped at 50, and results sort by normalized bank name then BIC. The response includes `items`, `total`, `limit`, and `offset`; each item includes `bank_name`, `bic`, `country_code`, `country_name`, and `city`. The client starts a request after two non-space query characters, cancels stale requests, and never merges a stale response into a newer query.

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

The summary comparison remains available as a compact, collapsed-by-default “Compare rails” disclosure, but it no longer precedes every full detail article on the same page. The selected rail detail includes speed, limits, cost, use case, operator, how it works, settlement, and protections in the main reading flow. Roadmap and sources use native disclosures because they are secondary reference material; the core explanation is not hidden in nested accordions.

Market and rail selection are URL-addressable through `?market=USD&rail=FEDWIRE`. A valid URL selection wins on first render. Otherwise the first market and its first rail are selected. Switching market selects that market's first rail and replaces both query values; browser back/forward restores the prior selection and focus moves to the selected rail heading after an explicit rail choice.

On mobile, the comparison table uses readable labelled cards with a short caption and a visible “Choose a rail to see details” cue. Horizontal tab scrolling remains intentional and must have enough affordance to signal additional markets.

### 6. Glossary

The glossary keeps grouped sections and live filtering, but the index is expanded to cover the rails and terms already exposed by the app. The initial additions include Interac e-Transfer, Auto-Deposit, Request Money, NIBSS Instant Pay, NUBAN, KEPSS, PesaLink, FedNow, Faster Payments, BACS, and related identifiers where the product already has scheme or lesson content. `Interac` is an alias for `Interac e-Transfer`, so either query returns the term.

Definitions remain concise and educational, with source/provenance treatment where a term describes a current operator rule rather than a stable concept. Search must match both term and definition and preserve a useful zero-result recovery action.

### 7. Tutor

Add a shared tutor launcher and a lightweight tutor panel. The panel supports:

- a clear current-context label
- a question input
- loading, answer, unavailable, rate-limited, and error states
- a link to continue the current lesson or page after the answer

The launcher queries `/api/tutor/availability` and does not imply that a disabled tutor is a frontend failure. When unavailable, the control opens an explanatory state with the next best action: continue the lesson, search the glossary, or use the relevant page guidance.

The tutor trigger is always visible. It is never disabled or removed because availability is false. At 1024px and wider it opens a non-modal side panel that leaves the page readable; below 1024px it opens a focus-trapped top sheet. Closing restores focus to the trigger. The first availability check is cached for the session and can be retried from the unavailable state.

### 8. Learn and responsive behavior

The Learn landing page keeps case-first prioritization but replaces the partially clipped mobile carousel with a clearer browsing pattern. Below 768px cases are a stacked list in document order with no horizontal scrolling. At 768px and wider the current horizontal track may remain only if previous/next controls, an item count, keyboard scrolling, and visible focus are present; otherwise it also becomes a grid/list.

All route-level lazy loading uses a shared page loading state rather than `fallback={null}`. Loading states reserve meaningful space and communicate the destination being loaded.

Inputs and forms use short, readable placeholder examples and rely on visible labels/helper copy for important constraints. Prepare Payment gets a scope note that separates:

- supported currency entry validation
- available domestic scheme catalogue coverage
- International / SWIFT educational routing
- bank-specific SSI availability

The currency list remains broad where the backend accepts ISO codes, but the UI must not imply that every currency has a domestic rail catalogue or bank-published SSI.

### 9. Data health and routing reliability

The local SQLite compatibility layer in `app/services/schema_compat.py` must add missing SSI columns (`as_of`, `status`, `verified_by`) in a non-destructive, idempotent transaction and backfill safe defaults compatible with the current model. Production schema evolution continues to use the existing Alembic migrations; the compatibility hook is not a substitute for production migration history. Health and seed failures must not be silently hidden from the relevant UI.

The `/app` and `/app/` entry paths should resolve consistently for direct navigation and refresh. Deep links must continue to serve the SPA entry point.

## User journey storyboard

| Journey | Entry | Key moment | Recovery | Successful exit |
|---|---|---|---|---|
| First-time learner | Overview shows `START HERE` and one route preview. | The walkthrough reveals one payment hop at a time without asking for prior knowledge. | Leaving preserves the current step; returning offers Resume. | The learner opens the first lesson or the demonstrated rail. |
| Returning learner | Overview promotes the newest unfinished work. | Context and progress are visible before resuming. | If the saved destination no longer exists, explain that and offer the next incomplete module. | The learner continues at the correct route and position. |
| Bank researcher | Shell search or Bank Directory accepts a country, name, or BIC. | Results distinguish bank identity from glossary mentions. | Network failure preserves the query and offers Retry; SSI failure preserves bank identity. | The user opens bank detail or prepares an illustrative payment. |
| Rail comparison | Schemes restores market and rail from the URL. | One selected rail is readable; comparison is available on demand. | Invalid query values fall back to a valid default and replace the URL. | The user shares the URL or continues to related guidance. |
| Tutor unavailable | The always-visible tutor trigger opens normally. | The panel explains that tutoring is unavailable, without implying the page failed. | Retry availability, search terminology, or continue the current page. | The learner continues without a dead end. |

The emotional progression is deliberate: orient first, reveal complexity gradually, confirm what is known, and provide a safe next action. No state should leave the learner wondering whether the application, the data, or their input caused the problem.

## Interaction-state coverage

| Surface | Initial/loading | Empty | Error/degraded | Success | Focus and return behavior |
|---|---|---|---|---|---|
| Global/Explore search | Static groups immediately; bank group shows a compact skeleton after eligibility. | “No results” suggests a BIC, country, or glossary term. | Bank group alone shows Retry; static groups remain usable. | Grouped, typed results with count and destination. | Query focused on open; arrows move active result; Enter opens; Escape closes; trigger regains focus. |
| Bank Directory | Country list and result region reserve space. | Explain the active filters and offer Clear filters. | Preserve filters and show scoped Retry. | Selectable bank rows plus result count and pagination. | Filter changes announce the result count; opening and returning restores the prior query, filters, and row focus. |
| Bank detail/SSI | Bank identity renders before SSI skeleton. | “No published SSI for this bank” with provenance guidance. | Identity stays visible; SSI region shows Retry and diagnostic-safe copy. | SSI fields include status, as-of date, and verification provenance. | Retry remains in the failed region; Prepare Payment follows the SSI content. |
| Schemes | Valid URL state renders directly; async data reserves the detail frame. | A market with no rails explains that catalogue coverage is unavailable. | Selected market stays visible and Retry is scoped to details. | One selected rail plus optional comparison. | Tabs use arrow keys; rail choice moves focus to its detail heading; back/forward restores state. |
| Tutor | Availability and answer states use stable regions. | New panel shows contextual prompts, not a blank transcript. | Unavailable, rate-limited, and answer errors have distinct copy and actions. | Answer is labelled as educational guidance with a return link. | Panel traps focus only on mobile; close restores trigger focus; answers announce politely. |
| Walkthrough | Route frame and step title reserve space. | Not applicable; illustrative data ships with the app. | Missing route data offers return to Overview and does not show a broken diagram. | Completion is persisted and next actions are explicit. | Step heading receives focus after Next/Back; progress is announced as text. |
| Route-level lazy load | Shared page skeleton names the destination. | Not applicable. | Route error boundary offers Retry or return to its workspace root. | Destination heading replaces loader without layout jump. | Focus moves only for user-initiated navigation, not background refresh. |

## Visual and design-system rules

The redesign must look like Relay, not a generic dashboard. `PaymentRoute` is the homepage and walkthrough visual anchor. Search results, bank rows, and rail selectors are compact work lists; they are not converted into equal promotional cards. New surfaces use the existing dark/light theme tokens and the following mappings:

| Need | Existing foundation | Rule |
|---|---|---|
| Primary action | `Button` and `--color-action` | One primary button per main state; secondary actions are links or quiet buttons. |
| Work region | `Panel`/`AsyncRegion`, `--color-surface`, `--color-border` | `--radius-region`; no shadow, gradient, or decorative edge. |
| Control | Existing inputs/buttons | `--radius-control`, minimum 44px touch target, 16px mobile input text. |
| Status | `StatusChip` and semantic colors | Always pair text/icon/color; never use a decorative pill. |
| Identifiers | IBM Plex Mono | BICs, account identifiers, amounts in aligned comparisons only. |
| Rhythm | `--space-1` through `--space-8` | 8–16px within a control group, 24–32px between sections, 48–64px between major page regions. |
| Dense data | Existing mobile record-list pattern | Tables remain only while columns are legible; mobile uses labelled records. |

The `DESIGN.md` anti-template constraints are acceptance criteria: no dashboard mosaic, promotional feature grid, decorative icon circles, gradients, blobs, ornamental illustration, generic hero copy, centered-everything composition, emoji icons, or uniform oversized radii.

## Responsive behavior

| Viewport | Shell and overlays | Page composition | Dense data |
|---|---|---|---|
| 390×844 acceptance mobile | Bottom navigation; compact Relay identity; search and tutor icon buttons with accessible names; full-width top sheets clear the bottom safe area. | Single column; stacked Learn cases; homepage route becomes the existing vertical route; no secondary action cards. | Labelled bank and rail records; no page-level horizontal overflow. Market tabs may scroll horizontally with a visible continuation cue. |
| 768px tablet | Layout follows the existing shell breakpoint; search is a dialog, tutor remains a top sheet. | Two-column composition only where reading order remains intact; Learn track requires explicit controls. | Comparison may remain labelled records if six table columns cannot each remain legible. |
| 1024px compact desktop | Persistent rail and top bar; search dialog; tutor side panel. | Main content keeps a readable maximum line length and does not stretch cards across unused space. | Table is allowed only with all headers and values visible without clipping. |
| 1440×900 desktop | Same hierarchy with wider work area; overlays stay anchored to the application, not the browser edge. | Homepage and walkthrough may place narrative beside `PaymentRoute`; dominant action remains singular. | Comparison table may use full columns; rail detail retains a 45–75 character text measure. |

At 320px the application must remain operable as a robustness check: brand descriptor may hide, action labels may become accessible icon buttons, and content must not create page-level horizontal scrolling. Fixed surfaces use safe-area insets and never cover the focused control.

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
4. Schemes read only the active market and render only the selected rail detail. Switching markets updates both URL parameters and reserves the detail region until the new selection is ready; prior-market details are never shown under the new tab.
5. Tutor availability is a cheap read. Chat errors are presented as tutor-specific states and never replace the page content.
6. Health failures do not make the homepage blank. The overview may omit status counts when unavailable, while the relevant data surface explains the degraded state.
7. All mutations and existing educational simulation disclaimers remain unchanged.

## Resolved decisions

| Question | Decision |
|---|---|
| Where does the homepage start action go? | Dedicated `/app/walkthrough`; completion and current step persist locally. |
| Is global search a second implementation? | No. Shell overlay and Explore share one query/result engine and render model. |
| What happens when tutor is unavailable? | The trigger stays visible and opens an explanatory, retryable state. |
| How are scheme choices preserved/shared? | `market` and `rail` query parameters are canonical and browser-history aware. |
| What is bank search? | A bounded read-only `/api/banks` endpoint over local illustrative data; no external provider. |
| How are returning tasks ranked? | Newest unfinished payment/case/lesson, then next module, then review queue. |
| Does broad currency input mean full rail support? | No. Prepare Payment explicitly separates validation, domestic catalogue, SWIFT education, and SSI coverage. |
| How is stale local SSI fixed? | Idempotent SQLite compatibility columns/backfill in development; Alembic remains production authority. |
| Are `/app` and `/app/` different? | No. Both resolve to Overview and all deep links serve the SPA shell. |

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

## Implementation Tasks

Synthesized from this review's findings. Each task derives from a specific finding above. Run with Codex; checkbox as you ship.

- [ ] **T1 (P1, human: ~2h / Codex: ~20min) — Data health — Restore SSI development compatibility**
  - Surfaced by: Data health and routing reliability — stale SQLite SSI tables make health and SSI requests fail.
  - Files: `app/services/schema_compat.py`, `tests/test_schema_compat.py`
  - Verify: idempotence tests plus successful `/api/health`, `/api/lookup`, and `/api/ssi` against a stale-shape fixture.
- [ ] **T2 (P1, human: ~4h / Codex: ~45min) — Bank API — Add the directory-search contract**
  - Surfaced by: Explore and discovery — global search promises bank results but has no name/country endpoint.
  - Files: `app/routers/directory.py`, API response schemas/models, `tests/test_api.py`
  - Verify: focused API tests for country/name/BIC search, deterministic sorting, caps, offsets, and invalid requests.
- [ ] **T3 (P1, human: ~6h / Codex: ~60min) — Search — Build the shared query engine and shell surface**
  - Surfaced by: Screen hierarchy and interaction states — shell and Explore must share one accessible result model.
  - Files: `frontend/src/features/explore/search/CommandSearch.tsx`, its styles/tests, a bank-search service/hook, `frontend/src/app-shell/AppShell.tsx`
  - Verify: component tests for keyboard operation, request cancellation, empty/error states, deep links, and focus restoration.
- [ ] **T4 (P1, human: ~5h / Codex: ~50min) — Bank Directory — Add browse, filtering, and scoped SSI recovery**
  - Surfaced by: Bank Directory — BIC-only lookup does not support country-first discovery or name search.
  - Files: `frontend/src/features/explore/ExplorePage.tsx`, related styles/tests and bank result components
  - Verify: browse/search/pagination tests, return-context restoration, and independent bank-identity/SSI failures.
- [ ] **T5 (P1, human: ~6h / Codex: ~60min) — Overview — Implement the walkthrough and adaptive primary action**
  - Surfaced by: Overview and user journey — the current first action routes to a generic Explore state and resume inputs are not fully wired.
  - Files: `frontend/src/app-shell/App.tsx`, a new walkthrough feature, `frontend/src/features/overview/OverviewPage.tsx`, selector and tests
  - Verify: first-visit, step persistence, completion, newest-unfinished ranking, and stale-destination recovery tests.
- [ ] **T6 (P1, human: ~6h / Codex: ~60min) — Tutor — Add the always-discoverable responsive panel**
  - Surfaced by: Tutor — backend capability exists but the application has no visible entry point.
  - Files: `frontend/src/app-shell/AppShell.tsx`, new tutor panel/service files and tests
  - Verify: availability, unavailable, retry, rate-limit, answer error, focus restoration, and reduced-motion tests.
- [ ] **T7 (P1, human: ~5h / Codex: ~45min) — Payment Schemes — Show one URL-addressable rail at a time**
  - Surfaced by: Payment Schemes and responsive review — the page exposes all summary and detail content at once and mobile records are malformed.
  - Files: `frontend/src/features/explore/SchemeTabs.tsx`, `SchemeTable.tsx`, `SchemeDetails.tsx`, related styles/tests
  - Verify: market/rail URL history, keyboard tabs, single-detail rendering, collapsed comparison, and 390px labelled records.
- [ ] **T8 (P2, human: ~2h / Codex: ~20min) — Glossary — Expand terms and shared aliases**
  - Surfaced by: Glossary — terms already used by the app, including Interac, are not discoverable.
  - Files: glossary data/page files, shared search index, focused tests
  - Verify: `Interac` alias and named rail terms resolve in both Glossary and global search; zero-result recovery remains useful.
- [ ] **T9 (P2, human: ~3h / Codex: ~30min) — Responsive UI — Repair Learn and Prepare communication**
  - Surfaced by: Responsive behavior — mobile cases clip horizontally and currency input overstates catalogue/SSI support.
  - Files: `frontend/src/features/learn/LearnIndexPage.tsx`, `LearnPage.css`, `frontend/src/features/operate/prepare/PreparePaymentPage.tsx`, its styles/tests
  - Verify: stacked cases below 768px, explicit support note, long labels, and no page overflow at 320px and 390px.
- [ ] **T10 (P1, human: ~3h / Codex: ~30min) — Routing — Standardize lazy loading and `/app` entry behavior**
  - Surfaced by: Data health and routing reliability — null lazy fallbacks and inconsistent trailing-slash entry weaken navigation feedback.
  - Files: `frontend/src/app-shell/App.tsx`, shared loader/error-boundary files, server SPA routing configuration and tests
  - Verify: named route loaders plus direct navigation/refresh at `/app`, `/app/`, and representative deep links.
- [ ] **T11 (P1, human: ~5h / Codex: ~45min) — Quality — Verify the complete cross-surface story**
  - Surfaced by: Verification plan — the redesign changes shared navigation, async data, and four acceptance layouts.
  - Files: focused unit/API tests, `frontend/e2e/`, browser QA artifacts as needed
  - Verify: full frontend/backend suites, API smoke checks, keyboard checks, reduced motion, direct links, and 390/768/1024/1440 overflow inspection.

## GSTACK REVIEW REPORT

### Completion summary

```text
+====================================================================+
|         DESIGN PLAN REVIEW — COMPLETION SUMMARY                    |
+====================================================================+
| System Audit         | DESIGN.md authoritative; full app UI scope  |
| Step 0               | 7/10; focus IA, states, mobile, contracts    |
| Pass 1  (Info Arch)  | 7/10 → 9/10 after fixes                     |
| Pass 2  (States)     | 6/10 → 9/10 after fixes                     |
| Pass 3  (Journey)    | 7/10 → 9/10 after fixes                     |
| Pass 4  (AI Slop)    | 8/10 → 9/10 after fixes                     |
| Pass 5  (Design Sys) | 8/10 → 9/10 after fixes                     |
| Pass 6  (Responsive) | 6/10 → 9/10 after fixes                     |
| Pass 7  (Decisions)  | 9 resolved, 0 deferred                     |
+--------------------------------------------------------------------+
| NOT in scope         | written (6 items)                           |
| What already exists  | written                                    |
| TODOS.md updates     | 0 items proposed                            |
| Approved Mockups     | 0 generated; local renderer unavailable     |
| Decisions made       | 9 added to specification                   |
| Decisions deferred   | 0                                          |
| Overall design score | 7/10 → 9/10                                |
+====================================================================+
```

### Ratings

| Dimension | Rating | Result |
|---|---:|---|
| Information architecture | 9/10 | Exact route hierarchy and ownership are defined. |
| Interaction states | 9/10 | All changed async surfaces have loading, empty, error, success, and focus behavior. |
| User journey | 9/10 | Core journeys include entry, key moment, recovery, and successful exit. |
| Visual distinctiveness | 9/10 | `PaymentRoute` remains the signature and generic dashboard patterns are prohibited. |
| Design-system alignment | 9/10 | Existing components, tokens, radii, spacing, and content rules are mapped. |
| Responsive and accessibility | 9/10 | Acceptance widths, overlay modes, keyboard behavior, and mobile transformations are explicit. |
| Implementation readiness | 9/10 | Contracts, persistence, URL state, error boundaries, sequencing, and test gates are resolved. |

### Review outcome

- Initial score: 7/10
- Final score: 9/10
- Decisions resolved: 9
- Remaining product decisions: 0
- Code implementation performed during review: none
- Next gate: final written-spec approval, then engineering implementation planning

NO UNRESOLVED DECISIONS
