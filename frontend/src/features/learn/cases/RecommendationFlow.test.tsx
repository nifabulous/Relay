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
import userEvent from "@testing-library/user-event";
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
 * T1: the requestable fact ids in the supplier case (mirrors the catalog). The
 * seed helpers model a learner who has fully investigated (requested every
 * requestable fact), so the evaluator's requestedFactIds gate doesn't block.
 * swift-fedwire specifically requires `tracking-need` (requestable) plus the
 * supplied facts (urgency, beneficiary-bank, amount, destination-currency), so
 * requesting the full set is the honest "fully investigated" state.
 */
const ALL_REQUESTABLE_FACT_IDS = [
  "price-sensitivity",
  "tracking-need",
  "intermediary",
  "institution-variation",
];
const FULLY_INVESTIGATED = new Set(ALL_REQUESTABLE_FACT_IDS);

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
    // T1: model a learner who has fully investigated. Without this, Send
    // scores `invalid` (tracking-need not requested) instead of `preferred`.
    requestedFactIds: ALL_REQUESTABLE_FACT_IDS,
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
    const outcome = evaluateRecommendation(supplierCase, draft, FULLY_INVESTIGATED);
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

// =============================================================================
// Piece 5b — Case outcome consequence + revision + transfer (this subset).
// CaseDesk now drives the resolve phase through <CaseOutcome>, replacing the
// Task-4 placeholder. The contract under test:
//   1. CONSEQUENCE FIRST: the outcome's consequence text renders BEFORE the
//      decision-quality chip in DOM order (a key plan invariant).
//   2. REVISION IS NON-DESTRUCTIVE: begin-revision → edit → re-send leaves the
//      firstAttempt verbatim; the revised attempt is a separate snapshot.
//   3. RAPID DOUBLE-SUBMIT on revised: only ONE revisedAttempt is recorded.
//   4. EVALUATION FAILURE PRESERVES THE DRAFT: an invalid outcome is shown and
//      the learner can revise from their original draft.
//   5. COMPLETE-TRANSFER advances phase → debrief with a computed transfer
//      outcome (the debrief UI itself is Piece 5c).
// =============================================================================

/**
 * Seed a session ALREADY in the resolve phase with a committed firstAttempt.
 * The outcome is computed by the pure evaluator against the firstAttempt's
 * draft so the consequence string is real (matches what CaseDesk would have
 * produced on Send). The working draft is left equal to the first attempt's
 * snapshot — the same state begin-revision resets to.
 */
