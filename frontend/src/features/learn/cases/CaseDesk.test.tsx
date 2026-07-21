import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, within, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { CaseDesk } from "./CaseDesk";
import type { CaseEnrichment, CaseFact } from "./caseTypes";
import { createInitialCaseSession, type CaseSession } from "./caseStore";

// ─── Helpers ─────────────────────────────────────────────────────────────────
// The CaseDesk reads/writes localStorage via caseStore. We clear it between
// tests and offer a helper to seed a STARTED session (phase: investigate) so
// the integration assertions can target the evidence workspace directly.

const CASE_ID = "canada-us-supplier";

function seedStartedSession() {
  const initial = createInitialCaseSession(CASE_ID);
  // Dispatch `start` to move brief → investigate.
  const started = {
    ...initial,
    status: "in_progress" as const,
    phase: "investigate" as const,
  };
  localStorage.setItem(
    `relay:case-session:${CASE_ID}`,
    JSON.stringify(started),
  );
}

// Seed a recovered session: the case content changed under the learner, so
// loadCaseSession's recovery contract yields status "under_review" with a
// wiped draft and a PRESERVED firstAttempt. Mirrors recoverStaleSession.
function seedUnderReviewSession() {
  const initial = createInitialCaseSession(CASE_ID);
  const recovered: CaseSession = {
    ...initial,
    status: "under_review",
    phase: "investigate",
    // The working draft is wiped (built against stale case content)...
    draft: { ...initial.draft },
    // ...but the learner's first attempt is preserved.
    firstAttempt: {
      draft: {
        ...initial.draft,
        selectedRail: "swift-fedwire",
        shortlist: ["swift-fedwire"],
        customerExplanation: "I recommend SWIFT-to-Fedwire.",
      },
      outcome: {
        quality: "defensible",
        consequence: "Arrives next business day.",
        soundReasoning: ["Uses an eligible rail."],
        reasoningGap: null,
        nextAction: "Send the transfer.",
        invalidRailIds: [],
        missingFactIds: [],
      },
      submittedAt: "2026-06-15T10:00:00.000Z",
    },
  };
  localStorage.setItem(
    `relay:case-session:${CASE_ID}`,
    JSON.stringify(recovered),
  );
}

function readStoredSession(): CaseSession | null {
  const raw = localStorage.getItem(`relay:case-session:${CASE_ID}`);
  if (!raw) return null;
  return JSON.parse(raw) as CaseSession;
}

function renderDesk(props: { enrichment?: CaseEnrichment } = {}) {
  return render(
    <MemoryRouter>
      <CaseDesk caseId={CASE_ID} enrichment={props.enrichment} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
});

// ─── Customer request anchor ────────────────────────────────────────────────

describe("CaseDesk — customer request anchor", () => {
  it("renders the customer request prominently as a labelled anchor landmark", () => {
    seedStartedSession();
    renderDesk();
    // The customer request is the case's authored customerRequest string.
    const request = screen.getByText(/Maple Ridge Outfitters/i);
    expect(request).toBeVisible();
    // The anchor is a region with an accessible name naming it the customer
    // request, so a screen reader user can jump to it.
    const region = screen.getByRole("region", { name: /customer request/i });
    expect(region).toContainElement(request);
  });
});

// ─── Fact sections ──────────────────────────────────────────────────────────

