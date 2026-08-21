# Relay Learn, Explore, and Operate Workspace Redesign

Date: 2026-08-21  
Branch: `codex/coss-slice-2`  
Status: Approved visual directions; UX spec ready for review

## Decision

Extend the approved Overview redesign with three coordinated workspace treatments:

- **Learn A — Case Desk Launchpad:** case-first learning with technical curriculum as a supporting reference.
- **Explore A — Search Command Center:** search-first discovery with grouped, typed results.
- **Operate A — Guided Payment Builder:** guided payment preparation with clear validation stages and route context.

The three pages must feel like one Relay product. They share the AppShell, typography, token system, Tutor/preferences controls, status language, and interaction contract, but each page has a different job:

```text
Learn    → choose or resume meaningful learning work
Explore  → find and understand payment-network information
Operate  → prepare and validate a simulated payment
```

The approved Overview direction is specified separately in `2026-08-21-overview-adaptive-command-center-design.md`. This document does not redesign the shell or Overview again.

## Product and UX goals

1. Make the next meaningful action obvious on every workspace.
2. Preserve the user’s mental model when moving between Learn, Explore, and Operate.
3. Use progressive disclosure so dense payment information appears when it is useful.
4. Keep educational framing visible without making the product feel like a toy.
5. Make loading, empty, unavailable, validation, and partial-result states useful and recoverable.
6. Preserve Relay’s calm, precise visual language across light and dark themes.
7. Give mobile the same product quality as desktop, not a compressed afterthought.

## Non-goals

- No new top-level navigation destination.
- No backend schema or data-model redesign.
- No live payment execution; Operate remains a simulation.
- No replacement of the existing curriculum, search index, scheme catalogue, or payment checks.
- No wholesale generated Coss component set.
- No new runtime dependency for icons or variants.
- No unrelated redesign of Bank Directory, scheme details, Case Desk internals, Settings, Tutor, or AppShell.

## Shared experience contract

### Visual system

- Use Relay tokens from `frontend/src/design-system/tokens.css` for color, type, spacing, radius, motion, and theme parity.
- Use the Coss bridge in `frontend/src/design-system/coss-theme.css` and `frontend/src/lib/coss/cn.ts` where it improves class composition.
- Keep Relay-owned classes and shared controls as the product-facing API.
- Use Base UI only for behavior primitives that genuinely need focus management, positioning, or dismissal. These three page redesigns do not add a new Base UI primitive.
- Do not add `class-variance-authority`, `lucide-react`, or generated Coss components unless a concrete implementation requirement justifies them.
- Use thin structural borders, bounded surfaces, restrained radius, and no decorative shadows or gradients.
- Status always combines text, icon or shape, and color; color alone must never carry meaning.

### Interaction and accessibility

- All primary and secondary actions are real links or buttons with visible focus states.
- Interactive targets are at least 44px high.
- Form labels remain visible when a field contains a value.
- Keyboard order follows the visual reading order.
- `Escape` closes any page-owned popover or menu and returns focus to its trigger.
- Async updates use stable regions and polite announcements where content changes affect the current task.
- Motion uses existing duration tokens and collapses under `prefers-reduced-motion: reduce`.
- Acceptance widths remain 390×844, 768, 1024, and 1440×900.

### Cross-workspace wayfinding

The shell shows the active workspace. Each page also has an explicit `h1` and one-sentence purpose statement. The primary action is page-specific:

| Workspace | Primary question | Primary action |
|---|---|---|
| Learn | What meaningful learning work should I do next? | Start or resume a case, lesson, or practice drill |
| Explore | What payment-network information am I trying to find? | Search or open a clearly typed result |
| Operate | What do I need to validate before this simulated payment can proceed? | Enter details and run checks |

Avoid reusing identical “Continue” labels without context. The action text must tell the user what will happen next.

## Learn A — Case Desk Launchpad

### User goal

The learner wants to resume meaningful work, start a realistic case, or deliberately open a technical module without scanning the entire curriculum first.

### Information hierarchy

```text
Learn heading and purpose
└── Active case desk / start case (dominant)
    ├── Daily practice context
    ├── Cases · Technical labs · Practice routes
    └── Technical labs list with progress and locked states
```

### Layout and behavior

At 1024px and wider:

- The header uses `Learn` and `Guided modules covering the full cross-border payment lifecycle.`
- The larger left region is `Active case desk`.
- The case panel shows the case title, one-sentence purpose, current step, remaining time, state, progress, and one action.
- The smaller right region is `Daily practice`, showing streak, review due, today’s completion, and `Start drill` or `Practice again`.
- A compact route strip exposes `Cases`, `Technical labs`, and `Practice` without turning them into promotional feature cards.
- The technical-lab list remains dense and scannable below the primary work.

At 768px, the case and practice regions may remain side by side only if their labels and actions remain readable. Otherwise, stack the case first and practice second.

At 390px:

- Stack in the order: active case, daily practice, routes, technical labs.
- Make the case action full width.
- Keep the current case state visible before the learner reaches the technical list.
- Convert lab rows to two-line entries; do not require horizontal scrolling.

### UX decisions

- If there is a valid in-progress case, show `Resume case` and the current step.
- If there is no case session, show `Start a case` with a short explanation of what the learner will do.
- If a case is completed, show the completed state and a deliberate next action such as `Review case` or `Start another case`; do not imply mastery or certification.
- If a case is under review or unavailable, keep it visible with the reason and one safe alternative, such as the relevant technical lab.
- A corrupt draft must offer a scoped restart action and must not affect other cases or curriculum progress.
- Daily practice is secondary but never hidden. A zero streak is not shown as a dramatic failure; the learner sees the available drill and the review count.
- Locked labs state the prerequisite in the row and remain discoverable. They are not disabled without explanation.

### Data and component reuse

Reuse existing:

- `CASE_CATALOG`, `loadCaseSession`, and `CaseEntry` state conventions.
- `CURRICULUM`, `loadProgress`, `isModuleUnlocked`, and duration formatting.
- Practice store helpers for streak, review due, and today’s completion.
- Relay Button, StatusChip, AsyncRegion, and tokenized list/panel treatment where applicable.

Do not create a universal “learning dashboard” data model for this redesign.

## Explore A — Search Command Center

### User goal

The user has a payment question and wants to find the right bank, payment scheme, glossary term, lesson, or related destination without guessing which page owns the answer.

### Information hierarchy

```text
Explore heading and purpose
└── Search field (dominant)
    └── Grouped typed results
        ├── Banks
        ├── Payment schemes
        ├── Glossary
        └── Lessons
    ├── Suggested destinations
    └── Recent searches
```

### Layout and behavior

At 1024px and wider:

- The header uses `Explore` and `Search banks, corridors, payment schemes, and glossary terms.`
- The search field is the first interactive element and visibly supports the existing `⌘K` / `Ctrl+K` entry point.
- When a query is present, results are grouped by type. Each row exposes a type label, title, useful supporting context, and destination action.
- Groups are ordered by user value: Banks, Payment schemes, Glossary, Lessons. Empty groups are omitted rather than rendered as dead space.
- Suggested destinations remain below results: `Bank Directory`, `Payment Schemes`, and `Glossary`.
- Recent searches remain quiet and removable; they must not compete with active results.

At 768px and 390px:

- Search remains at the top and stays reachable after results load.
- Result groups become one readable list in the same order.
- Supporting text wraps naturally; result actions remain at least 44px high.
- Suggested destinations move below results and use full-width rows.
- No result row relies on hover to reveal its destination.

### UX decisions

- An empty query shows the search affordance plus the three useful destinations; it does not show a wall of arbitrary results.
- A query with no matches explains what types are searched and offers a concrete recovery: try a bank name, BIC, scheme, or glossary term.
- Static index results remain usable immediately. If a future bank lookup is asynchronous, its loading/error state must be scoped to the bank group so glossary and lesson results remain usable.
- Result type is always visible. A glossary definition must not look like a bank record, and a lesson must not look like an executable tool.
- Selecting a result navigates directly to the destination and preserves the query context when the user returns.
- Search input keeps focus on open, arrow keys move the active result, Enter opens it, and Escape closes the overlay when search is presented as a shell-owned command surface.
- Recent searches are helpful memory, not a source of truth. Corrupt local search history becomes an empty state without blocking search.

### Data and component reuse

Reuse existing:

- `CommandSearch` and the existing grouped search-index model.
- Existing Explore category links and destination routes.
- AsyncRegion for any future network-backed result group.
- Existing result labels, route links, and tutor context publishing.

Do not invent a second page-specific search engine or silently claim live bank coverage if the result is from the static index.

## Operate A — Guided Payment Builder

### User goal

The user wants to prepare a simulated payment, understand what information is required, validate it, and review the resulting route without confusing the simulation for an executable payment.

### Information hierarchy

```text
Operate heading and purpose
└── Step indicator: Payment details → Run checks → Review route
    ├── Payment details form (dominant)
    └── Route context (supporting)
        └── Coverage note + Run checks
```

### Layout and behavior

At 1024px and wider:

- The header uses `Operate` and `Prepare, validate, and understand a simulated payment.`
- A three-stage indicator makes the workflow visible: `1 Payment details`, `2 Run checks`, `3 Review route`.
- The left region owns the labelled form: beneficiary name, beneficiary IBAN, beneficiary BIC, currency, amount, and routing strictness.
- The right region owns route context: beneficiary bank, published currencies, educational simulation framing, and a route preview.
- The primary action is `Run checks`, placed at the end of the form and clearly distinct from secondary edits.
- The coverage note explains that supported rails and bank-published settlement instructions vary by corridor.

At 768px and 390px:

