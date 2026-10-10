# Phase 2 Task 6 report: landing variants of shared components

## Confirmed class names
- Button: `relay-btn`, `relay-btn--primary|secondary|danger`, `relay-btn--loading`, `relay-btn__spinner` (Button.tsx variantClass map).
- StatusChip: `status-chip`, `status-chip--success|warning|danger|muted|action`, `status-chip__icon`.

## surface-landing placement (found, not added)
Tasks 3 to 5 put `surface-landing` on the route wrapper only, not the page roots:
- Prepare: `div.surface-landing.prepare-payment__lines-route` (PreparePaymentPage.tsx:770)
- Tracking: `div.surface-landing.tracking-page__route` (TrackingPage.tsx:188)
- Atlas: `div.surface-landing.atlas-page__route` (AtlasPage.tsx:226)
I did NOT move it to the page roots: the scope redefines `--muted`, `--font-mono`, `--bg`, `--ink` etc., which the screens' own CSS reads, so a root-level scope would restyle the whole screen (a Phase 3 migration). No page file was modified.

## Shared components the screens use
- Prepare: Button, CheckResult, Recommendation, CorrespondentOptions, LinesRoute, SsiProvenance (StatusChip via children).
- Tracking: Button, AsyncRegion, LinesRoute, PaymentTimeline.
- Atlas: AsyncRegion, LinesRoute, AtlasMap/Table/Panel, plus raw `relay-btn relay-btn--secondary` button.
Inside the three `.surface-landing` wrappers the only rendered component is LinesRoute (own `lines-route__*` classes, native pause button). So Button/StatusChip/heading overrides are ready but not currently reached by any element in scope.
Scoped variants added: Button primary, primary:hover, secondary, secondary:hover; StatusChip (base, success, warning, danger, muted, action, icon); h1-h3 (from the brief).
No scoped variant (not invented): Button danger and loading/spinner, AsyncRegion, CheckResult, Recommendation, CorrespondentOptions, PaymentTimeline, tables, cards. None render inside the scope, and the landing tokens have no on-danger colour.

## Selectors added (all under .surface-landing)
.relay-btn--primary(:hover), .relay-btn--secondary(:hover), h1/h2/h3, .status-chip, .status-chip--{success,warning,danger,muted,action}, .status-chip .status-chip__icon (+ `> svg`; 3-class specificity beats the base `--x .status-chip__icon` rules regardless of load order).

## Tests (contrast.test.ts, "landing scope")
Added: per-selector scoping test (10), "never styles a shared component outside .surface-landing", and contrast pairs in light, dark and black (resolved base+theme tokens): onAcc/accFill, onAcc/accFillHover, ink/surface, ok/warn/bad/muted/accInk on surface, all >= 4.5.
RED (before CSS): `Tests 10 failed | 27 passed` (all ten selector tests failed; the contrast pairs were already green since they only read existing tokens).
GREEN (after CSS): `Tests 37 passed | 58 skipped (95)`.

## Command results
- `npx vitest run src/design-system`: 207 passed, 1 failed. The failure is bundleBudget.test.ts "checks the generated public assets": `existsSync(app/static/relay/index.html)` is false because no production build exists in this worktree. Unrelated to this change.
- `npx vitest run src/features/operate src/features/explore --no-file-parallelism`: 25 files, 266 tests passed.
- `npx tsc --noEmit`: clean (exit 0).


## Fix: landing scope on the three screen roots (phase 2)

Change: `surface-landing` added to the root element of PreparePaymentPage (`prepare-payment`), TrackingPage (`tracking-page`), AtlasPage (`explore atlas`). Route wrappers unchanged. No shared component touched.

Test: `frontend/src/design-system/screenRoots.test.ts` (source assertion via readFileSync, one case per screen root).

RED (before the change):
```
 Test Files  1 failed (1)
      Tests  3 failed (3)
```
GREEN (after):
```
 Test Files  1 passed (1)
      Tests  3 passed (3)
```

Commands:
- `npm run build`: built OK (so the bundle budget test could run).
- `npx vitest run src/design-system src/features/operate src/features/explore`: 38 files passed, 477 tests passed (bundleBudget.test.ts included, passing after the build).
- `npx tsc --noEmit`: exit 0.

### Shared components rendered inside each root, and token exposure
The scope redefines `--font-mono`, `--muted`, `--bg`, `--ink` (plus --ink2, --line, --surface, --acc, --ok, --warn, --bad, --ghost, ...). Scope also overrides `.relay-btn--primary/--secondary`, `h1-h3`, `.status-chip*` explicitly.

Prepare: Button, StatusChip (via CheckResult), CorrespondentOptions, LinesRoute.
Tracking: Button, AsyncRegion, StatusChip (via PaymentTimeline), LinesRoute.
Atlas: AsyncRegion, LinesRoute, and `.relay-btn` classes (Button.css) used directly.

Components that read a redefined token directly:
1. LinesRoute (LinesRoute.css): --font-mono, --ink, --muted (also --ink2, --line, --line2, --surface, --ghost, --acc, --ok, --warn, --bad, --font-sans). It was already inside the scope via the route wrappers, so no change in appearance on these screens.

Components changed only by the scope's explicit overrides (they read --color-* tokens, none of the four): Button (.relay-btn--primary/secondary restyled), StatusChip (.status-chip colours restyled), and headings h1-h3. AsyncRegion and CorrespondentOptions read only --color-* / --space-* tokens and are not changed by the scope.

Non-shared but affected on these screens: global `.mono` class (global.css:76 reads --font-mono) now resolves to Geist Mono inside all three roots; PreparePaymentPage.css and OperateTools.css (imported by Tracking) read the four tokens too.

## Fix: follow the app theme (commit 1f84564)

