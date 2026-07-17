# Relay UI Rebuild Design

**Date:** 2026-07-17  
**Status:** Approved in collaborative design review  
**Scope:** Complete frontend rebuild and rebrand; existing FastAPI domain APIs remain the backend

The canonical visual and component contract is [`DESIGN.md`](../../../DESIGN.md). This specification owns product journeys, frontend architecture, state behavior, migration, and quality gates; `DESIGN.md` owns reusable visual rules.

## 1. Product definition

Relay is a responsive educational and operational simulation product for a broad audience: learners, fintech developers, payment-operations staff, and people exploring cross-border payments. It replaces the separate Corridor Labs `/learn` and `/ui` experiences with one cohesive application.

Relay is not a real payment platform. Every workflow, recommendation, route, and tracking event must remain visibly identified as simulated educational data. The persistent product descriptor is **Educational payment simulation**.

The product promise is: **Explore the network behind every payment.**

“Relay” is a working brand name. Public release requires trademark and domain clearance. A failed clearance changes the wordmark and product-copy tokens only; it does not reopen the approved interaction or visual design.

## 2. Goals and success criteria

The rebuild must:

- Create one product experience spanning learning, reference exploration, and simulated payment operations.
- Serve desktop and mobile users equally from the first production release.
- Make dense payment information understandable without making professional workflows feel simplistic.
- Preserve all currently supported user-facing capabilities while improving navigation, state feedback, accessibility, and visual coherence.
- Migrate incrementally so the current application remains usable throughout implementation.
- Establish a reusable component system that prevents the two existing visual systems from diverging again.

The rebuild is successful when:

- Every current `/learn` and `/ui` capability has a mapped and tested Relay destination.
- The primary Learn, Explore, and Operate journeys pass on desktop and a 390px mobile viewport.
- Automated accessibility testing reports no serious or critical violations on the primary journeys.
- All interactive functionality is keyboard operable and has visible focus treatment.
- No legacy route is removed before its Relay replacement passes the retirement quality gate in section 12.

## 3. Experience architecture

Relay uses intent-based navigation instead of separating users by role. It contains four primary destinations:

1. **Overview** — cross-workspace home, recent activity, learning progress, and quick actions.
2. **Learn** — guided modules, interactive labs, completion feedback, progress, and capstone simulation.
3. **Explore** — bank directory, corridors, schemes, SSI concepts, glossary, and visual explainers.
4. **Operate** — payment preparation, payee verification, sanctions screening, routing, fee simulation, value dates, STP checks, and tracking.

Desktop uses a persistent left navigation rail and top application bar. Mobile uses a four-item bottom navigation bar for Overview, Learn, Explore, and Operate. Search, recent activity, simulation status, and secondary actions live in a top sheet on mobile.

Every destination supports a stable URL. Browser Back and Forward navigation must restore the corresponding screen without losing committed query state. In-progress form data is restored from a versioned local draft where specified.

The screen hierarchy is:

```text
Relay shell
├── Overview
│   ├── One adaptive primary action
│   ├── Current context: progress or latest result
│   └── Utility row: Search, Directory, Track
├── Learn
│   ├── Current module and next action
│   ├── Curriculum sequence
│   └── Progress and completed work
├── Explore
│   ├── Search or browse entry
│   ├── Results or entity detail
│   └── Related Learn and Operate links
└── Operate
    ├── Active payment workspace
    ├── Current step and its result
    └── Prior-step summaries and next action
```

Each screen has one visually dominant action. Supporting destinations use text links, rows, or compact controls rather than a grid of equal promotional cards.

## 4. Core journeys

### 4.1 Overview

The overview answers three questions: where was I, what can I do now, and what recently happened? It uses an adaptive primary action:

- A first-time user sees **Explore how payments move**, which opens the introductory Explore route with a direct path into the first Learn module.
- A returning user with unfinished work sees the most recently active Learn module or Operate draft as the single dominant action.
- A returning user with no unfinished work sees the most relevant next Learn module, or **Prepare a simulated payment** after the curriculum is complete.

