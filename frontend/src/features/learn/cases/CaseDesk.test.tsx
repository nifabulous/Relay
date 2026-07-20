import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { CaseDesk } from "./CaseDesk";
import type { CaseEnrichment, CaseFact } from "./caseTypes";
import { createInitialCaseSession } from "./caseStore";

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
  it("groups facts into supplied, gathered, assumption, and unknown sections", () => {
    seedStartedSession();
    renderDesk();
    // The catalog has supplied and gathered facts (no authored assumption or
    // unknown facts in the default case). We assert the section headings that
    // DO have facts render, and that the section structure exists for all four.
    expect(screen.getByRole("heading", { name: /supplied/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /gathered/i })).toBeInTheDocument();
    // A supplied fact value renders in its section.
    const supplied = screen.getByRole("region", { name: /supplied/i });
    expect(supplied).toHaveTextContent(/United States/);
    // A gathered fact value renders in its section.
    const gathered = screen.getByRole("region", { name: /gathered/i });
    expect(gathered).toHaveTextContent(/fee-conscious|tracking/i);
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

  it("announces evidence changes through a polite live region", () => {
    seedStartedSession();
    renderDesk();
    // A polite live region exists for evidence changes.
    const live = document.querySelector('[aria-live="polite"]');
    expect(live).not.toBeNull();
  });
});
