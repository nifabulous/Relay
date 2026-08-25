# Task 4 — Bank directory restyle

## Implementation

- Reworked `BankDirectoryPage` into a browse-first surface matching the approved bank-directory concept: search field, market/capability/verified filter chips, bordered institution table, capability status pills, responsive pagination footer, and mobile card-style table rows.
- Added five curated rows backed by seeded teaching data with BICs rendered using the mono treatment. Institution rows link to the existing bank detail route.
- Preserved the existing BIC lookup flow, inline SSI results, retry states, examples, and Prepare a payment handoff. Name queries filter the browse rows while valid and BIC-shaped inputs continue through `/api/lookup`.
- Added focused component coverage for the table, route links, row filtering, and capability filtering.
- All new styling uses Relay tokens, provides visible focus states and 44px controls, uses status text + shape + color, and avoids horizontal overflow at mobile widths.

## Files

- `frontend/src/features/explore/ExplorePage.tsx`
- `frontend/src/features/explore/ExplorePage.css`
- `frontend/src/features/explore/ExplorePage.test.tsx`

## Validation

- `npm test -- --run src/features/explore/ExplorePage.test.tsx src/features/explore/ExplorePage.responsive.test.ts`
  - 2 files passed, 38 tests passed.
- `npm test -- --run`
  - 95 files passed, 1,383 tests passed.
- `npm run build`
  - TypeScript check and Vite production build passed. Vite emitted the existing chunk-size warning only.
- `git diff --check`
  - Passed.

## Self-review

- Confirmed no hardcoded color literals were added.
- Confirmed the table remains usable at narrow widths by switching to labelled stacked rows below 768px.
- Confirmed filtered counts and disabled pagination states update from the visible result set.

## Concerns

- The current backend exposes BIC lookup and bounded name search, but not a full browse endpoint. This task therefore uses a small, explicitly curated view of seeded teaching data; BIC lookup remains authoritative for full bank identity and SSI details.

## Commit

`5760a88 feat: restyle bank directory browse surface`

## Review fixes

- Removed the bank-directory search focus `box-shadow` and replaced it with a token-based outline plus border treatment, preserving visible keyboard focus without violating the no-shadows/no-gradients constraint.
- Renamed the combined directory input from `BIC to look up` to `Search bank name or BIC` and updated all focused Explore test queries to match.

### Fix validation

- `npm test -- --run src/features/explore/ExplorePage.test.tsx src/features/explore/ExplorePage.responsive.test.ts`
  - 2 files passed, 38 tests passed.
- `git diff --check`
  - Passed.

### Fix self-review

- Confirmed only the requested focus treatment and accessible label/test selector changes were made; lookup and name-filter behavior are unchanged.
- Confirmed remaining `box-shadow` declarations belong to pre-existing bank lookup/glossary controls outside the bank-directory search fix.