Below the primary action, the overview shows current context and a quiet utility row:

- Current context: learning progress or the latest simulation result.
- Utility row: Search, Bank directory, and Track payment.
- Recent activity as a compact chronological list, not a card grid.

Empty overview modules explain how to create their first entry rather than displaying blank cards.

### 4.1.1 First-run journey

Relay does not use a forced tour or role-selection gate. The first-run path teaches through the product itself:

| Step | User does | Intended feeling | Interface response |
|---|---|---|---|
| 1 | Lands on Overview | Oriented, not tested | One dominant **Explore how payments move** action; Search and Operate remain directly accessible |
| 2 | Opens the introductory route | Curious | A real example route becomes the visual anchor; labels explain only the active concept |
| 3 | Advances through the route | Capable | Stepped disclosure connects each institution to its purpose without a long instruction block |
| 4 | Changes one route input | In control | The visualization updates and explains the consequence in plain language |
| 5 | Chooses Learn, Explore, or Operate | Self-directed | Relay offers one relevant next action for each workspace and stops prompting |

First-run guidance is contextual, dismissible, and recoverable from Help. Once a concept has been used, its guidance does not reappear automatically. The five-second experience establishes product identity and one obvious action; the five-minute experience produces a completed route exploration; the long-term experience builds trust through saved progress, explainable results, and predictable state recovery.

### 4.2 Learn

The Learn flow is:

`Module overview → Concept → Interactive example → Exercise → Completion feedback → Next module`

Modules expose prerequisites, estimated duration, learning outcomes, and completion state. Progress is stored locally and does not require an account. A learner may revisit completed content. Reduced-motion mode replaces animated explanations with equivalent stepped or static states.

### 4.3 Explore

Explore begins with search and category browsing. Results open detail pages with related entities and cross-links:

- A bank links to its supported identifiers, country, relevant corridors, and related learning material.
- A corridor links to currencies, payment schemes, possible intermediary patterns, fees, and relevant simulations.
- A concept links to glossary definitions, learning modules, and the relevant Operate action.

Search covers banks, routes, lessons, glossary terms, payment schemes, and UETRs. Search results are grouped by type and remain keyboard navigable.

### 4.4 Operate

Operate consolidates formerly separate tools into a guided payment workspace:

`Beneficiary details → Validation and risk checks → Route and fee comparison → Recommendation → Simulated tracking`

Users can open an individual tool directly, but the guided workflow is the primary entry point. Completed step results remain visible as compact summaries. Editing an upstream input invalidates dependent downstream results and tells the user which checks must be rerun.

Recommendations use text, icons, and semantic color together. Blocking and non-blocking outcomes remain explicit. The final screen explains the factors behind the recommendation and offers relevant Explore and Learn links.

## 5. Visual direction

Relay uses the approved **Precision Workspace** direction: bright, structured, restrained, and credible under dense data.

### 5.1 Color

- Primary blue: `#3157D5` — primary actions, selected navigation, links, and progress.
- Deep navy: `#16233D` — strong emphasis surfaces and high-contrast text.
- Canvas: `#F6F8FC` — application background.
- Surface: `#FFFFFF` — panels, navigation, and data regions.
- Border: `#DCE2EB` — structural boundaries.
- Secondary text: `#68748A`.
- Success: `#16825D`.
- Warning: `#C87B16`.
- Danger: `#C8424D`.

Semantic colors may not be used as the only status signal. All text and interactive states must meet WCAG 2.2 AA contrast.

### 5.2 Typography

Instrument Sans is the interface and learning-content typeface. IBM Plex Mono is used for IBANs, BICs, UETRs, account identifiers, amounts in comparison columns, raw messages, and code. Both fonts are self-hosted, subset to supported writing systems, and configured with metric-compatible fallbacks. Monospace ligatures are disabled. Display headings use tight tracking and strong weight; body copy favors comfortable reading measure and line height.