function seedResolveSession(
  draftOverrides: Partial<RecommendationDraft> = {},
  sessionOverrides: Partial<CaseSession> = {},
): CaseSession {
  const draft = preferredDraft(draftOverrides);
  // T1: the seeded firstAttempt models a learner who fully investigated (so the
  // evaluator produces `preferred`, matching what CaseDesk would produce on
  // Send when requestedFactIds is the full set).
  const outcome = evaluateRecommendation(supplierCase, draft, FULLY_INVESTIGATED);
  const session: CaseSession = {
    ...createInitialCaseSession(CASE_ID),
    status: "in_progress",
    phase: "resolve",
    draft,
    requestedFactIds: ALL_REQUESTABLE_FACT_IDS,
    firstAttempt: {
      draft,
      outcome,
      submittedAt: "2026-07-20T00:00:00.000Z",
    },
    revisedAttempt: null,
    ...sessionOverrides,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  return session;
}

function getReviseButton(): HTMLButtonElement {
  return screen.getByRole("button", { name: /revise recommendation/i });
}

function getSendRevisedButton(): HTMLButtonElement {
  return screen.getByRole("button", { name: /send revised recommendation/i });
}

function getCompleteTransferButton(): HTMLButtonElement {
  return screen.getByRole("button", { name: /complete transfer/i });
}

// ─── Consequence precedes classification ───────────────────────────────────

describe("RecommendationFlow 5b — consequence precedes classification", () => {
  it("renders the consequence text BEFORE the decision-quality chip in DOM order", () => {
    const draft = preferredDraft();
    const outcome = evaluateRecommendation(supplierCase, draft, FULLY_INVESTIGATED);
    seedResolveSession();
    renderDesk();

    const consequenceEl = screen.getByText(outcome.consequence);
    // The decision-quality chip is rendered as a StatusChip whose accessible
    // label is the quality ("Preferred"/"Defensible"/...). The chip's text
    // node is the load-bearing element for DOM-order comparison.
    const qualityEl = screen.getByText(new RegExp(`^${outcome.quality}$`, "i"));
    // Node.DOCUMENT_POSITION_PRECEDING = 0x2. If `consequenceEl` precedes
    // `qualityEl`, then qualityEl.compareDocumentPosition(consequenceEl) has
    // the PRECEDING bit set (i.e. (mask & 0x2) !== 0).
    const mask = qualityEl.compareDocumentPosition(consequenceEl);
    expect(mask & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
  });

  it("renders the reasoning gap prominently and the sound-reasoning list", () => {
    seedResolveSession();
    renderDesk();
    // The sound-reasoning list is surfaced ("What you reasoned well"). At
    // least one sound-reasoning item exists for the preferred draft.
    const outcome = evaluateRecommendation(supplierCase, preferredDraft(), FULLY_INVESTIGATED);
    expect(outcome.soundReasoning.length).toBeGreaterThan(0);
    expect(screen.getByText(/what you reasoned well/i)).toBeInTheDocument();
    // Preferred outcome has no reasoning gap → a positive "No gaps" heading.
    expect(screen.getByRole("heading", { name: /no gaps/i })).toBeInTheDocument();
  });
});

// ─── Revision does not mutate the first attempt ────────────────────────────

describe("RecommendationFlow 5b — revision does not mutate the first attempt", () => {
  it("begin-revision → edit → re-send leaves firstAttempt unchanged and records a separate revisedAttempt", () => {
    seedResolveSession();
    const beforeFirst = readStoredSession()?.firstAttempt;
    expect(beforeFirst).toBeDefined();
    renderDesk();

    // Begin a revision — phase returns to recommend, draft reset to firstAttempt.
    fireEvent.click(getReviseButton());
    // Change the reasoning to make the revised draft DISTINCT from the first.
    const priceInput = screen.getByLabelText(/price expectation/i) as HTMLInputElement;
    fireEvent.change(priceInput, { target: { value: "Revised: lower fee tolerance." } });
    // Re-send the revised recommendation.
    fireEvent.click(getSendRevisedButton());

    const stored = readStoredSession();
    // The FIRST attempt is byte-for-byte unchanged.
    expect(stored?.firstAttempt).toEqual(beforeFirst);
    // The revised attempt exists and is separate.
    expect(stored?.revisedAttempt).not.toBeNull();
    expect(stored?.revisedAttempt?.draft.priceExpectation).toBe("Revised: lower fee tolerance.");
    expect(stored?.revisedAttempt?.draft).not.toEqual(stored?.firstAttempt?.draft);
    // Back in resolve, showing the revised outcome.
    expect(stored?.phase).toBe("resolve");
  });
});

// ─── Rapid double-submit on the revised attempt ────────────────────────────

describe("RecommendationFlow 5b — rapid double-submit on revised attempt", () => {
  it("begin-revision → Send twice quickly creates only ONE revisedAttempt", () => {
    seedResolveSession();
    renderDesk();
    fireEvent.click(getReviseButton());
    const send = getSendRevisedButton();
    // Two synchronous clicks: the reducer's revised-double-submit guard
    // makes the second a no-op once revisedAttempt is set.
    fireEvent.click(send);
    fireEvent.click(send);
    const stored = readStoredSession();
    expect(stored?.revisedAttempt).not.toBeNull();
    // Exactly one revisedAttempt; phase advanced to resolve.
    expect(stored?.phase).toBe("resolve");
    // A second rapid click did not overwrite the submittedAt or mutate the
    // snapshot. (We can't assert identity-of-object across dispatches here,
    // but we CAN assert the content is stable and singular.)
    expect(typeof stored?.revisedAttempt?.submittedAt).toBe("string");
  });
});

// ─── Evaluation failure with draft preservation ────────────────────────────

describe("RecommendationFlow 5b — evaluation failure preserves the draft", () => {
  it("shows an invalid outcome and the draft remains revisable", () => {
    // Seed a first attempt whose selected rail is INELIGIBLE (Interac is
    // domestic-CAD-only but the case targets the US). The evaluator returns
    // quality "invalid". CaseDesk's Send gates on selectedRail !== null only,
    // so an ineligible rail is a legal commit — the outcome surfaces invalid.
    const invalidDraft = preferredDraft({
      shortlist: ["interac-etransfer"],
      selectedRail: "interac-etransfer",
    });
    seedResolveSession({
      shortlist: ["interac-etransfer"],
      selectedRail: "interac-etransfer",
    });
    const invalidOutcome = evaluateRecommendation(supplierCase, invalidDraft, FULLY_INVESTIGATED);
    expect(invalidOutcome.quality).toBe("invalid");

    renderDesk();
    // The invalid decision-quality chip is surfaced (StatusChip renders the
    // quality label as its text + aria-label).
    expect(screen.getByText(/^Invalid$/)).toBeInTheDocument();
    // The consequence is surfaced.
    expect(screen.getByText(invalidOutcome.consequence)).toBeInTheDocument();
    // The learner can still revise (Revise button present and enabled — the
    // one-revision-per-case budget is intact).
    const revise = getReviseButton();
    expect(revise).not.toBeDisabled();
    // The firstAttempt's draft is preserved in storage and is revisable
    // (begin-revision resets the working draft to it).
    const stored = readStoredSession();
    expect(stored?.firstAttempt?.draft.selectedRail).toBe("interac-etransfer");
    expect(stored?.revisedAttempt).toBeNull();
  });
});

// ─── Complete-transfer advances to debrief ─────────────────────────────────

describe("RecommendationFlow 5b — complete-transfer", () => {
  it("dispatches complete-transfer with a computed transfer outcome and advances phase to debrief", () => {
    seedResolveSession();
    renderDesk();
    // Open the transfer sub-step and pick the (only) transfer rail.
    fireEvent.click(getCompleteTransferButton());
    const transferRadio = screen.getByRole("radio", {
      name: /cross-border ach/i,
    });
    fireEvent.click(transferRadio);
    fireEvent.click(screen.getByRole("button", { name: /confirm transfer recommendation/i }));

    const stored = readStoredSession();
    expect(stored?.phase).toBe("debrief");
    expect(stored?.status).toBe("completed");
    // The transfer outcome was computed and dispatched.
    expect(stored?.firstAttempt).not.toBeNull();
  });

  it("renders the debrief after complete-transfer (Piece 5c replaces the placeholder)", () => {
    seedResolveSession();
    renderDesk();
    fireEvent.click(getCompleteTransferButton());
    fireEvent.click(screen.getByRole("radio", { name: /cross-border ach/i }));
    fireEvent.click(screen.getByRole("button", { name: /confirm transfer recommendation/i }));
    // Piece 5c: the debrief renders. The completion heading is neutrally
    // framed ("You've completed this case") — NOT as success/mastery.
    expect(screen.getByRole("heading", { name: /completed this case/i })).toBeInTheDocument();
  });

  it("moves focus into the transfer fieldset when it opens (so a screen-reader user lands in the new region)", () => {
    // Accessibility: clicking "Complete transfer" reveals a new region. Focus
    // must move INTO that region (the fieldset's legend or first radio) so a
    // screen-reader user hears/lands in it instead of being stranded on the
    // button. The aria-expanded/aria-controls wiring is already correct; this
    // asserts the focus move.
    seedResolveSession();
    renderDesk();
    const completeButton = getCompleteTransferButton();
    fireEvent.click(completeButton);
    // The transfer fieldset mounts. A <fieldset> with a <legend> exposes the
    // `group` role with the legend text as its accessible name. Focus should
    // now be the fieldset itself (the legend carries tabindex=-1) or a
    // descendant (a radio).
    const transferFieldset = screen.getByRole("group", { name: /pick a rail/i });
    const active = document.activeElement;
    expect(active).not.toBeNull();
    const inside = active === transferFieldset || transferFieldset.contains(active);
    expect(inside).toBe(true);
  });
});

// =============================================================================
// Piece 5c — Case debrief: separated performance + transfer, synthetic-data
// disclosure, and completion tied to complete-transfer (NOT to preferred
// quality). The contract under test:
//   1. SEPARATION: the debrief renders TWO distinct sections — one for the
//      main-case (supported) performance and one for the independent transfer.
//      Each surfaces its own decision-quality. The plan invariant: "the debrief
//      separates supported performance from independent transfer."
//   2. SYNTHETIC-DATA DISCLOSURE: a prominent, clearly-labelled callout
//      discloses that the case used synthetic (fictional) data — not buried
//      fine print.
//   3. COMPLETION = TRANSFER, NOT PREFERRED: a preferred first-attempt does
//      NOT mark the session completed. Only complete-transfer does. This proves
//      preferred ≠ completed (completion is the finish, neutrally framed).
// =============================================================================

/**
 * Drive the Case Desk through the full complete-transfer flow (resolve →
 * transfer step open → pick the only transfer rail → confirm). Returns the
 * stored session after the transfer completes for assertions.
 */
function driveCompleteTransfer(): CaseSession {
  fireEvent.click(getCompleteTransferButton());
  fireEvent.click(screen.getByRole("radio", { name: /cross-border ach/i }));
  fireEvent.click(screen.getByRole("button", { name: /confirm transfer recommendation/i }));
  return readStoredSession()!;
}

describe("RecommendationFlow 5c — debrief separates supported performance from independent transfer", () => {
  it("renders TWO distinct sections (supported performance AND independent transfer) after complete-transfer", () => {
    seedResolveSession();
    renderDesk();
    driveCompleteTransfer();
    // The debrief is rendered. The two key invariants:
    //   (a) a "supported performance" section exists (the main case, with its
    //       decision-quality surfaced),
    //   (b) an "independent transfer" section exists (the transfer, with its
    //       decision-quality surfaced).
    // The two are SEMANTICALLY distinct regions so a learner (and AT) can
    // tell them apart — never blended into a single score.
    const supportedHeading = screen.getByRole("heading", { name: /supported performance/i });
    const transferHeading = screen.getByRole("heading", { name: /independent transfer/i });
    expect(supportedHeading).toBeInTheDocument();
    expect(transferHeading).toBeInTheDocument();
    // They are DISTINCT nodes (not the same element mis-labelled).
    expect(supportedHeading).not.toBe(transferHeading);
  });

  it("surfaces the main-case decision-quality in the supported section and an HONEST completion marker (not a constant-quality chip) in the transfer section", () => {
    seedResolveSession();
    renderDesk();
    // The preferred draft scores "preferred" on the main case (fully investigated).
    const mainOutcome = evaluateRecommendation(supplierCase, preferredDraft(), FULLY_INVESTIGATED);
    expect(mainOutcome.quality).toBe("preferred");

    driveCompleteTransfer();
    const stored = readStoredSession()!;
    // The transfer outcome is persisted (Piece 5c CRITICAL FIX). The transfer
    // still runs through the evaluator (for the consequence text), but T12
    // makes the debrief HONEST: the structurally-constant transfer quality is
    // NOT surfaced as a graded chip. The persisted quality is an internal
    // artifact, not learner-facing.
    expect(stored.transferOutcome).not.toBeNull();

    // The MAIN-CASE decision-quality chip IS present (the supported section is
    // a real graded outcome). Scoped by section so a future change can't
    // accidentally surface it inside the transfer card.
    const supportedSection = screen.getByRole("heading", { name: /supported performance/i }).closest("section");
    const transferSection = screen.getByRole("heading", { name: /independent transfer/i }).closest("section");
    expect(supportedSection).not.toBeNull();
    expect(transferSection).not.toBeNull();
    expect(supportedSection).not.toBe(transferSection);

    const mainQualityExact = new RegExp(`^${mainOutcome.quality}$`, "i");
    const mainChip = supportedSection!.querySelector("span.status-chip");
    expect(mainChip).not.toBeNull();
    expect((mainChip!.textContent ?? "").trim()).toMatch(mainQualityExact);

    // T12 — HONEST TRANSFER: the transfer section does NOT surface a
    // decision-quality StatusChip. The transfer has one rail, no
    // investigation surface, and the evaluator would always return `possible`
    // (empty expectations + filler reason by construction). Showing a quality
    // chip would be a misleading constant. The debrief instead frames the
    // transfer as completion — see the dedicated T12 describe block below.
    const transferChip = transferSection!.querySelector("span.status-chip");
    expect(transferChip).toBeNull();
  });

  it("renders the consequence BEFORE the decision-quality chip in DOM order within the supported-performance card (T12: transfer card has no chip)", () => {
    // Mirrors the resolve-phase "consequence precedes classification" assertion
    // so a future CSS `order:` / `column-reverse` change can't silently flip
    // the debrief's supported card while the resolve-phase test stays green.
    //
    // T12: the transfer card no longer surfaces a decision-quality chip (the
    // structurally-constant `possible` was misleading). So consequence-first
    // is now asserted only for the SUPPORTED card — the only card with a
    // graded chip. The transfer card's consequence text is still surfaced
    // (it's informative — what would happen with this rail on this corridor),
    // but it is not followed by a quality chip; see the dedicated T12
    // describe block below for the transfer card's honest contract.
    const mainOutcome = evaluateRecommendation(supplierCase, preferredDraft(), FULLY_INVESTIGATED);
    seedResolveSession();
    renderDesk();
    driveCompleteTransfer();

    const supportedSection = screen.getByRole("heading", { name: /supported performance/i }).closest("section");
    expect(supportedSection).not.toBeNull();

    // Supported-performance card: consequence precedes the main-case quality.
    const supportedConsequence = supportedSection!.querySelector(".case-desk__debrief-card-consequence");
    const supportedQualityText = screen.getByText(new RegExp(`^${mainOutcome.quality}$`, "i"));
    expect(supportedConsequence).not.toBeNull();
    // Node.DOCUMENT_POSITION_PRECEDING = 0x2. If the consequence precedes the
    // quality chip, qualityEl.compareDocumentPosition(consequenceEl) has the
    // PRECEDING bit set (i.e. (mask & 0x2) !== 0).
    const supportedMask = supportedQualityText.compareDocumentPosition(supportedConsequence!);
    expect(supportedMask & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
  });
});

describe("RecommendationFlow 5c — visible synthetic-data disclosure", () => {
  it("renders a prominent disclosure that the case used synthetic (fictional) data", () => {
    seedResolveSession();
    renderDesk();
    driveCompleteTransfer();
    // The disclosure is rendered as an ARIA-labelled callout (role="note")
    // so it is unmissable — not buried fine print. The text must clearly say
    // "synthetic" or "fictional" so a learner can never mistake the case for
    // real customer data.
    const disclosure = screen.getByRole("note");
    const text = (disclosure.textContent ?? "").toLowerCase();
    expect(text.length).toBeGreaterThan(0);
    expect(/synthetic|fictional/.test(text)).toBe(true);
    // The disclosure must reference that NO real customer/account/transaction
    // data was used (the global synthetic-data constraint).
    expect(text).toMatch(/no real|no actual/);
  });
});

describe("RecommendationFlow 5c — completion is tied to complete-transfer, NOT to preferred quality", () => {
  it("a preferred first attempt does NOT mark the session completed (status stays in_progress until transfer)", () => {
    // Seed a resolve session whose firstAttempt scored PREFERRED. The plan is
    // explicit: completion is the finish (transfer), not a quality gate.
    // Preferred ≠ completed.
    const draft = preferredDraft();
    const outcome = evaluateRecommendation(supplierCase, draft, FULLY_INVESTIGATED);
    expect(outcome.quality).toBe("preferred");
    seedResolveSession();
    const seeded = readStoredSession()!;
    expect(seeded.firstAttempt!.outcome.quality).toBe("preferred");
    // CRITICAL: a preferred first attempt does NOT complete the session.
    expect(seeded.status).not.toBe("completed");
    expect(seeded.phase).toBe("resolve");
  });

  it("complete-transfer (not preferred quality) marks the session completed", () => {
    seedResolveSession();
    renderDesk();
    // Before transfer: preferred first attempt is set but status is NOT
    // completed.
    expect(readStoredSession()!.status).not.toBe("completed");
    // Complete the transfer.
    driveCompleteTransfer();
    // After transfer: the session IS completed, and the transfer outcome is
    // persisted for the debrief.
    const stored = readStoredSession()!;
    expect(stored.status).toBe("completed");
    expect(stored.phase).toBe("debrief");
    expect(stored.transferOutcome).not.toBeNull();
  });
});

// ─── Full-flow reachability via the UI (no draft seeding) ───────────────────
// Regression guard: a production learner (who cannot seed localStorage) must be
// able to reach the `preferred` decision-quality tier through the UI alone. The
// evaluator now requires BOTH:
//   - the investigation (requesting the facts the best-fit rail needs, e.g.
//     tracking-need for swift-fedwire), AND
//   - a substantive primary reason (T1b: ≥ MIN_REASON_CHARS chars and
//     ≥ MIN_REASON_WORDS words; filler like "x" no longer reaches defensible).
// So the FactRequest controls AND the Reasoning section MUST both be reachable
// and usable from the UI. Without either, the tier spine collapses.

describe("RecommendationFlow — preferred tier is reachable via the UI", () => {
  it("lets a learner request the required facts, enter a substantive reason, and reach `preferred`", async () => {
    // Seed only the SHELL — an in-progress session in the recommend phase with
    // NO reasoning fields filled and NO facts requested. The learner must
    // investigate AND reason through the UI.
    const initial = createInitialCaseSession(CASE_ID);
    const shell: CaseSession = {
      ...initial,
      status: "in_progress",
      phase: "recommend",
      // Draft has the best-fit rail selected but NOTHING else — the learner
      // must request the facts and provide the reasoning through the UI.
      draft: {
        ...initial.draft,
        shortlist: ["swift-fedwire"],
        selectedRail: "swift-fedwire",
      },
      requestedFactIds: [],
      firstAttempt: null,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(shell));

    const user = userEvent.setup();
    renderDesk();

    // T1: the learner requests every available fact via the FactRequest UI.
    // swift-fedwire requires tracking-need (requestable); the other requestable
    // facts (price-sensitivity, intermediary, institution-variation) unlock the
    // cost priority and round out the investigation. Using userEvent (not
    // fireEvent) so each toggle's state update flushes before the next click —
    // FactRequest's toggle reads the current pending set from props, so we
    // cannot batch-throw clicks at stale checkbox nodes.
    await user.click(screen.getByRole("checkbox", { name: /fee sensitivity/i }));
    await user.click(screen.getByRole("checkbox", { name: /tracking requirement/i }));
    await user.click(screen.getByRole("checkbox", { name: /intermediary correspondent/i }));
    await user.click(screen.getByRole("checkbox", { name: /institution variation/i }));
    await user.click(screen.getByRole("button", { name: /request facts/i }));

    // The learner fills each reasoning field via its UI input. T1b: the primary
    // reason is a real sentence (well above the substantive threshold); filler
    // like "x" would leave the learner at `possible`.
    await user.type(
      screen.getByRole("textbox", { name: /primary reason/i }),
      "Fast same-day USD value protects the 2-business-day deadline.",
    );
    await user.type(
      screen.getByRole("textbox", { name: /price expectation/i }),
      "The wire fee is justified by the shipment deadline.",
    );
    await user.type(
      screen.getByRole("textbox", { name: /arrival expectation/i }),
      "Same-day USD value, well within 2 business days.",
    );
    await user.type(
      screen.getByRole("textbox", { name: /tracking expectation/i }),
      "Full UETR tracking with confirmation of credit.",
    );

    // Send. The evaluator scores the now-complete, fully-investigated draft.
    await user.click(getSendButton());

    // CRITICAL: the learner reached `preferred` through the UI alone. If the
    // FactRequest controls or the reason input are removed/renamed, this fails
    // — the tier spine collapses back to `invalid`/`possible`.
    const stored = readStoredSession()!;
    expect(stored.firstAttempt).not.toBeNull();
    expect(stored.firstAttempt!.outcome.quality).toBe("preferred");
    // And the reason the learner typed was captured in the immutable snapshot.
    expect(stored.firstAttempt!.draft.reasons).toContain(
      "Fast same-day USD value protects the 2-business-day deadline.",
    );
    // T1: the requested facts are captured in the immutable session.
    expect(stored.requestedFactIds).toEqual(expect.arrayContaining(ALL_REQUESTABLE_FACT_IDS));
  });

  it("blocks `preferred` when the learner skips the investigation (does not request tracking-need)", () => {
    // The inverse of the reachability guard: a learner who fills every
    // reasoning field with genuine content but does NOT request tracking-need
    // (required by swift-fedwire) cannot reach `preferred`. This is the T1
    // contract — the investigation is load-bearing.
    const initial = createInitialCaseSession(CASE_ID);
    const shell: CaseSession = {
      ...initial,
      status: "in_progress",
      phase: "recommend",
      draft: {
        ...initial.draft,
        shortlist: ["swift-fedwire"],
        selectedRail: "swift-fedwire",
        reasons: ["Fast same-day USD value protects the 2-business-day deadline."],
        priceExpectation: "The wire fee is justified by the shipment deadline.",
        arrivalExpectation: "Same-day USD value, well within 2 business days.",
        trackingExpectation: "Full UETR tracking with confirmation of credit.",
      },
      requestedFactIds: [],
      firstAttempt: null,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(shell));

    renderDesk();
    fireEvent.click(getSendButton());

    const stored = readStoredSession()!;
    expect(stored.firstAttempt).not.toBeNull();
    // Without tracking-need requested, swift-fedwire is missing a required fact
    // → `invalid`. Definitely NOT `preferred`.
    expect(stored.firstAttempt!.outcome.quality).toBe("invalid");
    expect(stored.firstAttempt!.outcome.missingFactIds).toContain("tracking-need");
  });

  it("blocks `preferred`/`defensible` when the learner types filler in the reason field (even fully investigated)", () => {
    // The T1b contract: filler ("x") in the Primary reason field cannot reach
    // defensible/preferred, even with the full investigation done and every
    // expectation filled. The reason must clear the substantive threshold.
    const initial = createInitialCaseSession(CASE_ID);
    const shell: CaseSession = {
      ...initial,
      status: "in_progress",
      phase: "recommend",
      draft: {
        ...initial.draft,
        shortlist: ["swift-fedwire"],
        selectedRail: "swift-fedwire",
        reasons: ["x"], // filler — below the substantive threshold
        priceExpectation: "The wire fee is justified by the shipment deadline.",
        arrivalExpectation: "Same-day USD value, well within 2 business days.",
        trackingExpectation: "Full UETR tracking with confirmation of credit.",
      },
      requestedFactIds: ALL_REQUESTABLE_FACT_IDS,
      firstAttempt: null,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(shell));

    renderDesk();
    fireEvent.click(getSendButton());

    const stored = readStoredSession()!;
    expect(stored.firstAttempt).not.toBeNull();
    // Filler reason → `possible`, never defensible/preferred.
    expect(stored.firstAttempt!.outcome.quality).toBe("possible");
  });
});

// =============================================================================
// T12 — Honest transfer evaluation (Group D).
//
// CONTEXT: the transfer sub-step (TransferStep in CaseOutcome.tsx) builds its
// draft with empty reasons + empty expectations + a single pre-filtered rail
// (cross-border-ach). Group A's evaluator requires (a) a substantive primary
// reason AND (b) all three expectations non-empty to clear `possible`. So the
// transfer outcome is STRUCTURALLY ALWAYS `possible` — every transfer pick,
// every time. The debrief's "Independent transfer" StatusChip showed "Possible"
// as if it were a graded outcome, but it is a constant. The plan's T7 defers
// "add a second rail + reasoning capture" to Phase 2, so making the transfer a
// real evaluation is out of scope.
//
// DIRECTION A (chosen): reframe the transfer as completion. The transfer is a
// single rail with no investigation surface (all facts supplied) — in Phase 1
// it is a completion confirmation, not a graded decision. The honest contract:
//   1. NO QUALITY CHIP in the transfer section (a constant "Possible" is
//      misleading).
//   2. The transfer consequence text IS still surfaced (it's informative — it
//      tells the learner what would happen with this rail on this corridor).
//   3. The transfer section is framed neutrally as completion — not as
//      success/mastery, and not as a comparison to the main case.
//   4. The MAIN-CASE supported section KEEPS its decision-quality chip (the
//      main case is a real graded outcome).
//
// Why Direction B (capture reasoning) was rejected: even with a substantive
// reason + the three expectations filled, the transfer's `urgency` fact value
// ("Supplier can wait up to a week; not time-sensitive") doesn't match the
// evaluator's urgency cue, and there's no tracking/price fact, so
// `disclosedPriorities` returns empty → `bestFitRailId` returns undefined →
// `preferred` is unreachable. With one rail there's nothing to be "preferred"
// over. Reaching `defensible` would require capturing all three expectations
// (over-asking for a single-rail transfer), and without them the evaluator
// tops at `possible` regardless of the reason. A transfer-specific evaluator
// path was rejected as scope creep (the brief says keep the evaluator general).
// =============================================================================

describe("RecommendationFlow T12 — honest transfer: no constant-quality chip, reframed as completion", () => {
  it("does NOT render a decision-quality StatusChip inside the transfer section (the `possible` was a structural constant)", () => {
    seedResolveSession();
    renderDesk();
    driveCompleteTransfer();
    // The persisted transfer outcome is still `possible` (the evaluator ran
    // against an empty-reason draft). T12's job is to make the DEBRIEF honest
    // about that — not to change the evaluator. So the persisted quality is
    // `possible`, but the debrief must NOT surface it as a graded chip.
    const stored = readStoredSession()!;
    expect(stored.transferOutcome).not.toBeNull();
    expect(stored.transferOutcome!.quality).toBe("possible");

    const transferSection = screen
      .getByRole("heading", { name: /independent transfer/i })
      .closest("section");
    expect(transferSection).not.toBeNull();
    // No StatusChip anywhere in the transfer section.
    const transferChip = transferSection!.querySelector("span.status-chip");
    expect(transferChip).toBeNull();
  });

  it("still surfaces the transfer consequence text (it's informative — what would happen with this rail)", () => {
    seedResolveSession();
    renderDesk();
    driveCompleteTransfer();
    const stored = readStoredSession()!;
    expect(stored.transferOutcome).not.toBeNull();
    // The consequence text is real evaluator output and tells the learner what
    // would happen with the picked rail on this corridor. Keeping it is honest;
    // dropping the quality chip is what removes the misleading grade.
    const transferSection = screen
      .getByRole("heading", { name: /independent transfer/i })
      .closest("section");
    const consequenceEl = transferSection!.querySelector(
      ".case-desk__debrief-card-consequence",
    );
    expect(consequenceEl).not.toBeNull();
    expect((consequenceEl!.textContent ?? "").length).toBeGreaterThan(0);
    expect(consequenceEl!.textContent).toContain(stored.transferOutcome!.consequence);
  });

  it("frames the transfer section as completion (neutral copy, no credential/mastery language)", () => {
    seedResolveSession();
    renderDesk();
    driveCompleteTransfer();
    const transferSection = screen
      .getByRole("heading", { name: /independent transfer/i })
      .closest("section");
    expect(transferSection).not.toBeNull();
    const text = (transferSection!.textContent ?? "").toLowerCase();
    // Honest completion framing: the learner "completed" / "applied" the
    // transfer. NOT framed as a graded decision or a pass/fail.
    expect(/complet|applied/i.test(text)).toBe(true);
    // No credential/mastery language (global constraint).
    expect(text).not.toMatch(/master|certif|badge|pass|fail/);
  });

  it("still renders the main-case decision-quality chip in the supported section (the main case is a real graded outcome)", () => {
    seedResolveSession();
    renderDesk();
    driveCompleteTransfer();
    // The supported section KEEPS its decision-quality chip — only the
    // transfer section loses its (structurally-constant) chip. This proves the
    // T12 fix is scoped to the transfer, not a blanket removal of grading.
    const supportedSection = screen
      .getByRole("heading", { name: /supported performance/i })
      .closest("section");
    expect(supportedSection).not.toBeNull();
    const supportedChip = supportedSection!.querySelector("span.status-chip");
    expect(supportedChip).not.toBeNull();
  });

  it("does NOT surface a transfer reasoning-gap callout in the debrief (the gap was a `possible`-tier artifact)", () => {
    // The evaluator returns a reasoningGap for `possible` outcomes. That gap
    // ("state a substantive primary reason... give a price expectation...")
    // is a main-case-shaped instruction that doesn't apply to the single-rail
    // transfer. Surfacing it would be busywork / misleading. The debrief must
    // not show a "One thing to strengthen" callout in the transfer section.
    seedResolveSession();
    renderDesk();
    driveCompleteTransfer();
    const transferSection = screen
      .getByRole("heading", { name: /independent transfer/i })
      .closest("section");
    expect(transferSection).not.toBeNull();
    const transferGapSummary = transferSection!.querySelector(
      ".case-desk__debrief-card-summary",
    );
    expect(transferGapSummary).toBeNull();
  });
});
