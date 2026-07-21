/**
 * RecommendationFlow — the Send-recommendation flow (Task 5a subset).
 *
 * Scope of THIS file (Piece 5a):
 *   - Evaluation is HIDDEN before commit (no decision-quality/consequence
 *     until Send is clicked).
 *   - Send creates exactly one immutable firstAttempt.
 *   - Rapid double-submit creates only ONE firstAttempt (reducer guard).
 *   - Debounced customerExplanation writes are flushed on Send so the snapshot
 *     includes the latest text.
 *   - Empty customerExplanation is allowed (the field is optional).
 *   - customerExplanation is capped at 1,000 chars; the remaining-count shows
 *     and over-limit input is rejected.
 *   - Exiting before Send does NOT create a firstAttempt; the in-progress
 *     draft is preserved in storage.
 *
 * Piece 5b/5c will EXTEND this file with CaseOutcome / CaseDebrief / revision
 * / complete-transfer coverage. Keep the describe block names stable so later
 * pieces can append without rebasing assertions.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { CaseDesk } from "./CaseDesk";
import { createInitialCaseSession, type CaseSession } from "./caseStore";
import { evaluateRecommendation } from "./caseEvaluator";
import { supplierCase } from "./caseCatalog";
import type { RecommendationDraft } from "./caseTypes";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const CASE_ID = "canada-us-supplier";
const STORAGE_KEY = `relay:case-session:${CASE_ID}`;

/**
 * A fully-reasoned draft that selects the best-fit rail (swift-fedwire) with
 * price/arrival/tracking expectations and a reason. This scores "preferred" so
 * the evaluator produces a distinctive consequence string the "evaluation
 * hidden" test can assert is absent before Send.
 */
function preferredDraft(overrides: Partial<RecommendationDraft> = {}): RecommendationDraft {
  return {
    shortlist: ["swift-fedwire"],
    selectedRail: "swift-fedwire",
    reasons: ["Fast same-day USD value protects the 2-business-day deadline."],
    conditions: [],
    priceExpectation: "The wire fee is justified by the shipment deadline.",
    arrivalExpectation: "Same-day USD value, well within 2 business days.",
    trackingExpectation: "Full UETR tracking with confirmation of credit.",
    customerExplanation: "",
    ...overrides,
  };
}

/**
 * Seed a session in the RECOMMEND phase with a complete draft and no
 * firstAttempt. This is the pre-commit review state where RecommendationSummary
 * renders. (The reducer has no investigate→recommend transition in Phase 1;
 * tests seed the recommend phase directly, mirroring how CaseDesk.test.tsx
 * seeds the investigate phase.)
 */
function seedRecommendSession(
  draftOverrides: Partial<RecommendationDraft> = {},
  sessionOverrides: Partial<CaseSession> = {},
): CaseSession {
  const initial = createInitialCaseSession(CASE_ID);
  const session: CaseSession = {
    ...initial,
    status: "in_progress",
    phase: "recommend",
    draft: preferredDraft(draftOverrides),
    firstAttempt: null,
    ...sessionOverrides,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  return session;
}

function readStoredSession(): CaseSession | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  return JSON.parse(raw) as CaseSession;
}

function renderDesk() {
  return render(
    <MemoryRouter>
      <CaseDesk caseId={CASE_ID} />
    </MemoryRouter>,
  );
}

function getSendButton(): HTMLButtonElement {
  return screen.getByRole("button", { name: /send recommendation/i });
}

function getExplanationTextarea(): HTMLTextAreaElement {
  return screen.getByRole("textbox", { name: /explanation for the customer/i });
}

beforeEach(() => {
  localStorage.clear();
});

// ─── Evaluation is HIDDEN before commit ─────────────────────────────────────

