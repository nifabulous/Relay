# Fix Task 9 review findings report

## Files changed

- `frontend/scripts/check-bundle.mjs` — restored the original default `gzipSync(raw)` measurement.
- `frontend/index.html` — delivers Instrument Sans and IBM Plex Mono through a document-head stylesheet link.
- `frontend/src/design-system/global.css` — removed the now-unneeded external font import and a redundant anchor hover rule; retained explicit Tailwind layers, `source(none)`, and Coss opt-in discovery.
- `frontend/src/design-system/tailwindFoundation.test.ts` — guards document-head font delivery, the default gzip contract, and the removed redundant rule.
- `frontend/src/lib/coss/cn.ts` — uses the standard `clsx` value contract for generated Coss class names.
- `frontend/src/lib/coss/registry.test.ts` — verifies package.json, package-lock root/installed entries, and installed package versions agree for Coss runtime dependencies.
- `frontend/package.json` and `frontend/package-lock.json` — declare `clsx` directly alongside the generated Coss runtime dependencies.

## Verification

- `npx vitest run src/design-system/tailwindFoundation.test.ts src/lib/coss/registry.test.ts src/app-shell/PreferencesMenu.test.tsx` — 23/23 passed.
- `npm run build` — passed.
- `npm run check:bundle` — passed at 204,793 / 204,800 bytes using the original default gzip measurement.
- `npm run check:base-ui-boundary` — passed.
- `git diff --check` — passed.

## Notes

- The repository Playwright runner remains environment-blocked until `.venv/bin/uvicorn` is available. A live 390px browser smoke against the built Vite preview nevertheless passed the equivalent Preferences flow, including focus, arrow-key navigation, Escape dismissal, both navigation paths, and viewport bounds.
- No budget relaxation, compression-level change, Preflight import, token change, or generated Coss component was added.

## Fix Task 9 execution addendum

### TDD RED/GREEN evidence

- The new gzip-contract assertion was RED before implementation: `npm test -- src/design-system/tailwindFoundation.test.ts` reported 1 failed test because `check-bundle.mjs` still contained `gzipSync(raw, { level: 9 })`. After restoring `gzipSync(raw)`, the focused foundation suite was GREEN at 6/6.
- With the restored default measurement, `npm run build && npm run check:bundle` was RED at `204,888` bytes against `204,800` (88 bytes over). The first standards-invalid import-order hypothesis reduced this to `204,811` but produced a Vite warning that `@import` followed generated rules; it was discarded.
- The HTML font-delivery regression was RED before implementation, then GREEN at 6/6 after adding the same Google Fonts stylesheet URL to `frontend/index.html` and removing the CSS `@import`. That artifact measured `204,811` bytes without the Vite warning.
- The redundant-anchor regression was RED at 1 failed test, then GREEN at 7/7 after removing the no-op hover rule. The unchanged default gate then passed at `204,793` bytes, 7 bytes under budget.
- The registry test now compares package.json declarations with package-lock root declarations, package-lock installed entries, and installed package.json versions. It passed at 2/2; `clsx` is declared directly so the helper does not rely on a transitive dependency.

### Final verification

- `npm run build` — passed; Vite transformed 818 modules.
- `npm run check:bundle` — passed with `index-B7Ovq-V7.js` at `196,400` bytes, `jsx-runtime-Cltr0gcK.js` at `3,212` bytes, and `index-CFJ-wdHy.css` at `5,181` bytes; total `204,793 / 204,800` bytes using default `gzipSync(raw)`.
- `npm run check:base-ui-boundary` — passed.
- `npm test -- src/design-system/tailwindFoundation.test.ts src/lib/coss/registry.test.ts` — 2 files, 9 tests passed.
- `npm test` — 90 files, 1,271 tests passed.
- `git diff --check` — passed.

### Concerns and constraints

- Google Fonts remain external and browser-loaded through the document-head stylesheet link. The local eager asset gate intentionally counts built JS/CSS assets only, so this moves the URL out of the counted CSS artifact without removing font delivery.
- Browser/E2E execution remains environment-blocked by the existing missing `.venv/bin/uvicorn` prerequisite; the existing E2E assertions and full unit suite were preserved and the required non-browser checks passed.
- The 7-byte budget headroom is narrow but measured under the required unchanged contract. No budget, compression level, font delivery, Preflight, Tailwind/Coss source discovery, Relay token, or generated-component constraint was relaxed.

### Commit

- Implementation and this report are committed in the final commit reported by the task handoff.