describe("CaseDesk — fact sections by state", () => {
  it("groups facts into supplied and unknown sections before any investigation (T1: requestable facts ship unknown)", () => {
    seedStartedSession();
    renderDesk();
    // T1: the four requestable facts (price-sensitivity, tracking-need,
    // intermediary, institution-variation) ship `state: "unknown"` so their
    // values are not pre-disclosed as gathered. Before the learner requests
    // anything, the EvidenceRail shows the Supplied section (given context)
    // and the Unknown section (the investigation surface). The Gathered
    // section is empty and not rendered until a fact is requested.
    expect(screen.getByRole("heading", { name: /supplied/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /unknown/i })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /^gathered$/i })).not.toBeInTheDocument();
    // A supplied fact value renders in its section.
    const supplied = screen.getByRole("region", { name: /supplied/i });
    expect(supplied).toHaveTextContent(/United States/);
    // A requestable fact renders in the Unknown section before being requested.
    const unknown = screen.getByRole("region", { name: /unknown/i });
    expect(unknown).toHaveTextContent(/fee sensitivity|tracking requirement/i);
  });

  it("shows a compact source status for facts that carry a claim", () => {
    seedStartedSession();
    renderDesk();
    // The catalog's facts are all authored against current reviewStatus, so
    // each claim-bearing fact shows a "Verified" chip.
    const verified = screen.getAllByLabelText(/Verified/i);
    expect(verified.length).toBeGreaterThan(0);
  });

  it("renders each fact's label and value", () => {
    seedStartedSession();
    renderDesk();
    expect(screen.getByText("Invoice currency")).toBeInTheDocument();
    // value
    expect(screen.getByText("USD")).toBeInTheDocument();
    expect(screen.getByText("Invoice amount")).toBeInTheDocument();
    expect(screen.getByText("USD 48,000.00")).toBeInTheDocument();
  });
});

// ─── Native fact checkboxes (FactRequest) ───────────────────────────────────

describe("CaseDesk — FactRequest native checkboxes", () => {
  it("renders requestable facts as real checkboxes", () => {
    seedStartedSession();
    renderDesk();
    // price-sensitivity, tracking-need, intermediary, institution-variation
    // are requestable in the catalog. We assert at least the known ones exist
    // as native checkbox inputs.
    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes.length).toBeGreaterThan(0);
    // Each checkbox is associated with its fact label.
    expect(screen.getByRole("checkbox", { name: /fee sensitivity/i })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /tracking requirement/i })).toBeInTheDocument();
  });

  it("toggling a checkbox updates the requested-fact set and shows it as requested", async () => {
    const user = userEvent.setup();
    seedStartedSession();
    renderDesk();
    const cb = screen.getByRole("checkbox", { name: /fee sensitivity/i });
    expect(cb).not.toBeChecked();
    await user.click(cb);
    expect(cb).toBeChecked();
  });

  it("Request facts action dispatches request-facts with the selected ids", async () => {
    const user = userEvent.setup();
    seedStartedSession();
    renderDesk();
    const cb = screen.getByRole("checkbox", { name: /fee sensitivity/i });
    await user.click(cb);
    const action = screen.getByRole("button", { name: /request facts/i });
    await user.click(action);
    // After requesting, the fact moves to a "requested"/gathered affordance.
    // We assert the session persisted the requested id by re-reading storage.
    const stored = JSON.parse(
      localStorage.getItem(`relay:case-session:${CASE_ID}`) ?? "{}",
    );
    expect(stored.requestedFactIds).toContain("price-sensitivity");
  });
});

// ─── Native rail selection (RailShortlist) ──────────────────────────────────

describe("CaseDesk — RailShortlist native controls", () => {
  it("renders each rail as a radio for the selected rail (single select)", () => {
    seedStartedSession();
    renderDesk();
    const radios = screen.getAllByRole("radio");
    expect(radios.length).toBeGreaterThanOrEqual(3);
    // All radios share a name (a radio group) so only one is selectable.
    const names = new Set(radios.map((r) => (r as HTMLInputElement).name));
    expect(names.size).toBe(1);
  });

  it("does NOT preselect a recommendation (no radio checked by default)", () => {
    seedStartedSession();
    renderDesk();
    const radios = screen.getAllByRole("radio");
    const checked = radios.filter((r) => (r as HTMLInputElement).checked);
    expect(checked).toHaveLength(0);
  });

  it("renders a shortlist checkbox per rail (multi-select) separate from the radio", () => {
    seedStartedSession();
    renderDesk();
    // Interac e-Transfer is the domestic-only rail — it appears by name.
    expect(screen.getByText(/Interac e-Transfer/i)).toBeInTheDocument();
    // There is a checkbox labelled for adding to the shortlist, distinct from
    // the selection radio.
    const shortlistCheckboxes = screen.getAllByRole("checkbox", { name: /shortlist|add to shortlist/i });
    expect(shortlistCheckboxes.length).toBeGreaterThanOrEqual(3);
  });

  it("marks ineligible rails with an invalid StatusChip", () => {
    seedStartedSession();
    renderDesk();
    // Interac e-Transfer is domestic-only on a USD case → invalid.
    const railRegion = screen.getByRole("region", { name: /Interac e-Transfer/i });
    expect(within(railRegion).getByLabelText(/Invalid/i)).toBeInTheDocument();
  });

  it("selecting a radio sets the selectedRail without disturbing the shortlist", async () => {
    const user = userEvent.setup();
    seedStartedSession();
    renderDesk();
    // Check SWIFT-to-Fedwire into the shortlist first (its checkbox lives in
    // its own rail region, labelled "Add to shortlist").
    const swiftRegion = screen.getByRole("region", { name: /SWIFT wire to Fedwire/i });
    const shortlistCb = within(swiftRegion).getByRole("checkbox", { name: /add to shortlist/i });
    await user.click(shortlistCb);
    expect(shortlistCb).toBeChecked();
    // Then select a DIFFERENT rail via radio.
    const radio = screen.getByRole("radio", { name: /Cross-border ACH/i });
    await user.click(radio);
    expect(radio).toBeChecked();
    // The shortlist checkbox stays checked (independent controls).
    expect(shortlistCb).toBeChecked();
  });
});

