# Task 13 — Payment tracking restyle

## What changed

- Restyled the tracking result into responsive Lifecycle and Payment cards, with a two-column treatment from 1024px and a stacked mobile layout.
- Added explicit completed/current lifecycle phase labels and updated timeline markers while preserving backend event ordering and pacing behavior.
- Reworked the payment summary into labeled Sent, Final, and Fees rows; retained UETR, terminal status, StatusChip semantics, URL synchronization, controls, and notices.
- Updated the page supporting copy to match the tracking lifecycle framing.
- All styling uses existing design tokens, structural borders, responsive rules, and reduced-motion handling.

## Files changed

- `frontend/src/features/operate/tracking/TrackingPage.tsx`
- `frontend/src/features/operate/tracking/PaymentTimeline.tsx`
- `frontend/src/features/operate/tracking/TrackingPage.css`

## Verification

- `npm test -- --run src/features/operate/tracking/PaymentTimeline.test.tsx src/features/operate/tracking/TrackingPage.test.tsx` — 2 files, 31 tests passed.
- `npm test -- --run` — 95 files, 1388 tests passed.
- `npm run build` — TypeScript check and Vite production build passed (existing chunk-size warning only).
- `git diff --check` — passed.

## Self-review / concerns

- Checked mobile stacking and narrow timeline rows at 390px, two-column breakpoint at 1024px, token-only colors, visible labels, and status text/icon/color treatment.
- No selector or test changes were required.
- No known concerns.