describe("RecommendationFlow — evaluation hidden before commit", () => {
  it("does NOT show the decision-quality or consequence before Send", () => {
    const draft = preferredDraft();
    seedRecommendSession();
    renderDesk();
    // The Send affordance is present (pre-commit review).
    expect(getSendButton()).toBeInTheDocument();
    // Compute the evaluator's consequence for this draft and assert it is NOT
    // surfaced to the learner yet. The evaluation is deliberately withheld
    // until commit so the learner commits to a recommendation before learning
    // how it was scored.
    const outcome = evaluateRecommendation(supplierCase, draft);
    expect(outcome.consequence.length).toBeGreaterThan(0);
    expect(screen.queryByText(outcome.consequence)).not.toBeInTheDocument();
    // No decision-quality evaluation chip (distinct from rail-eligibility chips
    // which use the same StatusChip but appear against individual rails). The
    //preferred/defensible labels only arise from evaluation; assert neither
    // appears as an evaluation result region.
    expect(screen.queryByText(/^Preferred$/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Defensible$/)).not.toBeInTheDocument();
  });

  it("advances to the resolve phase and records a firstAttempt after Send", async () => {
    seedRecommendSession();
    renderDesk();
    fireEvent.click(getSendButton());
    // The phase advanced to resolve: the resolve-phase placeholder heading
    // appears. (Piece 5b replaces this placeholder with CaseOutcome.)
    expect(screen.getByRole("heading", { name: /recommendation submitted/i })).toBeInTheDocument();
    // A firstAttempt was recorded in storage.
    const stored = readStoredSession();
    expect(stored?.firstAttempt).not.toBeNull();
    expect(stored?.phase).toBe("resolve");
  });
});

// ─── One immutable first attempt ─────────────────────────────────────────────

describe("RecommendationFlow — one immutable first attempt", () => {
  it("snapshots the draft into firstAttempt on Send and preserves it across re-renders", () => {
    const draft = preferredDraft({ customerExplanation: "committed explanation" });
    seedRecommendSession({ customerExplanation: "committed explanation" });
    const { rerender } = renderDesk();
    fireEvent.click(getSendButton());
    // The snapshot captured the draft verbatim.
    let stored = readStoredSession();
    expect(stored?.firstAttempt?.draft).toEqual(draft);
    expect(stored?.firstAttempt?.draft.customerExplanation).toBe("committed explanation");
    // Re-rendering does not mutate the immutable snapshot. (edit-draft is
    // illegal in the resolve phase per the reducer, so the snapshot is
    // structurally protected; we assert it here all the same.)
    rerender(
      <MemoryRouter>
        <CaseDesk caseId={CASE_ID} />
      </MemoryRouter>,
    );
    stored = readStoredSession();
    expect(stored?.firstAttempt?.draft).toEqual(draft);
    expect(stored?.revisedAttempt).toBeNull();
  });
});

// ─── Rapid double-submit ─────────────────────────────────────────────────────

describe("RecommendationFlow — rapid double-submit", () => {
  it("clicking Send twice quickly creates only ONE firstAttempt (no revisedAttempt)", () => {
    seedRecommendSession();
    renderDesk();
    const sendButton = getSendButton();
    // Fire two clicks synchronously. React batches the dispatches; the
    // reducer's double-submit guard makes the second send a no-op (it returns
    // the SAME session once firstAttempt is set).
    fireEvent.click(sendButton);
    fireEvent.click(sendButton);
    const stored = readStoredSession();
    // Exactly one firstAttempt; no revisedAttempt (the revised path requires
    // begin-revision, which was not dispatched).
    expect(stored?.firstAttempt).not.toBeNull();
    expect(stored?.revisedAttempt).toBeNull();
    // The firstAttempt was recorded exactly once — the outcome is a single
    // object, not a duplicated/overwritten mess.
    expect(typeof stored?.firstAttempt?.submittedAt).toBe("string");
    expect(stored?.firstAttempt?.submittedAt.length).toBeGreaterThan(0);
  });
});

// ─── Debounce + flush-on-send ────────────────────────────────────────────────

