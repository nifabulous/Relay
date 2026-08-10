# Learn Customer Case Desk Horizontal Rail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the four Customer Case Desk entries on the Learn landing page into a responsive, keyboard-accessible horizontal scrolling rail.

**Architecture:** Keep `CaseEntry` as a pure stateful presentation component. Add a labelled collection and dedicated flex track in `LearnIndexPage`, then implement the rail entirely in `LearnPage.css` with native overflow and mandatory scroll-snap. Extend the existing Learn index production-wiring tests to lock the collection structure and preserve one card/link per catalog entry.

**Tech Stack:** React, TypeScript, React Testing Library, Vitest, CSS custom properties, Playwright/browser smoke verification, Vite production build.

## Global Constraints

- The rail remains scrollable on desktop, tablet, and mobile.
- Existing Start, Resume, Review, Completed, and Under review behavior is unchanged.
- No JavaScript carousel state, Previous/Next controls, pagination, or auto-rotation.
- Use `scroll-snap-type: x mandatory` and preserve normal tab order.
- Keep Technical labs and Daily Practice below the rail in their current order.
- Use existing design tokens; do not add decorative gradients or shadows.
- Do not commit changes automatically; leave the working tree for user review.

---

### Task 1: Lock the labelled collection contract with tests

**Files:**
- Modify: `/Users/olaniyi.oladokun/Leatherback/swift-routing/frontend/src/features/learn/cases/caseRoutes.test.tsx:408-447` (the LearnIndexPage catalog-rendering tests)

**Interfaces:**
- Consumes: `LearnIndexPage`, `CASE_CATALOG`, and the existing MemoryRouter test harness.
- Produces: A regression test requiring one labelled `Customer case desks` region containing one `.case-entry` and one case route link for every catalog entry.

- [ ] **Step 1: Add the failing structural assertion**

Add a test beside the existing catalog-rendering test:

```tsx
it("groups all case entries in the labelled Customer case desks region", () => {
  render(
    <MemoryRouter>
      <LearnIndexPage />
    </MemoryRouter>,
  );

  const rail = screen.getByRole("region", { name: "Customer case desks" });
  expect(rail.querySelectorAll(".case-entry")).toHaveLength(CASE_CATALOG.length);
  expect(rail.querySelectorAll('a[href^="/learn/cases/"]')).toHaveLength(
    CASE_CATALOG.length,
  );
});
```

- [ ] **Step 2: Run the focused test and confirm it fails**

Run:

```bash
cd /Users/olaniyi.oladokun/Leatherback/swift-routing/frontend
npm test -- --run src/features/learn/cases/caseRoutes.test.tsx
```

Expected: the existing Learn page renders the cards, but `getByRole("region", { name: "Customer case desks" })` fails because the collection wrapper does not exist yet.

### Task 2: Add the labelled rail wrapper

**Files:**
- Modify: `/Users/olaniyi.oladokun/Leatherback/swift-routing/frontend/src/features/learn/LearnIndexPage.tsx:43-50`

**Interfaces:**
- Consumes: `caseEntries` and the existing `CaseEntry` props.
- Produces: A `section.learn-case-desks[aria-label="Customer case desks"]` containing a `.learn-case-desks__track` with the unchanged `CaseEntry` children.

- [ ] **Step 1: Replace the direct map with the collection wrapper**

Replace the current direct render:

```tsx
{caseEntries.map(({ definition, session }) => (
  <CaseEntry key={definition.id} caseDef={definition} session={session} />
))}
```

with:

```tsx
<section
  className="learn-case-desks"
  aria-label="Customer case desks"
>
  <div className="learn-case-desks__track">
    {caseEntries.map(({ definition, session }) => (
      <CaseEntry key={definition.id} caseDef={definition} session={session} />
    ))}
  </div>
</section>
```

- [ ] **Step 2: Run the focused test and confirm it passes**

Run the same command from Task 1. Expected: the new region test and all existing case-route tests pass.

### Task 3: Implement the responsive horizontal rail CSS

**Files:**
- Modify: `/Users/olaniyi.oladokun/Leatherback/swift-routing/frontend/src/features/learn/LearnPage.css:415-540`

**Interfaces:**
- Consumes: `.learn-case-desks`, `.learn-case-desks__track`, and existing `.case-entry` styles.
- Produces: A contained, native-scrollable flex row with responsive card widths, partial next-card preview, mandatory snap, and focus-safe positioning.

- [ ] **Step 1: Add the rail container and track rules before `.case-entry`**

Add:

```css
.learn-case-desks {
  min-width: 0;
}

.learn-case-desks__track {
  display: flex;
  align-items: stretch;
  gap: var(--space-4);
  min-width: 0;
  overflow-x: auto;
  overflow-y: hidden;
  padding: 0 var(--space-1) var(--space-2);
  scroll-padding-inline: var(--space-4);
  scroll-snap-type: x mandatory;
  overscroll-behavior-x: contain;
}

.learn-case-desks__track > .case-entry {
  flex: 0 0 min(22rem, 84vw);
  min-width: 0;
  scroll-margin-inline: var(--space-4);
  scroll-snap-align: start;
}

@media (min-width: 769px) {
  .learn-case-desks__track > .case-entry {
    flex-basis: min(28rem, 32vw);
  }
}
```

These rules keep the page itself within its content width while making only
the rail scrollable. The mobile width shows most of one card and part of the
next; the desktop width fits multiple cards while leaving the remaining cards
reachable by scrolling.

- [ ] **Step 2: Run the focused test suite**

Run:

```bash
cd /Users/olaniyi.oladokun/Leatherback/swift-routing/frontend
npm test -- --run src/features/learn/cases/caseRoutes.test.tsx src/features/learn/cases/accessibility.test.tsx
```

Expected: all focused tests pass, including existing accessible card-region assertions.

### Task 4: Verify visual, interaction, and build behavior

**Files:**
- No source files expected unless verification identifies a defect.

**Interfaces:**
- Consumes: the completed Learn index rail.
- Produces: verified desktop/mobile behavior and a clean production build.

- [ ] **Step 1: Check desktop layout in the running dev server**

Open `http://127.0.0.1:5173/app/learn` at a desktop viewport and verify:

1. The four cards are in one horizontal row.
2. Multiple cards are visible and part of another card is visible at the rail edge.
3. Scrolling the rail does not move the page horizontally.
4. Technical labs and Daily Practice remain below the rail.

- [ ] **Step 2: Check mobile layout and keyboard focus**

At a narrow viewport, verify:

1. One card is mostly visible with a preview of the next card.
2. Touch/drag or horizontal wheel scrolling reaches all four cards.
3. Tabbing through card actions brings the focused card into view without clipping.
4. No horizontal overflow is present outside `.learn-case-desks__track`.

- [ ] **Step 3: Run the production checks**

Run:

```bash
cd /Users/olaniyi.oladokun/Leatherback/swift-routing/frontend
npm test -- --run
npm run build
```

Expected: the full frontend test suite passes and Vite produces a successful production build.