// ─── Enrichment states ─────────────────────────────────────────────────────

describe("CaseDesk — enrichment adapter", () => {
  it("renders loading state via AsyncRegion while enrichment loads", () => {
    seedStartedSession();
    renderDesk({ enrichment: { state: "loading", facts: [] } });
    // AsyncRegion's loading state exposes role=status aria-busy.
    expect(screen.getByRole("status", { name: /loading|enrichment/i })).toHaveAttribute("aria-busy", "true");
  });

  it("renders success enrichment facts alongside authored facts", () => {
    seedStartedSession();
    const enrichedFact: CaseFact = {
      id: "enriched-sender-balance",
      label: "Sender available balance (live)",
      value: "USD 52,000.00",
      state: "gathered",
      requestable: false,
    };
    renderDesk({ enrichment: { state: "success", facts: [enrichedFact] } });
    // The enriched fact is rendered at least once (it appears in the enrichment
    // region and, because enrichment ADDS to evidence, is appended to the rail).
    expect(screen.getAllByText("Sender available balance (live)").length).toBeGreaterThan(0);
    expect(screen.getAllByText("USD 52,000.00").length).toBeGreaterThan(0);
    // Authored facts are still present.
    expect(screen.getByText("Invoice currency")).toBeInTheDocument();
  });

  it("keeps authored facts + rail selection usable when enrichment is unavailable", () => {
    seedStartedSession();
    renderDesk({ enrichment: { state: "unavailable", facts: [], message: "Live balance lookup is offline." } });
    // The unavailable note surfaces.
    expect(screen.getByText(/temporarily unavailable|offline/i)).toBeInTheDocument();
    // Authored facts remain.
    expect(screen.getByText("Invoice currency")).toBeInTheDocument();
    // Rails are still selectable.
    expect(screen.getAllByRole("radio").length).toBeGreaterThanOrEqual(3);
  });

  it("keeps authored facts + rail selection usable when enrichment errors, and offers retry", () => {
    seedStartedSession();
    renderDesk({
      enrichment: {
        state: "error",
        facts: [],
        retry: () => {},
      },
    });
    // Error region surfaces.
    expect(screen.getByRole("alert")).toBeInTheDocument();
    // Retry button present.
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
    // Authored facts remain usable.
    expect(screen.getByText("Invoice currency")).toBeInTheDocument();
    expect(screen.getAllByRole("radio").length).toBeGreaterThanOrEqual(3);
  });

  it("never replaces unknown data with invented enrichment values (no enrichment → authored only)", () => {
    seedStartedSession();
    // No enrichment prop at all: the desk renders authored facts and nothing
    // invented. We assert no "live" placeholder appears.
    renderDesk();
    expect(screen.queryByText(/live balance/i)).not.toBeInTheDocument();
  });
});

// ─── Phase rendering (brief → investigate) ──────────────────────────────────

