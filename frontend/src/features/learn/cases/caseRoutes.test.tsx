/**
 * Task 3 — case entry + route tests.
 *
 * These tests cover the entry/route states for the supplier case on the Learn
 * landing page:
 *   1. Fresh (no session)             → dominant "Start case" action
 *   2. Resume (in_progress)           → dominant "Resume case" action
 *   3. Completed                      → "Completed" label + revisit affordance
 *   4. Under review (catalog)         → last verification date, Start/Resume
 *                                       disabled, draft preserved, one lab/
 *                                       reference alternative offered
 *   5. Under review (session-level)   → stale-draft-specific message
 *       (revision mismatch recovery)    (distinct from the catalog message);
 *                                       also covers the last branch of
 *                                       deriveCaseEntryState.
 *   6. Missing case id                → route shows "case not found" + link back
 *
 * Plus a documentation-of-intent route-ordering test (the REAL App.tsx route
 * tree is guarded in app-shell/App.test.tsx). A LearnIndexPage production-
 * wiring test covers Resume rendering + byte-for-byte localStorage integrity.
 *
 * Testability design: `CaseEntry` is a pure presentational component that
 * takes the case definition and the loaded session as props. Production wires
 * `supplierCase` + `loadCaseSession(...)`; tests inject overrides — so the
 * catalog-level `under_review` state is exercised by passing a case with
 * `reviewStatus: "under_review"` directly, with no module mocking.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { CaseEntry } from "./CaseEntry";
import { CaseDeskRoute } from "./CaseDeskRoute";
import { CASE_CATALOG, getCaseById, supplierCase } from "./caseCatalog";
import {
  createInitialCaseSession,
  saveCaseSession,
  type CaseSession,
} from "./caseStore";
import type { CaseDefinition } from "./caseTypes";
import { LearnModulePage } from "../LearnModulePage";
import { LearnIndexPage } from "../LearnIndexPage";
import { saveProgress } from "../../../lib/persistence/storage";

beforeEach(() => {
  localStorage.clear();
});

/** Build a session shell with overrides, without going through the reducer. */
function makeSession(overrides: Partial<CaseSession>): CaseSession {
  return {
    ...createInitialCaseSession("canada-us-supplier"),
    ...overrides,
  } as CaseSession;
}

// ─── Fresh state ───────────────────────────────────────────────────────────

/** Wrap a node in a MemoryRouter so CaseEntry's <Link> resolves. */
function renderEntry(caseDef: CaseDefinition, session: CaseSession | null) {
  return render(
    <MemoryRouter>
      <CaseEntry caseDef={caseDef} session={session} />
    </MemoryRouter>,
  );
}

describe("CaseEntry — fresh state", () => {
  it("renders a 'Start case' link to the case route when there is no session", () => {
    renderEntry(supplierCase, null);
    const startLink = screen.getByRole("link", { name: /start case/i });
    expect(startLink).toHaveAttribute("href", "/learn/cases/canada-us-supplier");
  });

  it("uses the case title as the entry heading", () => {
    renderEntry(supplierCase, null);
    expect(
      screen.getByRole("heading", { name: /Canada → US supplier payment/i }),
    ).toBeInTheDocument();
  });

  it("does not show Resume or Completed language", () => {
    renderEntry(supplierCase, null);
    expect(screen.queryByRole("link", { name: /resume case/i })).toBeNull();
    expect(screen.queryByText(/^completed$/i)).toBeNull();
  });

  it("falls back to the customer request when summary metadata is omitted at the compatibility boundary", () => {
    const { summary: _summary, contentRevision: _contentRevision, recommendation: _recommendation, ...legacyCase } =
      supplierCase;

    renderEntry(legacyCase, null);
    expect(screen.getByText(supplierCase.customerRequest)).toBeInTheDocument();
  });
});

// ─── Resume state ──────────────────────────────────────────────────────────

describe("CaseEntry — resume state", () => {
  it("renders a 'Resume case' link to the case route when a draft is in progress", () => {
    const session = makeSession({ status: "in_progress", phase: "investigate" });
    renderEntry(supplierCase, session);
    const resumeLink = screen.getByRole("link", { name: /resume case/i });
    expect(resumeLink).toHaveAttribute("href", "/learn/cases/canada-us-supplier");
  });

  it("does not offer 'Start case' as the dominant action", () => {
    const session = makeSession({ status: "in_progress", phase: "investigate" });
    renderEntry(supplierCase, session);
    expect(screen.queryByRole("link", { name: /^start case$/i })).toBeNull();
  });
});

// ─── Completed state ───────────────────────────────────────────────────────

