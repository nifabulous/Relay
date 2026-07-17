# Relay UI Rebuild Design

**Date:** 2026-07-17  
**Status:** Approved in collaborative design review  
**Scope:** Complete frontend rebuild and rebrand; existing FastAPI domain APIs remain the backend

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

## 4. Core journeys

### 4.1 Overview

The overview answers three questions: where was I, what can I do now, and what recently happened? Its primary modules are:

- Continue learning, with module title, progress, and time estimate.
- Start a simulated payment.
- Explore routes, open the bank directory, and track a payment.
- Recent simulations and recently viewed reference items.

Empty overview modules explain how to create their first entry rather than displaying blank cards.

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

Inter is the interface and learning-content typeface. A non-ligature monospace stack is used for IBANs, BICs, UETRs, account identifiers, raw messages, and code. Display headings use tight tracking and strong weight; body copy favors comfortable reading measure and line height.

The UI uses a restrained type scale with clear levels for display, page title, section title, body, label, and metadata. Mobile type does not shrink below 16px for form controls.

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

## 15. Out of scope

This rebuild does not:

- Replace or redesign the FastAPI domain services and database.
- Add real payment initiation, production routing guarantees, user accounts, or cloud synchronization.
- Change simulation data into production-grade payment data.
- Add native iOS or Android applications.
- Introduce a dark theme in the initial rebuild.
- Rework unrelated backend security or data-quality roadmap items unless a frontend integration requires it.

## 16. Documentation deliverables

Implementation must update:

- Root development instructions for installing and running the frontend and FastAPI together.
- Frontend architecture and folder-boundary guidance.
- Design-token and component usage documentation.
- Route and legacy-parity mapping.
- Accessibility testing instructions.
- Production build and deployment instructions.