The UI uses a restrained type scale with clear levels for display, page title, section title, body, label, and metadata. Mobile type does not shrink below 16px for form controls.

### 5.2.1 Anti-template constraints

- Overview is not a mosaic of equal cards. It has one dominant action, one context region, one utility row, and one chronological activity list.
- Cards exist only when the surface is independently selectable, movable, or meaningfully bounded. Layout grouping alone does not justify a card.
- Decorative icon circles, colored card edges, gradients, floating shapes, and ornamental illustrations are not part of the product language.
- The route visualization is Relay's primary visual signature. It uses a continuous path, institution nodes, and moving or stepped payment state rather than generic charts.
- Section copy is operational or instructional. Avoid welcome copy, aspiration claims, and paragraphs that explain obvious controls.
- Corner radius follows control purpose; it is not applied uniformly to every container.

### 5.3 Surfaces and density

The canvas is quiet. White surfaces use thin borders rather than decorative shadows. Blue is reserved for actions, selection, progress, and meaningful emphasis. Operational screens are compact but group related information with spacing and alignment. Learning screens use a wider rhythm and controlled reading measure.

Radius is consistent: 8px for controls, 10–12px for panels, and full radius for status chips. Motion is short and functional. It explains state changes, never delays access to content.

## 6. Component system

The design system includes:

- Application shell, desktop sidebar, mobile bottom navigation, top bar, top sheet, breadcrumbs, and command search.
- Button, icon button, link, segmented control, tabs, disclosure, tooltip, and menu.
- Text field, amount field, identifier field, select, combobox, checkbox, radio group, date field, and form message.
- Panel, data card, metric, description list, table, mobile record list, timeline, stepper, and empty state.
- Status chip, recommendation banner, inline alert, toast, skeleton, spinner, and progress indicator.
- Payment-route diagram, fee breakdown, validation results, and institution identity.

Components expose accessible names, focus behavior, disabled behavior, loading behavior, validation behavior, and responsive behavior as part of their public interface. Feature code consumes design-system components and tokens rather than introducing local equivalents.

Tables become labeled record lists on narrow screens when preserving column relationships would otherwise require destructive horizontal compression. Route diagrams provide a concise screen-reader summary containing origin, intermediaries, beneficiary, currency, and amount when present.

## 7. Frontend architecture

Create a Vite-powered React and TypeScript frontend inside `frontend/`. Organize source by product responsibility:

```text
frontend/src/
  app-shell/
  design-system/
  features/
    learn/
    explore/
    operate/
    overview/
  api/
  lib/
  test/
```

- React Router owns stable routes, nested layouts, and navigation restoration.
- TanStack Query owns server state, caching, retries, invalidation, and background refresh.
- React Hook Form owns form interaction state.
- Zod defines client-side input schemas at user-entry boundaries.
- Local storage holds versioned anonymous learning progress, recent items, user preferences, and explicitly saved simulation drafts.
- Vitest, React Testing Library, Mock Service Worker, and Playwright provide the frontend test stack.

Global client state is limited to shell-level concerns such as navigation state, command-search state, preferences, and active draft identity. Server results remain in TanStack Query and form values remain in React Hook Form. Do not duplicate either in a general-purpose store.

## 8. Backend integration and data flow

FastAPI remains the system of record and retains the existing `/api` endpoints. It serves the compiled Relay assets in production while continuing to serve legacy pages during migration.

The data flow is:

`User interaction → feature hook/form → typed API client → FastAPI endpoint → normalized frontend model → query cache → component`

The typed API client contains request construction, response parsing, API error normalization, and cancellation. Feature components do not call `fetch` directly. Zod validates user input before requests; API responses use generated or explicitly maintained TypeScript types aligned with FastAPI schemas.

Mutations prevent duplicate submission, retain inputs on failure, expose progress, and invalidate exact dependent query keys after success. Editing an input that affects a completed payment check clears or marks stale every dependent result.

