/**
 * Task 3 — case entry + route tests.
 *
 * These tests cover the five required entry/route states for the supplier case
 * on the Learn landing page:
 *   1. Fresh (no session)        → dominant "Start case" action
 *   2. Resume (in_progress)      → dominant "Resume case" action
 *   3. Completed                 → "Completed" label + revisit affordance
 *   4. Under review (catalog)    → last verification date, Start/Resume
 *                                  disabled, draft preserved, one lab/
 *                                  reference alternative offered
 *   5. Missing case id           → route shows "case not found" + link back
 *
 * Plus a route-ordering guard: `/learn/cases/:caseId` must render the case
 * desk placeholder, NOT the legacy `learn/:moduleId` page.
 *
 * Testability design: `CaseEntry` is a pure presentational component that
 * takes the case definition and the loaded session as props. Production wires
 * `supplierCase` + `loadCaseSession(...)`; tests inject overrides — so the
 * catalog-level `under_review` state is exercised by passing a case with
 * `reviewStatus: "under_review"` directly, with no module mocking.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { CaseEntry } from "./CaseEntry";
import { CaseDeskRoute } from "./CaseDeskRoute";
import { supplierCase } from "./caseCatalog";
import { createInitialCaseSession, type CaseSession } from "./caseStore";
import type { CaseDefinition } from "./caseTypes";
import { LearnModulePage } from "../LearnModulePage";

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

// ─── Route: ordering + missing case id ─────────────────────────────────────

function renderRoutes(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        {/* MUST be declared before learn/:moduleId so 'cases' is never
            captured as a module id. (React Router v6 ranks static segments
            above dynamic ones, but the explicit ordering is a regression
            guard and matches the App.tsx declaration.) */}
        <Route path="learn/cases/:caseId" element={<CaseDeskRoute />} />
        <Route path="learn/:moduleId" element={<LearnModulePage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("learn/cases/:caseId route", () => {
  it("renders the case desk for a known case id (not swallowed by learn/:moduleId)", () => {
    renderRoutes("/learn/cases/canada-us-supplier");
    // CaseDeskRoute renders the case title as the page <h1>. The title also
    // appears in the breadcrumb, so query by heading role to assert the page
    // itself rendered.
    expect(
      screen.getByRole("heading", { name: /Canada → US supplier payment/i }),
    ).toBeInTheDocument();
    // The legacy module page renders "Module not found" for unknown modules.
    // If route ordering regresses (cases captured as moduleId), this text
    // would appear instead.
    expect(screen.queryByText(/module not found/i)).toBeNull();
  });

  it("shows a 'case not found' message with a link back to Learn for an unknown case id", () => {
    renderRoutes("/learn/cases/this-case-does-not-exist");
    expect(screen.getByText(/case not found/i)).toBeInTheDocument();
    const backLink = screen.getByRole("link", { name: /back to learn/i });
    expect(backLink).toHaveAttribute("href", "/learn");
  });
});