- Stack form before route context.
- Keep the step indicator readable; a compact vertical or abbreviated step treatment is allowed if labels remain understandable.
- Make the primary action full width.
- Keep the primary action reachable after the last required field. A sticky mobile action bar is allowed only if it respects the safe area and does not cover validation errors.
- Route context moves below the form and remains visible after the user submits.

### UX decisions

- Required fields have visible labels, useful examples, and concise helper text. Placeholder text is not the only instruction.
- `Run checks` is unavailable until required values are valid, but the page explains what remains incomplete rather than presenting a mysterious disabled control.
- Validation errors appear beside the relevant field, use plain language, and preserve the user’s input.
- A BIC lookup can populate route context and published currencies without clearing manually entered values.
- Before a valid BIC is present, route context says `Enter a beneficiary BIC to load bank context`; it must not look like a broken or unfinished panel.
- Loading settlement instructions uses a stable inline loading state. Failure keeps the form usable and offers a scoped retry.
- After submission, the page shows check progress, then check results and the recommendation. Partial failures name the affected check and provide retry or review guidance.
- The route review state must distinguish educational route explanation from execution. It must not use language such as “send”, “transfer”, or “payment complete” for a simulation.
- If form data changes after checks, show a visible stale-result warning and require the user to run checks again before trusting the route.

### Data and component reuse

Reuse existing:

- `PreparePaymentPage` form schema and React Hook Form validation.
- `CurrencyPicker`, SSI query and published-currency filtering.
- `CheckResult`, `Recommendation`, `CorrespondentOptions`, `SsiProvenance`, and `PaymentRoute`.
- Existing API contracts for `/api/ssi` and `/api/prepare-payment`.
- Relay Button, AsyncRegion, StatusChip, and tokenized form controls.

Do not add a new payment execution API or invent route availability beyond what the existing checks and provenance support.

## Shared state matrix

| Workspace | Loading | Empty / first use | Error or degraded | Success / active |
|---|---|---|---|---|
| Learn | Case and lab regions reserve meaningful space; local progress renders immediately. | Start-case state, zero practice context, and visible unlocked first lab. | Corrupt case draft is scoped to that case; unavailable content names a safe alternative. | Resume/start action, practice context, and lab progress are visible. |
| Explore | Search opens immediately; async groups show scoped loading only. | Destinations and search guidance explain what can be searched. | No-results recovery or group-level retry preserves query and usable groups. | Typed grouped results with direct destinations and preserved context. |
| Operate | Form renders immediately; bank context and checks load in stable regions. | Required fields explain how to begin; route context asks for a BIC. | Inline field errors, scoped SSI retry, check-level failure, and stale-result recovery. | Results show checks, recommendation, route explanation, provenance, and next action. |

## Implementation boundary

Expected production files:

- Learn: `frontend/src/features/learn/LearnIndexPage.tsx`, `frontend/src/features/learn/LearnPage.css`, related Learn tests and existing case/practice components.
- Explore: `frontend/src/features/explore/ExplorePage.tsx`, `frontend/src/features/explore/ExplorePage.css`, `CommandSearch` tests, and Explore E2E coverage.
- Operate: `frontend/src/features/operate/prepare/PreparePaymentPage.tsx`, `frontend/src/features/operate/prepare/PreparePaymentPage.css`, form/check tests, and Operate E2E coverage.
- Shared only if needed: existing design-system controls, tokens, AsyncRegion, StatusChip, Button, and payment-route styles.

Do not modify backend contracts, dependency manifests, AppShell navigation, Overview production files, or unrelated pages in this pass unless a shared primitive gap is proven and called out before expansion.

## Acceptance criteria

- Learn presents a clear active-case or start-case action before the technical curriculum.
- Explore makes search the dominant action and distinguishes every result type.
- Operate makes the form-to-checks-to-route sequence obvious.
- All three pages retain their existing routes and core data behavior.
- Every page has intentional first-use, loading, empty, error, partial, and success states.
- Mobile layouts are designed at 390px and do not require horizontal scrolling.
- Primary actions remain reachable and all interactive targets meet the 44px minimum.
- The visual system uses Relay tokens and the documented Coss/Base UI boundary.
- No unused runtime dependencies are added.
- Existing Learn, Explore, Operate, design-system, bundle, and accessibility checks remain green.

## Verification plan

1. Add or update focused unit tests for each page’s visible state and primary action.
2. Add Playwright coverage for Learn resume/start, Explore grouped search and no-results recovery, and Operate validation/checks/stale-result states.
3. Verify keyboard traversal and focus restoration for search, currency selection, validation errors, and any mobile action bar.
4. Run accessibility checks at 390px, 768px, 1024px, and 1440px.
5. Run `npm run build`, `npm run check:bundle`, and the existing design-system foundation checks.
6. Inspect the live app in both light and dark themes and confirm the approved visual hierarchy remains intact with real data and empty states.

## Review checkpoint

The visual directions and UX adjustments are approved in conversation. This written spec must be reviewed before creating the execution plan. After written-spec approval, the next step is an ordered implementation plan with testable tasks.
