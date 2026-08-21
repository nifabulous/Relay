# Coss UI Foundation and Relay Theme Bridge

**Status:** Proposed — revised after plan review
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
- https://tailwindcss.com/docs/installation/using-vite
- https://tailwindcss.com/docs/preflight

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
- Replacing Relay’s Instrument Sans and IBM Plex Mono typography with Coss’s
  default font choices.
- Introducing decorative shadows, gradients, or motion that conflicts with
  Relay’s design rules.
- Generating unused Coss source components that do not have an immediate Relay
  consumer.

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

The repository uses npm and `frontend/package-lock.json`. Coss is treated as a
registry/source foundation, not as an opaque runtime package: the implementation
must commit the registry configuration, the required Tailwind/Coss build
dependencies, and only the generated components used by a Relay consumer.

### Tailwind integration

Add Tailwind CSS v4 with the official Vite integration: install
`tailwindcss` and `@tailwindcss/vite`, add `tailwindcss()` to the existing Vite
plugin list, and keep the generated CSS in the existing global stylesheet
pipeline. [Tailwind Vite installation](https://tailwindcss.com/docs/installation/using-vite)

Do not import Tailwind’s default Preflight. Relay already owns its reset and
base element rules, and Tailwind Preflight would reset headings, lists, and
borders globally. Import only the Tailwind theme and utilities layers, in the
documented order, and keep utility scanning opt-in to the Coss source directory for this foundation slice. General `frontend/src` scanning begins with the first real Relay-owned Coss consumer. [Tailwind Preflight](https://tailwindcss.com/docs/preflight)

Keep Relay’s base rules after the Tailwind layers so focus-visible behavior,
typography, spacing, and reset rules remain authoritative. The foundation slice
must include a cascade test or browser check that proves headings, lists,
buttons, borders, and focus rings remain unchanged outside migrated components.

Preserve `--font-ui: Instrument Sans` and `--font-mono: IBM Plex Mono`. Do not
import Coss font helpers or the default Inter/Geist/Cal Sans choices during this
foundation work.

Relay’s theme state uses `data-theme` plus `prefers-color-scheme`, not a `.dark`
class. Migrated components must use semantic variables so system dark mode works
without Tailwind variants. If a component genuinely needs a variant, define a
Relay-specific explicit-dark variant for `[data-theme="dark"]`; do not use
unmapped `dark:` utilities.

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
| `--radius`, `--radius-sm`, `--radius-md` | `--radius-control` |
| `--radius-lg`, `--radius-xl` | `--radius-region` |
| `--success`, `--warning`, `--info` | corresponding Relay semantic colors |

The bridge is an adapter, not a second source of truth. Contrast tests should
exercise the Relay source tokens and representative Coss aliases in both
themes. Coss’s optional shadow/elevation defaults must not be imported as
visual effects; Relay uses opaque borders and tokenized surface steps instead
of decorative shadows.

## Migration slices

### Slice 0 — Verification foundation

Before visual migration, add the missing `PreferencesMenu` integration tests
tracked in #41. Add the unit/integration coverage to
`frontend/src/app-shell/PreferencesMenu.test.tsx` and add a browser test at
`frontend/e2e/preferences-menu.spec.ts`, using the existing Playwright config.
The tests must cover the final `role="menu"` output, accessible labelling,
first-item focus, ArrowUp/ArrowDown movement, Escape restoration, outside
dismissal, real menu controls, and the portalled positioner contract.

The 390px bounds check remains browser-level because jsdom does not calculate
layout geometry. The Playwright test should run at the existing
`case-mobile-390` viewport and assert that the menu’s right edge stays within
the viewport and that `document.documentElement.scrollWidth` does not exceed
the viewport width.

### Slice 1 — Coss foundation

- Add the registry configuration and Tailwind v4 integration.
- Add only the dependencies required by the first Coss components to npm and
  update `frontend/package-lock.json`.
- Add the token bridge and verify light/dark parity.
- Add a small Coss-derived `cn`/class-variance helper if the generated
  components require it.
- Do not add Coss Menu or Dialog behavior components in this slice.
- Keep the existing Relay Button API working during the transition.

### Slice 2 — Visual primitives

Adopt Coss-derived visual treatments behind stable Relay APIs, in this order:

1. `Button` — preserve `primary`, `secondary`, `danger`, loading, anchor, and
   disabled behavior.
2. Surface/panel treatment — use opaque borders and elevation through tokens,
   without decorative shadows.
3. Menu treatment — apply Coss menu spacing, item states, separators, and
   switch/radio presentation to the existing Preferences content while
   retaining `RelayPopover` behavior. Do not nest or replace the existing menu
   with Coss Menu behavior.
4. Dialog/tutor treatment — refine the existing `RelayDialog` surface after
   the menu pilot is stable.

### Slice 3 — Cross-surface audit

Audit the application shell, Overview, Explore, Operate, Learn, Settings, and
tutor surfaces in light and dark themes. Migrate only components that benefit
from the new treatment and leave specialized payment-route visuals intact.

Each slice lands as its own branch/PR. The first implementation PR is limited
to Slice 0 and Slice 1. Button migration, Preferences styling, tutor styling,
and the cross-surface audit are separate follow-up PRs so CSS regressions can be
bisected and reverted independently.

## Interaction and accessibility requirements

- Relay wrappers remain the only public behavior API for dialogs and popovers.
- Existing focus-visible rules remain active and must not be overwritten by
  Tailwind preflight or generated component styles.
- Coss Menu, Dialog, and other interaction primitives are not public Relay
  APIs; Base UI behavior remains behind Relay wrappers.
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

The first PR must also verify that the Tailwind layer does not change Relay’s
existing fonts, heading hierarchy, list behavior, button reset, border defaults,
or dark-mode selector behavior before any visual component migration lands.

The Coss foundation is ready to land only when the token bridge does not
regress existing surfaces, the Preferences integration tests are present, and
the production bundle remains within budget.

## Rollout and rollback

Land the foundation and each visual migration as separate commits or PRs so a
visual regression can be isolated. If Tailwind ordering or Coss styles regress
the existing app, remove the Coss layer import and revert the migrated Relay
component styles; the Base UI behavior wrappers and Relay token source remain
usable independently.