## 9. State and persistence

Persist only state that benefits from surviving reloads:

- Learning progress and completion timestamps.
- Recent simulations and recently opened reference items.
- User preferences, including reduced motion and navigation density.
- Explicitly saved payment drafts, excluding secrets.

Each stored object contains a schema version. Invalid or obsolete data is discarded safely and replaced with defaults. Session-only UI state such as open menus, transient messages, and unsaved filters is not persisted.

## 10. Loading, empty, error, and offline behavior

Every asynchronous region reserves its final layout space and defines five states: loading, success, empty, recoverable error, and unavailable.

- Loading uses skeletons for content and a progress indicator for user-triggered operations.
- Empty states state why no data exists and offer one relevant action.
- Field validation appears beside the affected field and moves focus to the first invalid field on submission.
- Section failures remain inside the affected panel with Retry and preserve surrounding content.
- Route failures show a dedicated recovery view without destroying recoverable draft state.
- Unexpected render failures are caught by an application error boundary with Reload and Return to overview actions.
- Offline state disables server-dependent actions, retains drafts, and explains which local Learn content remains available.

The required feature-state contract is:

| Feature | Loading | Empty | Error | Success | Partial |
|---|---|---|---|---|---|
| Overview | Skeleton matches the adaptive action and activity rows | First action explains how to explore a payment | Failed module stays in place with Retry | One primary action, current context, utility row | Available progress or activity renders; failed source is labeled unavailable |
| Learn module | Lesson-frame skeleton; controls remain reserved | Module-unavailable explanation and curriculum link | Inline recovery preserves completed steps | Completion feedback and next-module action | Completed content remains; failed exercise or visualizer retries in place |
| Explore results | Result-row skeletons and visible query | Contextual zero-result message, query-edit action, suggested categories | Results region shows Retry and preserves query | Grouped, keyboard-navigable results | Available result groups render; unavailable group states its source and retry |
| Explore detail | Stable title and detail-region skeleton | Entity-not-found explanation with return to results | Detail region retries without losing search history | Entity facts, relationships, and cross-workspace links | Available sections render; unavailable related data is labeled separately |
| Operate checks | Per-check progress with duplicate submission disabled | Not applicable before submission; drafts show Start checks | Failed check states what failed and provides targeted Retry | Every required check has an explicit outcome | Passed results remain visible; failed checks retry independently; final recommendation is **Incomplete** |
| Route and fees | Diagram and amount-row skeletons reserve final dimensions | Explain that no supported simulated route was found and offer Edit payment | Preserve inputs and completed checks; Retry route only | Route, confidence, fees, assumptions, and alternatives | Available route data remains visible; missing fee or SSI evidence is labeled and blocks a final recommendation when required |
| Tracking | Timeline skeleton with stable event positions | Explain that no simulated events exist and offer Start simulation | Preserve UETR and provide Retry | Ordered simulated event timeline and current status | Known events render; refresh failure labels the timeline as potentially stale |

Operate check status values are **Passed**, **Needs attention**, **Failed**, and **Unavailable**. A partial run never derives a conclusive recommendation when a required check is Failed or Unavailable. The recommendation region displays **Incomplete**, lists the missing evidence, and offers targeted retries. Optional missing evidence may produce a cautionary recommendation only when the backend contract explicitly marks that evidence optional.

Persistent simulation labeling appears in the application shell and on exported or shareable-looking result surfaces. Recommendation and tracking screens carry an additional **Simulation — not a real payment** label.

## 11. Responsive and accessibility requirements

Desktop and mobile are equal release targets. Primary acceptance viewports are 1440×900 and 390×844, with intermediate behavior verified at 768px and 1024px widths.

The interface must provide:

- WCAG 2.2 AA contrast.
- Complete keyboard operation and logical focus order.
- Visible `:focus-visible` treatment.
- Minimum 44×44px touch targets for primary mobile controls.
- Semantic landmarks, headings, forms, tables, status messages, and dialogs.
- Focus trapping and restoration for modal surfaces.
- Live-region announcements for asynchronous validation and recommendations.
- Reduced-motion alternatives for all explanatory animation.
- Text and icon status cues in addition to color.
- Screen-reader alternatives for visual payment routes and charts.

Payment routes use two intentional compositions. At 768px and wider, the route is a horizontal continuous path. Below 768px, it becomes a vertical stepper in document order. Every institution remains visible; the active hop expands to show amount, fee, timing, and status while completed and upcoming hops remain compact. Focus order follows route order, and expanding a hop does not move focus unexpectedly.

## 12. Testing and legacy retirement gate

Each migrated feature requires:

- Vitest unit tests for domain transformations, persistence migrations, and state logic.
- React Testing Library tests for user interaction, keyboard behavior, and accessible names.
- Mock Service Worker coverage for loading, success, empty, validation error, server error, and delayed-response states.
- Playwright coverage of the primary desktop and mobile journey.
- Automated accessibility checks with no serious or critical violations.
- Stable screenshot comparisons for the approved key states at 1440px and 390px widths.
- A documented feature-parity check against the legacy feature.
- Manual product and UX acceptance.

A legacy route is removed only after all applicable checks pass for its Relay replacement. Removal includes deleting the retired markup, scripts, styles, and routing branch; it does not leave dormant duplicate implementations.

## 13. Incremental migration

Migration proceeds in independently releasable slices:

1. Frontend foundation, build integration, design tokens, primitives, shell, and Overview.
2. Explore workspace and command search, beginning with read-only bank and corridor data.
3. Operate workspace, beginning with Prepare Payment and its dependent verification, routing, and SSI results.
4. Remaining operational tools and tracking.
5. Learn workspace, shared interactive visualizations, progress migration, and capstone.
6. Final parity audit, legacy removal, performance optimization, and production cutover.

The new shell may link to unmigrated legacy capabilities during intermediate releases, clearly preserving navigation back to Relay. A migration adapter reads existing Corridor Labs local progress once, transforms it into the Relay versioned schema, and records completion so it does not import repeatedly.

## 14. Performance requirements

- Route-level code splitting keeps Learn, Explore, and Operate feature bundles independent.
- Initial shell JavaScript is budgeted at 200KB gzip or less, excluding lazily loaded feature routes.
- Fonts are self-hosted, subset, preloaded only when critical, and use `font-display: swap`.
- Search input and client-side filtering remain responsive with the full bundled reference dataset.
- Large visualizers and editors load only on routes that use them.
- Primary navigation transitions show meaningful content or a skeleton without a blank frame.

## 15. What already exists

The rebuild should reuse proven domain behavior without inheriting the legacy presentation architecture:

- Existing FastAPI `/api` endpoints and response semantics remain the integration boundary.
- Current Learn module content, exercises, progress rules, visualizer domain logic, and capstone behavior are source material for React feature parity.
- Current `/ui` workflows define the minimum tool and result coverage for Operate and Explore.
- Existing accessibility work for focus visibility, reduced motion, and contrast is a regression baseline, not permission to copy legacy CSS.
- Existing `app/static/css/*.css` and vanilla JavaScript are migration references only. New React features consume `DESIGN.md` tokens and shared components.
- The approved browser mockups establish the Precision Workspace composition: bright canvas, disciplined grid, blue action color, compact data regions, and one clear primary action.

## 16. Not in scope

This rebuild does not:

- Replace or redesign the FastAPI domain services and database.
- Add real payment initiation, production routing guarantees, user accounts, or cloud synchronization.
- Change simulation data into production-grade payment data.
- Add native iOS or Android applications.
- Introduce a dark theme in the initial rebuild.
- Rework unrelated backend security or data-quality roadmap items unless a frontend integration requires it.