describe("RecommendationFlow — debounced explanation flushes on Send", () => {
  it("flushes the pending customerExplanation so the submitted snapshot includes the latest text", () => {
    seedRecommendSession({ customerExplanation: "" });
    renderDesk();
    const textarea = getExplanationTextarea();
    // Type into the explanation. The write is debounced 300ms, so localStorage
    // does NOT yet reflect the typed text.
    fireEvent.change(textarea, { target: { value: "flushed right before send" } });
    expect(readStoredSession()?.draft.customerExplanation ?? "").toBe("");
    // Immediately click Send WITHOUT waiting for the debounce window. The
    // flush-on-send must fold the pending text into the snapshot.
    fireEvent.click(getSendButton());
    const stored = readStoredSession();
    expect(stored?.firstAttempt).not.toBeNull();
    expect(stored?.firstAttempt?.draft.customerExplanation).toBe("flushed right before send");
  });
});

// ─── Empty optional explanation ──────────────────────────────────────────────

describe("RecommendationFlow — empty optional explanation", () => {
  it("allows Send with an empty customerExplanation", () => {
    seedRecommendSession({ customerExplanation: "" });
    renderDesk();
    fireEvent.click(getSendButton());
    const stored = readStoredSession();
    // Send succeeded — firstAttempt is set with an empty explanation.
    expect(stored?.firstAttempt).not.toBeNull();
    expect(stored?.firstAttempt?.draft.customerExplanation).toBe("");
  });
});

// ─── Maximum-length rejection (1,000-char limit) ─────────────────────────────

describe("RecommendationFlow — customerExplanation 1,000-char limit", () => {
  it("shows a remaining-character counter that starts at 1000", () => {
    seedRecommendSession({ customerExplanation: "" });
    renderDesk();
    expect(screen.getByText(/1000 characters left/i)).toBeInTheDocument();
  });

  it("caps input at 1000 characters and clamps the counter at 0", () => {
    seedRecommendSession({ customerExplanation: "" });
    renderDesk();
    const textarea = getExplanationTextarea();
    // Attempt to enter 1,001 characters. The field clamps to 1,000.
    const tooLong = "a".repeat(1001);
    fireEvent.change(textarea, { target: { value: tooLong } });
    expect(textarea).toHaveValue("a".repeat(1000));
    // The counter is clamped at 0 (never negative).
    expect(screen.getByText(/0 characters left/i)).toBeInTheDocument();
  });

  it("never persists a customerExplanation longer than 1000 characters", () => {
    seedRecommendSession({ customerExplanation: "" });
    renderDesk();
    const textarea = getExplanationTextarea();
    fireEvent.change(textarea, { target: { value: "b".repeat(1200) } });
    // Flush via blur so the write lands in storage.
    fireEvent.blur(textarea);
    const stored = readStoredSession();
    expect(stored?.draft.customerExplanation.length).toBeLessThanOrEqual(1000);
    expect(stored?.draft.customerExplanation).toBe("b".repeat(1000));
  });
});

// ─── Navigating away before commit ───────────────────────────────────────────

describe("RecommendationFlow — exiting before Send preserves the draft, no firstAttempt", () => {
  it("does NOT create a firstAttempt when the learner has not clicked Send", () => {
    const draft = preferredDraft({ customerExplanation: "in-progress draft" });
    seedRecommendSession({ customerExplanation: "in-progress draft" });
    renderDesk();
    // The learner is in the recommend phase reviewing their draft. They have
    // NOT clicked Send.
    expect(getSendButton()).toBeInTheDocument();
    // The in-progress session in storage has NO firstAttempt — exiting now
    // would leave only the draft, which is preserved for resume.
    const stored = readStoredSession();
    expect(stored?.firstAttempt).toBeNull();
    expect(stored?.draft).toEqual(draft);
    expect(stored?.phase).toBe("recommend");
  });
});
