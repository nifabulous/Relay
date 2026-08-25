# Relay Overview — Adaptive Command Center

Date: 2026-08-21

Branch: `codex/coss-slice-2`

Status: Amended design spec; execution plan pending review

## Decision

Redesign `/app` using Option A, **Adaptive Command Center**.

The Overview should answer “what should I do next?” immediately. It will keep one dominant adaptive action, make learning context visible without a dashboard mosaic, turn secondary destinations into compact quick routes, and make recent activity easier to scan.

The redesign is a composition change over the existing Overview data model. It does not introduce a new backend contract or replace the AppShell navigation.

## Current foundation

`OverviewPage` already owns the data needed for this direction:

- `selectPrimaryAction` chooses the first-visit, resume, next-module, or prepare-payment action.
- `computeProgress` provides completed count, total count, percentage, and next module.
- Practice state provides streak, due reviews, and whether today’s practice is complete.
- Local learner state provides recent activity and badges.
- `/api/health` provides the low-priority system inventory line.

The implementation should preserve these sources and their behavior. The existing navigation hover work is separate and must not be folded into this redesign.

The current Coss foundation is also available and must be used within the boundary defined below: it provides the semantic theme bridge, token aliases, and class-name utility, but does not require generated Coss components on this page.

## Goals

1. Make the adaptive primary action the first visual decision on desktop and mobile.
2. Give progress, streak, review due, and badges a compact “Learning Pulse” context.
3. Replace the current equal-weight utility cards with a lighter quick-route strip.
4. Make recent activity read as a timeline/feed rather than a generic bordered block.
5. Preserve Relay’s calm, precise visual language in both light and dark themes.
6. Keep the page useful at 390px, 768px, 1024px, and 1440px widths.
7. Preserve semantic labels, keyboard navigation, visible focus, reduced-motion behavior, and 44px interactive targets.

## Non-goals

- No backend, database, or API changes.
- No change to `selectPrimaryAction` priority, destinations, or hrefs.
- No new learner persistence format or recommendation engine.
- No AppShell navigation, tutor, preferences, or simulation-banner redesign.
- No new runtime icon or UI dependencies.
- No decorative hero artwork, gradients, charts, shadows, or promotional card mosaic.

## Information architecture

The page order remains deliberately linear:

```text
Overview header
└── Adaptive action + Learning Pulse
    ├── Quick routes
    ├── Recent activity
    └── Low-priority system inventory
```

### 1. Overview header

Use an explicit page heading:

- Heading: `Overview`
- Supporting copy: `Your payment routing learning hub.`

The shell remains responsible for the Relay brand. The Overview heading should not compete with the shell brand or tutor/preferences controls.

### 2. Adaptive action and Learning Pulse

At 1024px and wider, render a two-column region:

- The adaptive action occupies the larger column.
- Learning Pulse occupies the narrower column.
- The action remains visually dominant through size, copy, and the filled primary button—not through decorative effects.

The adaptive action keeps the existing `selectPrimaryAction` result:

- First visit: `Explore how payments move` linking to `/app/explore?intro=1`.
- Most recent unfinished work: the existing resume destination.
- Incomplete curriculum: the existing next-module destination.
- Complete curriculum: `/operate/prepare`.

The action title, supporting copy, and CTA label are deterministic by action kind. Engineers must use this copy contract rather than inventing per-state marketing language:

| Action kind | Title | Supporting copy | CTA label | Destination |
|---|---|---|---|---|
| `explore_intro` | `Explore how payments move` | `Start with an illustrative payment flow.` | `Explore how payments move` | `/app/explore?intro=1` |
| `resume_learn` | `Continue learning` | `Pick up the lesson you were last working on.` | `Continue learning` | `/app/learn` |
| `resume_operate` | `Resume payment preparation` | `Continue the simulated payment you started.` | `Resume payment preparation` | `/app/operate` |
| `next_learn` | `Continue to the next module` | `Build on your progress with the next lesson.` | `Continue to next module` | `/app/learn/:moduleId` |
| `prepare_payment` | `Prepare a simulated payment` | `Apply what you learned to a complete payment route.` | `Prepare a simulated payment` | `/operate/prepare` |

The destination values in the table are the existing router destinations. `:moduleId` means the selected module id returned by `computeProgress`; it is not a literal URL segment. The CTA remains one link, even when the action title and CTA label match.

The action surface contains:

- A small `NEXT ACTION` eyebrow.
- A clear action title derived from the selected action.
- One short explanatory sentence that describes what will happen after activation.
- The existing `.overview__cta` primary link, retained as the only primary CTA.
- A compact progress cue when it helps explain the action; it must not become a second competing progress section.