describe("CaseDesk — phase rendering", () => {
  it("renders the brief phase with a Start action when no session exists", () => {
    renderDesk();
    expect(screen.getByRole("button", { name: /start/i })).toBeInTheDocument();
    // The brief surface shows the customer request and verifiedAt meta.
    expect(screen.getByText(/Maple Ridge Outfitters/i)).toBeInTheDocument();
  });

  it("moves to the investigate phase after Start, focusing the new phase heading", async () => {
    const user = userEvent.setup();
    renderDesk();
    await user.click(screen.getByRole("button", { name: /^start/i }));
    // Investigate phase surfaces the evidence workspace heading.
    const heading = await screen.findByRole("heading", { name: /evidence|investigate|gather facts/i });
    expect(heading).toBeInTheDocument();
    // Focus is moved to the phase heading after the transition.
    await waitFor(() => {
      const focused = document.activeElement;
      expect(focused).not.toBeNull();
      // The focused element is or contains the phase heading.
      expect(focused === heading || (focused && focused.contains(heading))).toBe(true);
    });
  });

  it("announces evidence changes through a polite live region", async () => {
    const user = userEvent.setup();
    seedStartedSession();
    renderDesk();
    // A polite live region exists for evidence changes.
    const live = document.querySelector('[aria-live="polite"]');
    expect(live).not.toBeNull();
    // Initially empty (no facts requested yet).
    expect(live?.textContent).toBe("");
    // Request a fact and confirm the live region announces the new facts.
    const cb = screen.getByRole("checkbox", { name: /fee sensitivity/i });
    await user.click(cb);
    await user.click(screen.getByRole("button", { name: /request facts/i }));
    await waitFor(() => {
      expect(live?.textContent ?? "").toMatch(/1 new fact available/i);
    });
  });
});

// ─── customerExplanation debounce + flush (I1) ──────────────────────────────
// The debounce machinery (three refs, setTimeout, unmount cleanup, sync effect)
// is the highest-risk code in CaseDesk. These tests cover the full contract:
//   - writes are debounced 300ms,
//   - blur flushes immediately,
//   - the in-memory text stays authoritative during the pending window,
//   - unmount flushes the latest text (sessionRef defeats the stale closure).
//
// We use vi.useFakeTimers + fireEvent.change on the textarea. user.type with
// fake timers advances time per keystroke (its own delay), which races with
// the 300ms debounce window and makes "NOT updated immediately" assertions
// unreliable. Direct fireEvent.change updates the value without advancing the
// clock, so the debounce window is genuinely under our control.

describe("CaseDesk — customerExplanation debounce + flush", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function getExplanationTextarea() {
    return screen.getByRole("textbox", { name: /explanation for the customer/i });
  }
  function storedExplanation(): string {
    return readStoredSession()?.draft.customerExplanation ?? "";
  }

  it("debounces the write: localStorage is NOT updated until 300ms elapse", () => {
    seedStartedSession();
    renderDesk();
    const textarea = getExplanationTextarea();
    // Type — no clock advancement yet.
    fireEvent.change(textarea, { target: { value: "drafting an explanation" } });
    // localStorage must NOT reflect the typed text yet (write is pending).
    expect(storedExplanation()).toBe("");
    // Advance past the debounce window.
    vi.advanceTimersByTime(300);
    expect(storedExplanation()).toBe("drafting an explanation");
  });

  it("flushes immediately on blur without waiting for the 300ms window", () => {
    seedStartedSession();
    renderDesk();
    const textarea = getExplanationTextarea();
    fireEvent.change(textarea, { target: { value: "flushed on blur" } });
    expect(storedExplanation()).toBe("");
    // Blur flushes the pending write at once.
    fireEvent.blur(textarea);
    expect(storedExplanation()).toBe("flushed on blur");
  });

  it("keeps the in-memory draft authoritative: the controlled input shows typed text BEFORE the 300ms flush", () => {
    seedStartedSession();
    renderDesk();
    const textarea = getExplanationTextarea();
    fireEvent.change(textarea, { target: { value: "visible immediately" } });
    // localStorage is still empty (debounce pending)...
    expect(storedExplanation()).toBe("");
    // ...but the controlled input already shows the typed text — the in-memory
    // state is the source of truth for the UI while a write is pending.
    expect(textarea).toHaveValue("visible immediately");
  });

  it("flushes the latest text on unmount (sessionRef defeats the stale closure)", () => {
    seedStartedSession();
    const { unmount } = renderDesk();
    const textarea = getExplanationTextarea();
    // Simulate several keystrokes without advancing the clock; the timer is
    // rescheduled each time so only the LAST value should be persisted.
    fireEvent.change(textarea, { target: { value: "first" } });
    fireEvent.change(textarea, { target: { value: "second" } });
    fireEvent.change(textarea, { target: { value: "final value" } });
    expect(storedExplanation()).toBe("");
    unmount();
    expect(storedExplanation()).toBe("final value");
  });
});