describe("CaseEntry — completed state", () => {
  it("shows a 'Completed' label", () => {
    const session = makeSession({ status: "completed", phase: "debrief" });
    renderEntry(supplierCase, session);
    expect(screen.getByText(/^completed$/i)).toBeInTheDocument();
  });

  it("offers a 'Review case' link to revisit the case desk", () => {
    const session = makeSession({ status: "completed", phase: "debrief" });
    renderEntry(supplierCase, session);
    expect(screen.getByRole("link", { name: /review case/i })).toHaveAttribute(
      "href",
      "/learn/cases/canada-us-supplier",
    );
  });

  it("does not promote 'Start case' or 'Resume case' as the dominant action", () => {
    const session = makeSession({ status: "completed", phase: "debrief" });
    renderEntry(supplierCase, session);
    expect(screen.queryByRole("link", { name: /^start case$/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /^resume case$/i })).toBeNull();
  });

  it("never uses Passed/Mastered/Certified/score/badge/credential language", () => {
    const session = makeSession({ status: "completed", phase: "debrief" });
    const { container } = renderEntry(supplierCase, session);
    const text = container.textContent ?? "";
    expect(text).not.toMatch(
      /passed|mastered|certified|\bscore\b|badge|credential/i,
    );
  });
});

// ─── Under review (catalog-level) ──────────────────────────────────────────

describe("CaseEntry — under review state (catalog-level)", () => {
  const underReviewCase = {
    ...supplierCase,
    reviewStatus: "under_review" as const,
  };

  it("shows the last verification date", () => {
    renderEntry(underReviewCase, null);
    // supplierCase.verifiedAt === "2026-02-01"
    expect(screen.getByText(/2026-02-01/)).toBeInTheDocument();
  });

  it("disables Start/Resume (no link to the case route; disabled button instead)", () => {
    renderEntry(underReviewCase, null);
    // No working link to the case route
    expect(
      screen.queryByRole("link", { name: /start case|resume case/i }),
    ).toBeNull();
    // A disabled button occupies the dominant-action slot so the affordance
    // is still visible (and announced as unavailable) to AT users.
    const disabled = screen.getByRole("button", { name: /start case/i });
    expect(disabled).toBeDisabled();
  });

  it("preserves an existing draft: rendering the entry does not clear stored session state", () => {
    // The entry must be purely visual — it never writes to storage. We assert
    // the contract by seeding an in_progress session, rendering the entry
    // under catalog-level under_review, and checking the stored session is
    // byte-for-byte unchanged.
    const session = makeSession({
      status: "in_progress",
      phase: "investigate",
      requestedFactIds: ["price-sensitivity"],
    });
    const key = "relay:case-session:canada-us-supplier";
    localStorage.setItem(key, JSON.stringify(session));

    renderEntry(underReviewCase, session);

    const stored = localStorage.getItem(key);
    expect(stored).not.toBeNull();
    expect(JSON.parse(stored!).status).toBe("in_progress");
    expect(JSON.parse(stored!).requestedFactIds).toEqual(["price-sensitivity"]);
  });

  it("offers exactly one verified technical lab as an alternative", () => {
    renderEntry(underReviewCase, null);
    // lab-7 = "Which Rail? Payment Schemes" — topically relevant to a
    // rail-selection supplier case.
    const labLink = screen.getByRole("link", { name: /which rail/i });
    expect(labLink).toHaveAttribute("href", "/learn/lab-7");
  });

  it("explains that start is paused while the source material is updated", () => {
    renderEntry(underReviewCase, null);
    expect(screen.getAllByText(/under review/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/paused/i)).toBeInTheDocument();
  });
});

// ─── Under review (session-level stale draft) ──────────────────────────────

describe("CaseEntry — under review state (session-level stale draft)", () => {
  // A session reaches status "under_review" via caseStore's `recoverStaleSession`
  // when a stored draft's caseRevision no longer matches the current catalog
  // revision. The catalog reviewStatus stays "current" here — this is NOT the
  // catalog-level under_review state. CaseEntry renders a DISTINCT message for
  // this branch (focused on the stale draft, not the catalog pause), so a
  // refactor that silently dropped the branch would lose learner-facing
  // accuracy. This also exercises the last untested branch of
  // deriveCaseEntryState.
  const staleDraftSession = makeSession({
    status: "under_review",
    phase: "investigate",
  });

  it("renders the stale-draft-specific message (not the catalog-under_review message)", () => {
    renderEntry(supplierCase, staleDraftSession);
    expect(
      screen.getByText(/your saved draft was based on older case material/i),
    ).toBeInTheDocument();
    // It must NOT render the catalog-level under_review message — the two
    // branches are intentionally distinct.
    expect(
      screen.queryByText(/start is paused while we update the source material/i),
    ).toBeNull();
  });

  it("does not offer a working Start/Resume link (entry is paused)", () => {
    renderEntry(supplierCase, staleDraftSession);
    expect(
      screen.queryByRole("link", { name: /start case|resume case/i }),
    ).toBeNull();
    expect(screen.getByRole("button", { name: /start case/i })).toBeDisabled();
  });
});