> **Implementation amendment (2026-08-22):** the fixed `NEXT ACTION` eyebrow shipped as
> per-kind stage pills instead (e.g. "Start here" for `explore_intro`, "Continue" stages for
> resume/next kinds) — same position and role, but the label names the stage rather than a
> constant string. Recorded here so the contract matches what shipped.

Learning Pulse contains grouped rows for:

- Overall module progress and percentage.
- Current practice streak.
- Reviews due this week or the existing review-due link.
- Earned badges, when present.

Zero-value rows should not create noisy empty statistics. For example, a zero streak may be omitted, while `0 / 16 modules completed` remains visible because it establishes the learner’s starting point.

At 768px–1023px, the two regions may remain side by side only when both retain readable minimum widths. Otherwise they stack in action-first order. At 390px, they always stack.

### 3. Quick routes

Keep the four existing destinations and copy:

| Label | Destination | Purpose |
|---|---|---|
| Search | `/app/explore` | Find banks, corridors, and terms |
| Directory | `/app/explore/banks` | Browse banks |
| Track | `/app/operate` | Prepare or track a payment |
| Practice | `/app/learn/practice` | Run today’s drill |

The visual treatment changes from equal-weight region cards to a compact action strip:

- Each link remains a real router link.
- Each link has a clear label and a short supporting line.
- Links share a consistent row height but do not use promotional icon tiles.
- Hover, focus, and pressed states use existing Relay tokens.
- The strip may wrap at tablet widths and stacks in document order on narrow mobile.

### 4. Recent activity

Keep the existing local activity source and relative-time behavior. Recompose the output as a scan-friendly feed:

- Each item has a visible type label (`Module` or `Tool`).
- The activity label remains the primary text.
- Relative time remains visible and aligned to the trailing edge on wide layouts.
- Completed/progress meaning must not rely on color alone.
- Empty state copy remains contextual for first visit versus returning users.

On mobile, each activity item becomes a two-row layout so the label and time never collide or force horizontal scrolling.

### 5. System inventory

Keep the health-derived bank, corridor, and SSI counts as a quiet secondary line below activity when the request succeeds. It must not occupy a dashboard card or compete with the action.

The health query remains non-blocking. A health failure must not hide the adaptive action, Learning Pulse, routes, or activity.

## Overview state matrix

Every region has an intentional visible state. Async data must not replace the page with a blank shell or block the primary action.

| Region | Initial/loading | Empty or zero | Partial/degraded | Ready/success |
|---|---|---|---|---|
| Adaptive action | Render immediately from local learner state; no page-level skeleton. | First visit shows the `explore_intro` copy and the zero-progress pulse. | Missing optional timestamps fall back to the next incomplete module. | Render the selected action kind, exact copy contract, and one CTA. |
| Learning Pulse | Progress renders immediately; the badges row may remain reserved while its request is pending. | Show `0 / 16 modules completed`; omit zero streak and zero review rows; show no empty badge container. | Badge request failure leaves progress and practice rows intact; the badge row is omitted without an error taking over the page. | Show progress, non-zero practice context, and earned badges when available. |
| Quick routes | Static links render with the page; they do not wait for health or badge requests. | Never empty; all four destinations remain available. | A destination’s downstream failure is handled on its destination page, not by disabling the route here. | Four real links with labels, supporting lines, and visible interaction states. |
| Recent activity | Render the section heading and reserve the feed region without a loading spinner for local state. | First visit: `No activity yet. Start by exploring how payments move.` Returning visit: `No activity yet. Your recent simulations and learning will appear here.` | Corrupt or unavailable local activity degrades to the contextual empty state; it must not throw or hide the page. | Render newest-first activity with type, label, and relative time. |
| System inventory | Omit the low-priority line while health is loading. | If the health response contains zero records, show the returned zero counts as text. | On health error, show `System inventory is temporarily unavailable.` as a quiet non-blocking line; do not show a blank bordered region or block retries elsewhere. | Show bank, corridor, and SSI counts as a quiet secondary line. |

The matrix is a rendering contract. Tests should assert user-visible copy and region presence/absence, not implementation details such as query-library status names.

## Visual direction

Use the existing design contract and tokens:

- Canvas and surfaces come from `tokens.css`.
- Use thin structural borders and bounded regions with existing radius tokens.
- Use the action color only for the primary action, selected emphasis, progress, and links that need emphasis.
- Do not introduce shadows, gradients, decorative icon circles, or new visual dependencies.
- Preserve the current light/dark token parity.
- The primary region should feel spacious and asymmetrical; the lower sections should be denser and more utilitarian.
- Icons are optional. If used, reuse an existing project-owned icon treatment or a text/arrow affordance; do not add a runtime package for this page.

The page should feel modern because of hierarchy, restraint, and responsiveness—not because every block becomes a card.

## Coss and Base UI boundary

Relay is using Coss now as a styling and token bridge, not as a wholesale component generator.

- `frontend/src/design-system/coss-theme.css` maps Coss semantic names to Relay’s authoritative tokens.
- `frontend/src/design-system/tokens.css` remains the source of truth for colors, typography, spacing, radius, motion, and light/dark parity.
- `frontend/src/lib/coss/cn.ts` may be used when conditional class composition makes the Overview markup clearer.
- Overview production markup should continue to use Relay-owned classes and shared Relay controls. Do not add Tailwind utility soup to this page solely to signal Coss adoption.
- Base UI remains the behavior layer for future popovers, dialogs, and focus-managed surfaces. This Overview redesign only needs links and existing controls, so it should not introduce a new Base UI primitive.
- Do not add `class-variance-authority`, `lucide-react`, or generated Coss components unless a concrete Overview requirement is added and the dependency is justified by that requirement.

This boundary keeps visual consistency with the Coss foundation while preserving Relay’s product vocabulary and the existing dependency contract.

## Responsive and accessibility contract

### Desktop: 1440px and 1024px

- Content remains bounded by the existing content maximum.
- Adaptive action is visually dominant in the first viewport.
- Learning Pulse is readable without truncation.
- Quick routes use a compact horizontal arrangement when space allows.
- Activity time and labels remain aligned without overlap.

### Tablet: 768px

- No horizontal page overflow.
- Hero columns stack when their minimum readable widths cannot be preserved.
- Quick routes wrap cleanly.
- All links retain at least 44px height.

### Mobile: 390px × 844px

- Order is action, Learning Pulse, quick routes, activity, system inventory.
- Primary CTA becomes full width.
- Progress bar has a usable minimum width and remains visually associated with its label.
- Activity labels wrap naturally; timestamps do not overlap.
- No horizontal scrolling is required to discover content.

### Interaction states

- Every link has default, hover, focus-visible, and active/pressed treatment.
- Focus-visible treatment is not removed by the redesign.
- Hover does not make the active navigation treatment ambiguous.
- Transitions use existing motion tokens and collapse under `prefers-reduced-motion: reduce`.
- Loading or missing health data does not block the page.

## Implementation boundary

Expected files:

- `frontend/src/features/overview/OverviewPage.tsx`: restructure the page sections and preserve existing data/query behavior.
- `frontend/src/features/overview/OverviewPage.css`: add the adaptive grid, pulse rows, quick-route strip, activity feed layout, and responsive rules.
- `frontend/src/features/overview/OverviewPage.test.tsx`: add semantic structure and state assertions while preserving the existing backup-panel guard.
- `frontend/e2e/overview.spec.ts`: verify the primary action, quick-route destinations, responsive bounds, and key visible labels.

No other production files should change unless the implementation discovers a genuinely shared primitive gap. Any such change must be called out before expanding scope.

## Acceptance criteria

- `/app` renders an explicit Overview heading and supporting copy.
- Exactly one `.overview__cta` remains visible as the primary action.
- The CTA href remains the value selected by `selectPrimaryAction`.
- Progress, streak, review due, and badges appear in one Learning Pulse region without duplicating the old full-width context block.
- Search, Directory, Track, and Practice remain real links with their existing destinations.
- Recent activity and its empty state remain visible and readable.
- Health data remains secondary and non-blocking.
- The page has no horizontal overflow at 390px or 768px.
- Light and dark themes retain readable contrast and the existing token contract.
- The implementation follows the Coss and Base UI boundary without adding unused runtime dependencies.
- Existing Overview, learner-state, design-system, and bundle checks remain green.

## Verification

Before implementation is considered complete:

1. Run the focused Overview unit tests.
2. Run the Overview and learner-state Playwright tests at desktop and 390px widths.
3. Run the design-system foundation tests, including the existing hover assertion.
4. Run the frontend production build and bundle budget check.
5. Inspect the live `/app` route at 1440px and 390px, including first-visit empty activity and a populated learner state.

## Review checkpoint

This document describes the approved Option A direction but does not authorize implementation until the written spec is reviewed. After approval, the next step is an execution plan with ordered, testable tasks.