RED (before CSS change):
```
    416|
    417|   it("follows the app theme set on the document root", () => {
    418|     expect(scopeCss).toMatch(/:root\[data-theme="dark"\]\s+\.surface-l…
       |                      ^
    419|     expect(scopeCss).toMatch(/:root\[data-theme="black"\]\s+\.surface-…
    420|     expect(scopeCss).toMatch(/:root:not\(\[data-theme="light"\]\)\s+\.…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 95 passed (96)
   Start at  20:14:52
   Duration  1.26s (transform 69ms, setup 304ms, import 24ms, tests 16ms, environment 788ms)

```

GREEN:
```

 Test Files  1 passed (1)
      Tests  96 passed (96)
   Start at  20:15:02
   Duration  1.12s (transform 67ms, setup 275ms, import 24ms, tests 13ms, environment 684ms)

```
`npx tsc --noEmit`: exit 0.
Note: the OS-dark block uses `:root:not([data-theme="light"]) .surface-landing` (specificity 0,3,0), equal to the root dark/black forms, which come later and win under an OS-dark setting.


---

# Phase 2 Task 6: remap app tokens inside the landing scope

## Step 1: tokens the screens read
Grep of `var(--x)` over design-system, features/operate, features/explore (css + tsx), intersected with the names defined in tokens.css `:root` (coss-theme.css defines no custom properties; it only maps shadcn names into `@theme inline`).
Remapped (52): --color-action, -action-hover, -action-pressed, -action-surface, -action-border, --color-on-action, --color-on-danger, --color-danger-hover, --color-ink-strong, --color-ink, --color-ink-muted, --color-canvas, --color-surface, -surface-2, -surface-3, --color-border, --color-border-strong, --color-success(+bg,+border), --color-warning(+bg,+border), --color-danger(+bg,+border), --font-ui, --coss-font-sans, --coss-font-heading, --coss-font-mono, --background, --foreground, --card, --card-foreground, --popover, --popover-foreground, --primary, --primary-foreground, --secondary, --secondary-foreground, --accent, --accent-foreground, --muted-foreground, --destructive, --destructive-foreground, --border, --input, --ring, --success, --success-foreground, --warning, --warning-foreground, --info, --info-foreground.
Deliberately not remapped (no landing equivalent, stay on :root): --space-*, --text-*, --leading-*, --tracking-*, --radius-*, --coss-radius-*, --duration-*, --ease, --nav-*, --mobile-*, --floating-*, --sim-banner-height, --reading-measure, --content-max.
Already landing-native (clash names, scope defines them): --font-sans, --font-mono, --muted. Note --muted is a surface in the app and a text colour in the scope; no screen CSS reads it as a surface, so the landing meaning stays.

## Mappings and reasons
- action -> --acc (not --accFill as suggested): --color-action is read as link text in ~20 rules as well as a fill. --accFill (#533AFD) on dark surfaces fails AA as text; --acc (p600 light, p400 dark) passes as text and as fill. hover/pressed -> --accInk (darker in light, lighter in dark, like the app). action-surface -> --accBg, action-border -> --accLine.
- on-action, on-danger -> --surface (not --onAcc): with a fill of --acc, the text must flip in dark (p400 fill needs dark text); --surface is white in light and the dark canvas in dark/black.
- ink-strong -> --ink, ink -> --ink2, ink-muted -> --muted (same roles). canvas -> --bg, surface -> --surface, surface-2 -> --tint, surface-3 -> --cell, border -> --line, border-strong -> --line2.
- success/warning/danger -> --ok/--warn/--bad; their -bg -> --tint (no tinted landing bg exists; hex in every theme so pairs are measurable), danger-bg -> --badBg, danger-border -> --badLine; success/warning-border -> --line2; danger-hover -> --bad (no darker landing token).
- fonts: --font-ui and the coss fonts -> --font-sans / --font-mono.
- shadcn names resolve at :root, so inheriting would keep the old values; each is re-pointed directly at landing tokens (primary -> --acc, secondary -> --tint, accent -> --accBg, destructive -> --bad, border -> --line, input -> --line2, ring -> --acc, info -> --acc, *-foreground -> --ink or --surface as above).

## Cascade check (read, not assumed)
The remap sits in the base `.surface-landing` block between `app-token remap: start/end` markers, every value a `var()` of a landing token. Custom properties substitute at computed-value time on the element that declares them, so the dark/black blocks (`:root[data-theme=...] .surface-landing`, the OS media block, and `.surface-landing[data-theme=...]`), which redefine --surface/--ink/--acc/... on that same element, flow through. The remap is not repeated in them. contrast.test's scopeTokens() resolves base, then theme, then var chains, which is the same order; it passes in all three themes.

## RED (before the block)
`npx vitest run src/design-system/contrast.test.ts`: Test Files 1 failed; Tests 134 failed | 97 passed (231). Failures: "app-token remap markers missing" for every remap test, and "not a hex token: --color-ink-strong=undefined" etc. for every remapped pair.
## GREEN
First attempt after adding the block: 11 failed, because my comment text contained "--accFill:" and the declaration regex read it. Reworded the comment. Then:
`npx vitest run src/design-system/contrast.test.ts`: Test Files 1 passed; Tests 231 passed (231).

## Tests added (contrast.test.ts, "landing scope")
- dynamic MUST_REMAP list (greps the three source trees, intersects tokens.css :root, minus the allowlist above) with one `it` per token, a base-block placement check, a no-hex check on the remap block, and 26 remapped text pairs x 3 themes, all >= 4.5:1.

## Commands
- `npm run build`: built OK.
- `npx vitest run src/design-system`: Test Files 13 passed, Tests 347 passed (347).
- `npx tsc --noEmit`: exit 0.
No shared component file and no :root changed. Files: landing-scope.css, contrast.test.ts.