Dark theme, accounts, cloud progress sync, and native applications are explicit deferrals because none is required to validate the unified Relay experience. They require separate product and technical specifications if later prioritized.

## 17. Documentation deliverables

Implementation must update:

- Root development instructions for installing and running the frontend and FastAPI together.
- Frontend architecture and folder-boundary guidance.
- Design-token and component usage documentation.
- Route and legacy-parity mapping.
- Accessibility testing instructions.
- Production build and deployment instructions.

## 18. Implementation Tasks

Synthesized from the design review. The detailed implementation plan will decompose these into test-driven tasks with exact files and commands.

- [ ] **T1 (P1, human: ~1 day / agentic: ~1 hour)** — Design system — Implement `DESIGN.md` tokens, typography, focus, spacing, and primitive states.
  - Surfaced by: Design-System Alignment — the repository had no canonical visual contract.
  - Files: `DESIGN.md`, `frontend/src/design-system/`, frontend token and font assets.
  - Verify: component tests, automated contrast checks, keyboard review, 390px and 1440px visual snapshots.
- [ ] **T2 (P1, human: ~2 days / agentic: ~2 hours)** — App shell — Build intent-based navigation and adaptive Overview hierarchy.
  - Surfaced by: Information Architecture — equal dashboard cards obscured the next action.
  - Files: `frontend/src/app-shell/`, `frontend/src/features/overview/`.
  - Verify: first-time, unfinished-Learn, unfinished-Operate, and completed-curriculum journey tests.
- [ ] **T3 (P1, human: ~2 days / agentic: ~2 hours)** — Async states — Implement the feature-state matrix and progressive partial Operate results.
  - Surfaced by: Interaction State Coverage — mixed API outcomes lacked a safe presentation contract.
  - Files: `frontend/src/api/`, shared state components, `frontend/src/features/operate/`.
  - Verify: Mock Service Worker tests for loading, empty, error, success, delayed, and partial states.
- [ ] **T4 (P2, human: ~1 day / agentic: ~1 hour)** — First-run experience — Build contextual route-based guidance without a forced tour.
  - Surfaced by: User Journey — the original spec described actions but not the first five-minute confidence arc.
  - Files: `frontend/src/features/overview/`, `frontend/src/features/explore/`, preference persistence.
  - Verify: first-run Playwright journey, dismiss and recovery behavior, returning-user suppression.
- [ ] **T5 (P1, human: ~2 days / agentic: ~2 hours)** — Route visualization — Build horizontal desktop and vertical mobile route compositions from one semantic model.
  - Surfaced by: Responsive and Accessibility — mobile route behavior was previously ambiguous.
  - Files: `frontend/src/design-system/payment-route/` and feature integrations.
  - Verify: 390px, 768px, and 1440px screenshots; keyboard, screen-reader summary, and reduced-motion tests.
- [ ] **T6 (P2, human: ~4 hours / agentic: ~30 minutes)** — Anti-template QA — Enforce content, card, radius, typography, and decoration constraints during component review.
  - Surfaced by: AI-Slop Risk — Inter and equal card treatment made the approved direction vulnerable to generic dashboard output.
  - Files: `DESIGN.md`, design-system stories or visual fixtures, visual regression baselines.
  - Verify: review every primary screen against the anti-template checklist before legacy retirement.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope and strategy | 0 | Not run | No CEO review recorded |
| Codex Review | `/codex review` | Independent second opinion | 0 | Not run | No independent review recorded |
| Eng Review | `/plan-eng-review` | Architecture and tests (required) | 0 | Required | Must validate the React migration and build integration before implementation |
| Design Review | `/plan-design-review` | UI and UX gaps | 1 | Clear | Score: 7/10 → 10/10; 6 decisions added |
| DX Review | `/plan-devex-review` | Developer-experience gaps | 0 | Not run | No DX review recorded |

**VERDICT:** DESIGN CLEARED; engineering review is required before implementation.

NO UNRESOLVED DECISIONS