// ─── Save-failure surfacing (I2) ────────────────────────────────────────────
// The typed SaveResult failure path maps quota/unavailable to a user-visible
// saveError alert, and the in-memory draft MUST survive the failed write.

describe("CaseDesk — surfaces typed save failures and keeps the in-memory draft", () => {
  let setItemSpy: ReturnType<typeof vi.spyOn>;

  afterEach(() => {
    if (setItemSpy) setItemSpy.mockRestore();
  });

  it("shows the save-error alert when a persist fails and preserves the edit", async () => {
    const user = userEvent.setup();
    // Seed BEFORE installing the spy — otherwise the seed write itself throws.
    seedStartedSession();
    // Force every subsequent localStorage.setItem to throw QuotaExceededError.
    // The storage module's saveVersioned classifies this as reason:"quota".
    setItemSpy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota exceeded", "QuotaExceededError");
    });
    renderDesk();
    // Trigger a persist via a non-debounced edit (the price expectation input
    // dispatches edit-draft and persists synchronously).
    const priceInput = screen.getByRole("textbox", { name: /price expectation/i });
    await user.type(priceInput, "next-day");
    // The save-error alert (role=alert) surfaces the quota failure.
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/couldn't save your progress/i);
    expect(alert).toHaveTextContent(/storage is full|quota/i);
    // The in-memory draft survives: the controlled input keeps the edit.
    expect(priceInput).toHaveValue("next-day");
    // A further edit still works (the draft is not frozen by the failure).
    await user.type(priceInput, "!");
    expect(priceInput).toHaveValue("next-day!");
  });
});

// ─── Recovery notice for under_review sessions (I3) ─────────────────────────
// When loadCaseSession returns a recovered session (the case content changed
// under the learner), CaseDesk must surface a visible, accessible notice — not
// a silent empty draft. The preserved firstAttempt must NOT be lost.

describe("CaseDesk — under_review recovery notice", () => {
  it("renders a dismissible recovery notice above the investigate phase", () => {
    seedUnderReviewSession();
    renderDesk();
    // The recovery notice is present, accessible, and carries the key message.
    const notice = screen.getByRole("status", { name: /case updated/i });
    expect(notice).toHaveTextContent(/updated since your last visit/i);
    expect(notice).toHaveTextContent(/draft was reset|re-investigate/i);
    // The investigate phase still renders below the notice.
    expect(screen.getByRole("heading", { name: /gather evidence|investigate/i })).toBeInTheDocument();
  });

  it("preserves the submitted firstAttempt in storage (recovery never loses it)", () => {
    seedUnderReviewSession();
    renderDesk();
    // Rendering the recovered session must not have wiped the preserved
    // firstAttempt. (No material action has been dispatched yet; if it had,
    // persist would re-write storage with firstAttempt intact.)
    const stored = readStoredSession();
    expect(stored?.firstAttempt).not.toBeNull();
    expect(stored?.firstAttempt?.draft.selectedRail).toBe("swift-fedwire");
  });

  it("can be dismissed by the learner", async () => {
    const user = userEvent.setup();
    seedUnderReviewSession();
    renderDesk();
    const notice = screen.getByRole("status", { name: /case updated/i });
    const dismiss = within(notice).getByRole("button", { name: /dismiss|got it|close/i });
    await user.click(dismiss);
    expect(screen.queryByRole("status", { name: /case updated/i })).not.toBeInTheDocument();
  });
});
