# Glossary and Navigation Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the glossary as a categorized, responsive card reference and prevent visited-link styling from turning inactive primary navigation blue.

**Architecture:** Keep glossary content in the existing static search index, add a small presentation-only grouping map in `ExplorePage.tsx`, and render grouped semantic definition lists. Keep navigation state in `AppShell.css`; narrow the global visited-link rule so component state wins. No new dependency or route is required.

**Tech Stack:** React 19, TypeScript, React Router, Vitest, Testing Library, CSS custom properties.

## Global Constraints

- Preserve every existing glossary term and definition.
- Preserve filtering and `?term=` deep-link behavior.
- Keep active navigation blue and inactive navigation neutral grey on desktop and mobile.
- Use existing design tokens and no new dependencies.
- Verify with focused tests, full frontend tests, and a production build.

---

### Task 1: Lock the glossary and navigation behavior with failing tests

**Files:**
- Create: `frontend/src/features/explore/ExplorePage.test.tsx`
- Modify: `frontend/src/app-shell/AppShell.test.tsx`

**Interfaces:**
- Tests consume `GlossaryPage` and `AppShell` through `MemoryRouter`.
- Tests produce regression coverage for grouped glossary headings, preserved terms, filtering, deep-link highlighting, and active/inactive navigation classes.

- [ ] **Step 1: Write the failing glossary tests**

```tsx
describe("GlossaryPage", () => {
  it("groups terms into scan-friendly reference sections", () => {
    renderGlossary();

    expect(screen.getByRole("heading", { name: "Identifiers" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Correspondent banking" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Tracking & messaging" })).toBeVisible();
    expect(screen.getByText("BIC", { selector: "dt" })).toBeVisible();
  });

  it("shows the filtered result count and keeps no-results feedback actionable", async () => {
    const user = userEvent.setup();
    renderGlossary();
    const filter = screen.getByRole("searchbox", { name: "Filter glossary terms" });

    await user.type(filter, "checksum");
    expect(screen.getByText("1 term")).toBeVisible();
    expect(screen.getByText("MOD-97", { selector: "dt" })).toBeVisible();

    await user.clear(filter);
    await user.type(filter, "does-not-exist");
    expect(screen.getByText(/No terms match/i)).toBeVisible();
  });

  it("highlights a term addressed by the search deep link", () => {
    renderGlossary("/app/explore/glossary?term=IBAN");
    expect(screen.getByText("IBAN", { selector: "dt" }).closest(".glossary-entry"))
      .toHaveClass("glossary-entry--highlighted");
  });
});
```

- [ ] **Step 2: Add navigation state assertions**

```tsx
it("keeps inactive desktop destinations neutral while the current route is active", () => {
  renderShell("/explore/glossary");
  const nav = screen.getByLabelText("Primary navigation");
  expect(nav.querySelector('a[href="/app/explore"]')).toHaveClass("app-shell__nav-link--active");
  expect(nav.querySelector('a[href="/app/learn"]')).not.toHaveClass("app-shell__nav-link--active");
});
```

- [ ] **Step 3: Run the focused tests and verify they fail for the missing grouped/count behavior**

Run: `cd frontend && npm test -- --run src/features/explore/ExplorePage.test.tsx src/app-shell/AppShell.test.tsx`

Expected: the new glossary assertions fail because the current page has a flat list and no result count; existing AppShell tests continue to pass.

### Task 2: Implement categorized glossary presentation

**Files:**
- Modify: `frontend/src/features/explore/ExplorePage.tsx:231-286`
- Modify: `frontend/src/features/explore/ExplorePage.css:134-190`

**Interfaces:**
- `GlossaryPage` continues to consume `GLOSSARY_TERMS: Array<[string, string]>`.
- A local `GLOSSARY_GROUPS` map defines ordered categories and term membership for presentation only.

- [ ] **Step 1: Add the ordered grouping map and grouped render path**

```tsx
const GLOSSARY_GROUPS = [
  { id: "identifiers", label: "Identifiers", terms: ["BIC", "SWIFT code", "IBAN", "MOD-97"] },
  { id: "correspondent-banking", label: "Correspondent banking", terms: ["Nostro", "Vostro", "Correspondent bank", "Intermediary bank", "SSI"] },
  { id: "tracking-messaging", label: "Tracking & messaging", terms: ["UETR", "gpi", "MT103", "pacs.008"] },
];
```

Build a lookup from `GLOSSARY_TERMS`, filter it once, and append any ungrouped terms to `Other payment terms`. Render each category as a `section` with an `h2` and `dl`, preserving the existing term/definition semantics and highlighted class.

- [ ] **Step 2: Add the result count and empty state**

Render `1 term`/`N terms` beside the filter label when results exist. When no results exist, render a bordered empty state containing the query and a short instruction to clear or broaden the search.

- [ ] **Step 3: Run focused tests and verify they pass**

Run: `cd frontend && npm test -- --run src/features/explore/ExplorePage.test.tsx src/app-shell/AppShell.test.tsx`

Expected: all focused tests pass.

- [ ] **Step 4: Style the grouped card grid responsively**

Use existing tokens for category spacing, subtle surface backgrounds, border radii, and action-surface highlighting. Set `.glossary-grid` to two columns at desktop widths and one column below 768px. Keep card definitions readable and ensure long terms/definitions wrap without horizontal overflow.

### Task 3: Fix visited navigation colour precedence

**Files:**
- Modify: `frontend/src/design-system/global.css:61-70`
- Modify: `frontend/src/app-shell/AppShell.css:74-111`

**Interfaces:**
- Global anchors retain their visited distinction outside navigation.
- `.app-shell__nav-link` and `.app-shell__mobile-link` own their inactive and active colors regardless of visited state.

- [ ] **Step 1: Narrow the global visited selector**

Change the global rule from a broad `a:not(.relay-btn):visited` selector to a selector that excludes shell navigation links, leaving the rest of the application’s visited-link behavior intact.

- [ ] **Step 2: Add explicit visited-state rules for shell links**

Set `.app-shell__nav-link:visited` and `.app-shell__mobile-link:visited` to their neutral token, then set the active variants’ visited colors to the action token so route state always wins.

- [ ] **Step 3: Run navigation tests and the full frontend suite**

Run: `cd frontend && npm test -- --run src/app-shell/AppShell.test.tsx && npm test -- --no-file-parallelism`

Expected: all frontend tests pass with no warnings.

### Task 4: Verify the live route and build output

**Files:**
- Modify: none.

**Interfaces:**
- The running Vite dev server serves the updated glossary at `/app/explore/glossary`.

- [ ] **Step 1: Run the production build**

Run: `cd frontend && npm run build`

Expected: TypeScript and Vite build complete successfully.

- [ ] **Step 2: Smoke-test the live glossary route**

Open `http://localhost:5173/app/explore/glossary`, confirm the three category headings, two-column cards, result count, and grey inactive navigation. Enter `checksum`, confirm one result, then enter an unmatched query and confirm the designed empty state.

- [ ] **Step 3: Inspect the final diff**

Run: `git diff -- frontend/src/features/explore/ExplorePage.tsx frontend/src/features/explore/ExplorePage.css frontend/src/app-shell/AppShell.css frontend/src/design-system/global.css frontend/src/features/explore/ExplorePage.test.tsx frontend/src/app-shell/AppShell.test.tsx`

Expected: only the approved glossary presentation, navigation precedence, tests, and plan/spec documentation are included.
