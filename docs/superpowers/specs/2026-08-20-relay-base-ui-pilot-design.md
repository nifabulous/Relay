# Relay Base UI Pilot Design

**Status:** Reviewed and approved for implementation
**Date:** 2026-08-20

## Decision summary

Relay will adopt an unstyled behavior primitive layer before adopting any visual
component registry. The first candidate is Base UI, installed as an internal
implementation detail and wrapped by Relay-owned components that consume the
existing design tokens. The first pilot is the floating tutor panel.

Watermelon UI and Coss UI remain optional sources for visual ideas or isolated
copy-paste components. Neither becomes a second design system or a required
runtime dependency in this phase. There will be no Tailwind migration.

## Context

Relay is a React 19 + Vite application with a token-driven CSS design system.
The canonical primitives live under `frontend/src/design-system/`, and feature
styles consume `frontend/src/design-system/tokens.css`. The app already has a
floating tutor launcher and panel on the current main line. The launcher owns
availability probing, open state, Escape handling, and focus restoration; the
panel owns tutor conversation state and API interaction.

The current tutor surface deliberately remains non-modal: learners can see and
interact with the page behind it, especially on mobile. That behavior must not
change as part of the primitive adoption.

## Goals

- Centralize difficult interaction behavior such as focus, Escape handling,
  portals, controlled open state, and outside-press behavior.
- Keep Relay's existing visual language: tokens, plain CSS, thin borders, no
  decorative shadows, and the existing responsive breakpoint.
- Hide the chosen primitive library behind Relay-owned APIs.
- Prove the approach on one meaningful surface before expanding the dependency.
- Preserve the tutor's existing API contract, availability states, context
  handling, history limits, feedback behavior, and lazy loading.

## Non-goals

- Replacing the existing `Button`, `StatusChip`, `AsyncRegion`, or payment-route
  components.
- Migrating Relay to Tailwind, shadcn/ui, CSS-in-JS, or a new icon system.
- Redesigning the tutor's content, prompt policy, or backend configuration.
- Adding both Base UI and Radix to the same application.
- Installing Watermelon UI or Coss UI as application-wide dependencies.
- Rebuilding every page around a new component library.

## NOT in scope

- Replacing existing Relay primitives — the pilot proves behavior composition
  without broad component churn.
- Migrating to Tailwind, shadcn/ui, CSS-in-JS, or a visual registry — Relay's
  token-driven CSS remains canonical.
- Rebuilding Preferences or bank lookup controls — those are follow-up pilots
  only after this wrapper proves useful.
- Adding a second behavior library or changing tutor backend/API behavior — the
  pilot is intentionally Base UI-only and frontend-only.

## What already exists

- `AppShell` already owns the tutor-open layout reservation; the launcher keeps
  notifying it once per controlled transition.
- `FloatingTutorLauncher` already owns availability probing, contextual state,
  lazy loading, and the persistent trigger; the refactor reuses all of them.
- `TutorPanel` already owns conversation state, API interaction, and the
  one-shot lazy-content heading focus; the wrapper does not duplicate them.
- Existing tutor, shell, build, and bundle tests provide the regression base;
  the pilot adds only the wrapper contract tests and reopened-focus coverage.

## Architecture

### Dependency boundary

Add Base UI to `frontend/package.json` and lock it in the frontend lockfile.
Feature code must not import Base UI directly. The first Relay-owned behavior
wrapper should live beside the existing primitives, for example:

```
frontend/src/design-system/behavior/
  RelayDialog.tsx
  RelayDialog.css
```

Only wrappers required by the pilot are added. A future `RelayPopover` or
`RelayCombobox` is introduced when a feature needs it, not speculatively.

The wrapper owns the Base UI composition, accessibility labeling contract,
portal placement, and controlled-state shape. Consumers own content and Relay
tokens. Base UI's `className`, state attributes, and focus hooks are used only
inside the wrapper so the rest of Relay is insulated from a library API change.
For this pilot, the popup's accessible name comes from the existing
`TutorPanel` heading via its stable `headingId`; the wrapper must not add a
second title or make `TutorPanel` import Base UI.

### Tutor pilot

Refactor `FloatingTutorLauncher` to use a controlled Relay dialog wrapper around
the existing lazy `TutorPanel`.

- Keep `FloatingTutorLauncher` as the pilot's source of truth for `open`; pass
  that state into `RelayDialog` and let the wrapper emit one `onOpenChange`
  notification per transition. The existing shell callback remains a
  notification for layout reservation, not a second state owner.
- Use the primitive in non-modal mode so page interaction, scrolling, and the
  current mobile behavior remain available.
- Disable pointer dismissal so outside pointer and focus interaction does not
  close the tutor. The tutor closes only through Escape, the launcher, the
  explicit close control, or availability loss.
- Keep the existing launcher button as the trigger and keep it visible when the
  tutor is unavailable; availability messaging remains unchanged.
- Render the lazy panel through a portal to avoid local stacking-context and
  overflow problems.
- Preserve the current right-docked desktop geometry and bottom-cleared mobile
  geometry in `FloatingTutorLauncher.css`.
