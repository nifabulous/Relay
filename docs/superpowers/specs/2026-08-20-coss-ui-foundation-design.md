# Coss UI Foundation and Relay Theme Bridge

**Status:** Proposed
**Date:** 2026-08-20
**Related:** #41, merged PR #40

## Context

Relay now has Relay-owned behavior wrappers around Base UI (`RelayDialog` and
`RelayPopover`). The next design-system step is to use Coss UI for visual
primitives and styling while keeping behavior ownership explicit.

Coss is distributed primarily through the shadcn registry rather than as one
runtime package. Its existing-project setup uses `@coss/ui`, while `@coss/style`
adds the broader theme and token layer. Coss components are built for Tailwind
CSS v4 and use CSS variables that can be customized to match an existing design
system.

For this project, “broad installation” means installing the registry and theme
foundation repo-wide. Individual Coss source components are still added when a
Relay consumer needs them; unused generated components are not committed.

Sources:

- https://coss.com/ui/docs/get-started
- https://coss.com/ui/docs/styling
- https://coss.com/ui/docs/components/menu

## Goals

- Establish Coss as the visual component source for new and migrated UI.
- Add Tailwind CSS v4 without replacing Relay’s semantic token names.
- Create a Coss-to-Relay token bridge that works in light and dark themes.
- Preserve `RelayDialog`, `RelayPopover`, and future Relay wrappers as the
  behavior boundary for accessibility, focus, dismissal, and responsive state.
- Improve the visual consistency of controls, surfaces, menus, and dialogs.
- Close the Preferences integration coverage gap before using that surface as
  the first Coss visual migration.
- Keep the eager-shell bundle within the existing budget.

## Non-goals

- Replacing Base UI with Radix, another behavior library, or unwrapped Coss
  behavior primitives.
- Converting every existing component in one change.
- Renaming Relay’s established `--color-*`, `--space-*`, `--radius-*`, and
  typography tokens.
- Introducing decorative shadows, gradients, or motion that conflicts with
  Relay’s design rules.
- Adding Coss components that do not have an immediate Relay consumer.

## Architecture

### Ownership

| Concern | Owner |
| --- | --- |
| Focus, dismissal, portal, positioning | Base UI through Relay wrappers |
| Visual component source | Coss registry components |
| Product semantics and public APIs | Relay-owned components |
| Theme values and accessibility contrast | Relay tokens |
| Utility-class generation | Tailwind CSS v4 |

Coss components are adopted as source components, not imported as opaque
application behavior. Relay wrappers may compose them, but consumers continue
to depend on Relay APIs such as `RelayPopover` rather than directly on Coss or
Base UI parts.

### Source layout

Keep generated or adapted Coss components inside the design-system boundary:

```text
frontend/src/design-system/
├── behavior/       # RelayDialog, RelayPopover, future behavior wrappers
├── coss/           # Coss-derived visual components and adapted styles
├── Button.tsx      # Stable Relay product API
├── Button.css
├── tokens.css      # Relay tokens plus the Coss variable bridge
└── global.css
```

The Coss registry configuration should point generated components at
`src/design-system/coss`, and shared helpers should live under
`src/lib/coss`. Existing Relay components should not import from generated
paths directly when a stable Relay component API is appropriate.

### Tailwind integration

Add Tailwind CSS v4 using the Vite integration required by the project. Import
theme and utility layers into the existing global stylesheet while preserving
Relay’s current reset and base element rules. Do not enable a second competing
reset. The implementation must verify the final CSS order so Relay’s explicit
accessibility and typography rules remain authoritative.

### Token bridge

Add Coss/shadcn-compatible semantic aliases in `tokens.css` rather than
duplicating palette values. The bridge must be defined for both the light root
and the two existing dark-theme paths:

| Coss semantic variable | Relay source |
| --- | --- |
| `--background` | `--color-canvas` |
| `--foreground` | `--color-ink` |
| `--card` / `--popover` | `--color-surface` |
| `--card-foreground` / `--popover-foreground` | `--color-ink` |
| `--primary` | `--color-action` |
| `--primary-foreground` | `--color-on-action` |
| `--secondary` / `--muted` | `--color-surface-2` |
| `--secondary-foreground` | `--color-ink-strong` |
| `--muted-foreground` | `--color-ink-muted` |
| `--accent` | `--color-action-surface` |
| `--accent-foreground` | `--color-action` |
| `--destructive` | `--color-danger` |
| `--destructive-foreground` | `--color-on-danger` |
| `--border` | `--color-border` |
| `--input` | `--color-border-strong` |
| `--ring` | `--color-action` |
| `--success`, `--warning`, `--info` | corresponding Relay semantic colors |

The bridge is an adapter, not a second source of truth. Contrast tests should
exercise the Relay source tokens and representative Coss aliases in both
themes.

## Migration slices

### Slice 0 — Verification foundation

Before visual migration, add the missing `PreferencesMenu` integration tests
tracked in #41. The tests must cover the final `role="menu"` output, accessible
labelling, first-item focus, ArrowUp/ArrowDown movement, Escape restoration,
outside dismissal, real menu controls, and the portalled positioner contract.

The 390px bounds check remains browser-level because jsdom does not calculate
layout geometry. The live QA script should assert that the menu stays within
the viewport and that `document.documentElement.scrollWidth` does not exceed
the viewport width.

### Slice 1 — Coss foundation

- Add the registry configuration and Tailwind v4 integration.
- Add only the dependencies required by the first Coss components.
- Add the token bridge and verify light/dark parity.
- Add a small Coss-derived `cn`/class-variance helper if the generated
  components require it.
- Keep the existing Relay Button API working during the transition.

### Slice 2 — Visual primitives

Adopt Coss-derived visual treatments behind stable Relay APIs, in this order:

1. `Button` — preserve `primary`, `secondary`, `danger`, loading, anchor, and
   disabled behavior.
2. Surface/panel treatment — use opaque borders and elevation through tokens,
   without decorative shadows.
3. Menu treatment — apply Coss menu spacing, item states, separators, and
   switch/radio presentation to the existing Preferences content while
   retaining `RelayPopover` behavior.
4. Dialog/tutor treatment — refine the existing `RelayDialog` surface after
   the menu pilot is stable.

### Slice 3 — Cross-surface audit

Audit the application shell, Overview, Explore, Operate, Learn, Settings, and
tutor surfaces in light and dark themes. Migrate only components that benefit
from the new treatment and leave specialized payment-route visuals intact.

## Interaction and accessibility requirements

- Relay wrappers remain the only public behavior API for dialogs and popovers.
- Existing focus-visible rules remain active and must not be overwritten by
  Tailwind preflight or generated component styles.
- Interactive controls retain a minimum 44px target where required by Relay’s
  design rules.
- Menus retain accessible roles, labels, checked states, and keyboard behavior.
- Reduced-motion support must continue to work through both the OS media query
  and Relay’s user preference attribute.
- Light and dark themes must preserve the existing contrast test guarantees.
- No status or selected state may rely on color alone.

## Verification

Every migration slice must run:

- focused unit and integration tests for changed components;
- the full Vitest suite;
- TypeScript/Vite production build;
- `check:base-ui-boundary`;
- `check:bundle` without silently raising the budget;
- contrast tests in light and dark themes;
- browser QA at the default viewport and 390px mobile width.

The Coss foundation is ready to land only when the token bridge does not
regress existing surfaces, the Preferences integration tests are present, and
the production bundle remains within budget.

## Rollout and rollback

Land the foundation and each visual migration as separate commits or PRs so a
visual regression can be isolated. If Tailwind ordering or Coss styles regress
the existing app, remove the Coss layer import and revert the migrated Relay
component styles; the Base UI behavior wrappers and Relay token source remain
usable independently.