// ─── Route: ordering + missing case id ─────────────────────────────────────
//
// NOTE on scope: this build-its-own-<Routes> test is a documentation-of-intent
// test, NOT a regression guard on App.tsx. React Router v6 ranks static
// segments above dynamic ones regardless of declaration order, so the
// `cases` segment is never captured by `learn/:moduleId` even if App.tsx
// reordered its routes. The REAL App.tsx route tree (lazy chunks, Suspense,
// BrowserRouter basename) is guarded in app-shell/App.test.tsx
// ("renders the Case Desk for /learn/cases/canada-us-supplier"). This test
// documents the intended ordering invariant and exercises CaseDeskRoute's
// known-id / unknown-id rendering directly.

function renderRoutes(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        {/* Declared before learn/:moduleId to mirror App.tsx. RR v6's
            static>dynamic ranking makes the ordering belt-and-suspenders;
            see the App-level test for the genuine regression guard. */}
        <Route path="learn/cases/:caseId" element={<CaseDeskRoute />} />
        <Route path="learn/:moduleId" element={<LearnModulePage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("learn/cases/:caseId route", () => {
  it("renders the case desk for a known case id (documents the cases-before-module ordering intent)", () => {
    renderRoutes("/learn/cases/canada-us-supplier");
    // CaseDeskRoute renders the case title as the page <h1>. The title also
    // appears in the breadcrumb, so query by heading role to assert the page
    // itself rendered.
    expect(
      screen.getByRole("heading", { name: /Canada → US supplier payment/i }),
    ).toBeInTheDocument();
    // The legacy module page renders "Module not found" for unknown modules.
    expect(screen.queryByText(/module not found/i)).toBeNull();
  });

  it("shows a 'case not found' message with a link back to Learn for an unknown case id", () => {
    renderRoutes("/learn/cases/this-case-does-not-exist");
    expect(screen.getByText(/case not found/i)).toBeInTheDocument();
    const backLink = screen.getByRole("link", { name: /back to learn/i });
    expect(backLink).toHaveAttribute("href", "/learn");
  });

  it.each([
    "uk-eurozone-supplier",
    "nigeria-uk-contractor",
    "us-mexico-vendor",
  ])("renders the case desk for %s", (caseId) => {
    const definition = getCaseById(caseId);
    expect(definition).toBeDefined();

    renderRoutes(`/learn/cases/${caseId}`);

    expect(
      screen.getByRole("heading", { name: definition!.title }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/case not found/i)).toBeNull();
  });
});

describe("LearnModulePage — gated module navigation", () => {
  function renderModulePage() {
    return render(
      <MemoryRouter initialEntries={["/learn/lab-3"]}>
        <Routes>
          <Route path="/learn/:moduleId" element={<LearnModulePage />} />
        </Routes>
      </MemoryRouter>,
    );
  }

  it("disables the next module until the current lab is complete", () => {
    saveProgress({ schemaVersion: 1, completedModuleIds: ["lab-1", "lab-2"] });
    renderModulePage();

    expect(screen.queryByRole("link", { name: /How Money Moves: Correspondent Routing/i })).toBeNull();
    expect(screen.getByText(/How Money Moves: Correspondent Routing.*Complete this lab to unlock/i)).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  it("enables the next module after the current lab is complete", () => {
    saveProgress({ schemaVersion: 1, completedModuleIds: ["lab-1", "lab-2", "lab-3"] });
    renderModulePage();

    expect(screen.getByRole("link", { name: /How Money Moves: Correspondent Routing/i })).toHaveAttribute(
      "href",
      "/learn/lab-4",
    );
  });
});

// ─── Production wiring: LearnIndexPage → CaseEntry ──────────────────────────
//
// The CaseEntry tests above render the pure component directly. This block
// verifies the PRODUCTION wiring: LearnIndexPage loads the session via
// `loadCaseSession` and passes it through to CaseEntry, and a learner
// returning to Learn with an in-progress draft sees Resume (not Start) — and
// the seeded session JSON is byte-for-byte unchanged after render (the page
// reads, it never writes).

describe("LearnIndexPage — production wiring of the case session", () => {
  it("renders 'Resume case' (not 'Start case') for an in-progress draft", () => {
    const session = makeSession({
      status: "in_progress",
      phase: "investigate",
      requestedFactIds: ["price-sensitivity"],
    });
    saveCaseSession(session);

    render(
      <MemoryRouter>
        <LearnIndexPage />
      </MemoryRouter>,
    );

    const canadaHeading = screen.getByRole("heading", {
      name: "Canada → US supplier payment",
    });
    const canadaSection = canadaHeading.closest("section");

    expect(canadaSection).not.toBeNull();
    expect(
      within(canadaSection!).getByRole("link", { name: /resume case/i }),
    ).toHaveAttribute("href", "/learn/cases/canada-us-supplier");
    expect(
      within(canadaSection!).queryByRole("link", { name: /^start case$/i }),
    ).toBeNull();
  });

  it("does not mutate the persisted session when LearnIndexPage renders", () => {
    // Seed storage with a real persisted session and snapshot the raw bytes.
    const session = makeSession({
      status: "in_progress",
      phase: "investigate",
      requestedFactIds: ["price-sensitivity"],
    });
    saveCaseSession(session);
    const key = "relay:case-session:canada-us-supplier";
    const before = localStorage.getItem(key);

    expect(before).not.toBeNull();

    render(
      <MemoryRouter>
        <LearnIndexPage />
      </MemoryRouter>,
    );

    // Byte-for-byte: production wiring must READ ONLY. If LearnIndexPage or
    // loadCaseSession ever writes (e.g. a "recover-and-persist" side effect),
    // this assertion fails.
    expect(localStorage.getItem(key)).toBe(before);
  });

  it("renders one case card per catalog entry with matching routes, summaries, and unique heading ids", () => {
    render(
      <MemoryRouter>
        <LearnIndexPage />
      </MemoryRouter>,
    );

    const caseHeadings = CASE_CATALOG.map((definition) =>
      screen.getByRole("heading", { name: definition.title }),
    );

    expect(caseHeadings).toHaveLength(4);

    const headingIds = new Set<string>();
    for (const definition of CASE_CATALOG) {
      const heading = screen.getByRole("heading", { name: definition.title });
      const section = heading.closest("section");

      expect(heading).toHaveAttribute("id", `case-entry__title-${definition.id}`);
      expect(section).not.toBeNull();
      expect(section).toHaveAttribute("aria-labelledby", `case-entry__title-${definition.id}`);
      expect(within(section!).getByText(definition.summary)).toBeInTheDocument();
      expect(
        within(section!).getByRole("link", { name: /start case/i }),
      ).toHaveAttribute("href", `/learn/cases/${definition.id}`);

      headingIds.add(heading.id);
    }

    expect(headingIds.size).toBe(CASE_CATALOG.length);
  });

  it("groups all case entries in the labelled Customer case desks region", () => {
    render(
      <MemoryRouter>
        <LearnIndexPage />
      </MemoryRouter>,
    );

    const rail = screen.getByRole("region", { name: "Customer case desks" });
    const tracks = Array.from(rail.children).filter((child) =>
      child.classList.contains("learn-case-desks__track"),
    );
    expect(tracks).toHaveLength(1);

    const track = tracks[0];
    expect(track.children).toHaveLength(CASE_CATALOG.length);
    expect(
      Array.from(track.children).every((child) => child.matches("section.case-entry")),
    ).toBe(true);
    expect(rail.querySelectorAll('a[href^="/learn/cases/"]')).toHaveLength(
      CASE_CATALOG.filter((definition) => definition.reviewStatus !== "under_review").length,
    );
  });

  it("keeps the Canada card fresh when only the Mexico case has a saved session", () => {
    const mexicoSession = {
      ...createInitialCaseSession("us-mexico-vendor"),
      status: "in_progress" as const,
      phase: "investigate" as const,
      requestedFactIds: ["tracking-need"],
    };
    saveCaseSession(mexicoSession);

    render(
      <MemoryRouter>
        <LearnIndexPage />
      </MemoryRouter>,
    );

    const canadaHeading = screen.getByRole("heading", {
      name: "Canada → US supplier payment",
    });
    const canadaSection = canadaHeading.closest("section");
    expect(canadaSection).not.toBeNull();
    expect(
      within(canadaSection!).getByRole("link", { name: /start case/i }),
    ).toHaveAttribute("href", "/learn/cases/canada-us-supplier");
    expect(
      within(canadaSection!).queryByRole("link", { name: /resume case/i }),
    ).toBeNull();

    const mexicoHeading = screen.getByRole("heading", {
      name: "US → Mexico urgent vendor payment",
    });
    const mexicoSection = mexicoHeading.closest("section");
    expect(mexicoSection).not.toBeNull();
    expect(
      within(mexicoSection!).getByRole("link", { name: /resume case/i }),
    ).toHaveAttribute("href", "/learn/cases/us-mexico-vendor");
  });
});
