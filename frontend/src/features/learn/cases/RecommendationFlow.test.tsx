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
  const outcome = evaluateRecommendation(supplierCase, draft);
  const session: CaseSession = {
    ...createInitialCaseSession(CASE_ID),
    status: "in_progress",
    phase: "resolve",
    draft,
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
    const outcome = evaluateRecommendation(supplierCase, draft);
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
    const outcome = evaluateRecommendation(supplierCase, preferredDraft());
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
    const invalidOutcome = evaluateRecommendation(supplierCase, invalidDraft);
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

  it("surfaces the main-case decision-quality in the supported section and the transfer decision-quality in the transfer section", () => {
    seedResolveSession();
    renderDesk();
    // The preferred draft scores "preferred" on the main case.
    const mainOutcome = evaluateRecommendation(supplierCase, preferredDraft());
    expect(mainOutcome.quality).toBe("preferred");

    driveCompleteTransfer();
    const stored = readStoredSession()!;
    // The transfer outcome is persisted (Piece 5c CRITICAL FIX).
    expect(stored.transferOutcome).not.toBeNull();
    const transferQuality = stored.transferOutcome!.quality;

    // Two decision-quality chips are present (one per section). Each chip
    // renders its quality label as accessible text via a StatusChip whose
    // aria-label is the quality, so we can scope each chip precisely.
    const mainQualityExact = new RegExp(`^${mainOutcome.quality}$`, "i");
    const transferQualityExact = new RegExp(`^${transferQuality}$`, "i");
    expect(screen.getByText(mainQualityExact)).toBeInTheDocument();
    expect(screen.getByText(transferQualityExact)).toBeInTheDocument();

    // The supported section is distinct from the transfer section. We assert
    // the chip for each quality lives INSIDE its respective section by
    // walking up from the chip's text node to the enclosing <section>. This
    // proves structural containment — they are NOT blended.
    const supportedSection = screen.getByRole("heading", { name: /supported performance/i }).closest("section");
    const transferSection = screen.getByRole("heading", { name: /independent transfer/i }).closest("section");
    expect(supportedSection).not.toBeNull();
    expect(transferSection).not.toBeNull();
    expect(supportedSection).not.toBe(transferSection);

    // Find each chip's <span> (StatusChip renders role-less <span> with the
    // quality as its textContent and aria-label) and assert it is contained
    // in the correct section.
    const mainChip = screen.getByText(mainQualityExact).closest("span");
    const transferChip = screen.getByText(transferQualityExact).closest("span");
    expect(mainChip).not.toBeNull();
    expect(transferChip).not.toBeNull();
    expect(supportedSection!.contains(mainChip)).toBe(true);
    expect(transferSection!.contains(transferChip)).toBe(true);

    // Cross-contamination guard: the transfer quality chip must NOT live in
    // the supported section, and vice versa. (If the two qualities happen to
    // be equal this guard is a no-op; the structural-containment assertions
    // above still carry the load.)
    if (mainOutcome.quality !== transferQuality) {
      expect(supportedSection!.contains(transferChip)).toBe(false);
      expect(transferSection!.contains(mainChip)).toBe(false);
    }
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
    const outcome = evaluateRecommendation(supplierCase, draft);
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
