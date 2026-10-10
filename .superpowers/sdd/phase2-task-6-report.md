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