- Keep an explicit close button inside the popup.
- Use the primitive's final-focus behavior to return focus to the launcher on
  close. Because the panel is lazy-loaded, retain `TutorPanel`'s one-shot
  heading-focus effect as the initial-focus fallback after Suspense resolves;
  the wrapper may focus a stable popup fallback before that content exists.
  Remove only the manual event listeners and focus timing that the wrapper
  actually replaces.
- Do not add a backdrop or scroll lock. The current surface is intentionally
  non-modal.
- Keep `TutorPanel` responsible for conversation rendering and API state. The
  wrapper must not know about tutor requests, history, or provider failures.

### Interaction flow

```
[launcher button]
       │ controlled open / close
       ▼
[RelayDialog / Base UI Root]
       ├── non-modal + pointer dismissal disabled
       ├── portal → [tutor-floating-panel, z-index 150]
       ├── final focus → [launcher button]
       └── lazy Suspense → [TutorPanel heading focus]
                              │
                              └── conversation/API state stays in TutorPanel
```

### Styling and tokens

All new styles use existing Relay variables from `tokens.css`. No new color,
shadow, radius, spacing, or breakpoint values may be introduced for the pilot.
The portal and popup must be checked against both light and dark themes, the
reduced-motion preference, and the mobile navigation layer.

## Failure modes

| Failure mode | Test coverage | Error handling | User-visible result |
|---|---|---|---|
| Base UI closes the non-modal popup on outside interaction | `RelayDialog.test.tsx` | `disablePointerDismissal` | Tutor stays open while page remains usable |
| Lazy content is not mounted when initial focus runs | wrapper focus test + launcher lazy-focus test | popup receives stable fallback focus; child retries once on mount | Keyboard user lands on a usable tutor surface |
| Availability changes while the tutor is open | existing launcher availability tests | controlled close path clears shell reservation | Tutor closes and the disabled explanation remains visible |
| Portal changes stacking order | Chromium geometry QA | explicit existing z-index contract | Tutor stays below top bar/preferences and above page/mobile nav |
| Base UI dependency increases initial bundle | `npm run check:bundle` | 200 KB gzip gate | Build fails before an oversized shell ships |

## Parallelization

Sequential implementation, no parallelization opportunity. The wrapper, launcher,
and shared shell callback all touch the same interaction boundary and must be
verified in dependency order.

## Implementation Tasks

Synthesized from this review; all tasks are complete on the current branch.

- [x] **T1 (P1)** — Add exact `@base-ui/react` dependency and the Relay-owned
  controlled dialog wrapper with focused contract tests.
- [x] **T2 (P1)** — Refactor the floating tutor launcher onto the wrapper while
  preserving lazy loading, non-modal interaction, focus restoration, labeling,
  shell layout notification, and existing tutor behavior.
- [x] **T3 (P2)** — Enforce the eager bundle budget and direct-import boundary in
  the implementation handoff and verification commands.

## Verification

The pilot is complete only when all of the following pass:

- `RelayDialog.test.tsx` covers the wrapper contract: controlled open/close,
  Escape, outside interaction, focus restoration, accessible naming, and the
  non-modal contract, including that outside interaction leaves the tutor open.
  `FloatingTutorLauncher.test.tsx` keeps the feature-level focus tests for both
  the lazy-content path and a reopened/already-loaded path.
- Existing tutor tests continue to cover availability, lazy loading, context
  reset, request cancellation, history truncation, and failure messaging.
- Browser QA verifies desktop and mobile layouts, dark mode, reduced motion,
  keyboard-only use, and the tutor's stacking order above page content.
- `npm test -- --no-file-parallelism` passes from `frontend/`.
- `npm run build` passes from `frontend/`.
- `npm run check:bundle` passes from `frontend/`, and the eager-shell gzip
  delta is recorded in the implementation handoff. If the pilot threatens the
  200 KB budget, lazy-load the behavior boundary before expanding scope.
- No feature imports Base UI directly and no Tailwind files or configuration are
  added.

### Implementation handoff

The documented eager-shell baseline was 168,087 bytes gzip. The pilot measures
187,628 bytes gzip, a 19,541-byte increase, leaving 16.8 KB under the 200 KB
gate. Keep this delta visible in future behavior-wrapper changes.

## Rollout and follow-up

After the tutor pilot passes, evaluate whether the same wrapper pattern helps
with the Preferences menu, bank lookup controls, or future comboboxes. Add
those wrappers one at a time and keep the public Relay API stable.

Only after the behavior layer is proven should we evaluate a visual registry.
Coss UI is the preferred visual source for app-like controls because it is built
on Base UI. Watermelon UI may supply visual references or isolated blocks, but
each adopted component must be translated to Relay tokens and reviewed for
accessibility, motion, bundle cost, and responsive behavior.

## Risks and mitigations

- **Portal stacking:** verify the portal against the top bar, preferences menu,
  mobile navigation, and tutor launcher; add a deliberate root stacking context
  rather than escalating arbitrary z-index values.
- **Behavior change:** preserve non-modal operation explicitly and add tests for
  background interaction and page scrolling.
- **Dependency drift:** keep imports behind Relay wrappers and pin the package in
  the lockfile.
- **Visual drift:** reject any component that introduces unreviewed colors,
  shadows, motion, or radii instead of translating it to Relay tokens.
