# Task 5 — Bank detail page restyle

## Implementation

- Reframed the bank detail route with a breadcrumb, institution hero, monogram logo tile, bank name, BIC chip, country identity, and verified status pill.
- Added a responsive two-column profile body: payment-scheme support rows with explicit status chips and an explanatory About section, plus a labeled Institution details card.
- Kept the existing prepare-payment route as the single dominant action and retained branch-resolution messaging, settlement participant identifiers, and settlement note.
- Left published SSI tables, retry behavior, and the heuristic correspondent fallback unchanged after the redesigned profile surface.
- Added token-only responsive styling for 390px, tablet, and desktop layouts with thin structural borders, no shadows/gradients, visible inherited focus states, and no horizontal overflow.

## Files

- `frontend/src/features/explore/BankDetailRoute.tsx`
- `frontend/src/features/explore/ExplorePage.css`

## Verification

- Focused: `npm test -- --run src/features/explore/BankDetailRoute.test.tsx` — **1 file, 21 tests passed**.
- Typecheck/build: `npm run build` — **passed** (Vite build completed; existing chunk-size warning only).
- Full suite: `npm test -- --run` — **95 files, 1,383 tests passed**.
- `git diff --check` — **passed**.

## Self-review

- Confirmed the existing identity, not-found, branch-resolution, SSI, retry, heuristic, and settlement identifier tests remain green.
- Confirmed all new styles use design tokens and route-specific selectors so the compact inline directory result card remains intact.
- Confirmed status meaning is conveyed through text, icon, and color; scheme icons and country flag are decorative and aria-hidden.

## Concerns

- The current lookup schema does not expose institution logos, LEIs, participant counts, or verification dates. The hero therefore uses a deterministic monogram and details show only fields actually supplied by lookup/settlement responses.

## Review fix

- Removed unsupported `Verified` claims from the bank hero and payment-scheme rows. Lookup evidence is limited to BIC, bank name, country, city, and currency, so those statuses now read `Under review` with explanatory copy about currency-derived inference.
- Added focused assertions covering the breadcrumb, hero identity/BIC/country/status, scheme status semantics, institution details, and prepare-payment link without relying on duplicate text matches or layout structure.
- Verification: `npm test -- --run src/features/explore/BankDetailRoute.test.tsx` — **1 file, 22 tests passed**; `git diff --check` — **passed**.

## TypeScript test narrowing fix

- Replaced non-narrowing non-null assertions on `Element.closest()` with a small `closestHTMLElement` helper that throws when the expected ancestor is absent and returns an `HTMLElement` for Testing Library's `within()`.
- Verification: `npm test -- --run src/features/explore/BankDetailRoute.test.tsx` — **1 file, 22 tests passed**; `npm run build` — **passed** (existing chunk-size warning only); `git diff --check` — **passed**.
