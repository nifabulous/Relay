# Relay Base UI Pilot Design

**Status:** Direction approved; written spec pending user review  
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

### Tutor pilot

Refactor `FloatingTutorLauncher` to use a controlled Relay dialog wrapper around
the existing lazy `TutorPanel`.

- Use the primitive in non-modal mode so page interaction, scrolling, and the
  current mobile behavior remain available.
- Keep the existing launcher button as the trigger and keep it visible when the
  tutor is unavailable; availability messaging remains unchanged.
- Render the lazy panel through a portal to avoid local stacking-context and
  overflow problems.
- Preserve the current right-docked desktop geometry and bottom-cleared mobile
  geometry in `FloatingTutorLauncher.css`.
- Keep an explicit close button inside the popup.
- Use the primitive's initial/final focus behavior to focus the tutor heading on
  open and return focus to the launcher on close. Remove only the manual event
  listeners and focus timing that the wrapper replaces.
- Do not add a backdrop or scroll lock. The current surface is intentionally
  non-modal.
- Keep `TutorPanel` responsible for conversation rendering and API state. The
  wrapper must not know about tutor requests, history, or provider failures.

### Styling and tokens

All new styles use existing Relay variables from `tokens.css`. No new color,
shadow, radius, spacing, or breakpoint values may be introduced for the pilot.
The portal and popup must be checked against both light and dark themes, the
reduced-motion preference, and the mobile navigation layer.

## Verification

The pilot is complete only when all of the following pass:

- Unit tests cover controlled open/close state, Escape, outside interaction,
  focus on open, focus restoration, and the non-modal contract.
- Existing tutor tests continue to cover availability, lazy loading, context
  reset, request cancellation, history truncation, and failure messaging.
- Browser QA verifies desktop and mobile layouts, dark mode, reduced motion,
  keyboard-only use, and the tutor's stacking order above page content.
- `npm test -- --no-file-parallelism` passes from `frontend/`.
- `npm run build` passes from `frontend/`.
- No feature imports Base UI directly and no Tailwind files or configuration are
  added.

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
