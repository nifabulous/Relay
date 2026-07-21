/**
 * Case Desk accessibility (Task 6 verification).
 *
 * Vitest + @testing-library/react layer for the a11y contracts that are
 * awkward to assert in E2E (real keyboard sequences across many phases, the
 * focus-move-on-phase-transition effect, and the debrief's distinct-section
 * invariant). The ReferenceSheet's own focus-trap/Escape/restore contract is
 * already pinned in ReferenceSheet.test.tsx — we don't duplicate it here.
 *
 * Axe checks against the rendered DOM live in e2e/case-desk.spec.ts (axe is
 * best driven through Playwright against the real built app).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { CaseDesk } from "./CaseDesk";
import { CASE_REVISION, supplierCase } from "./caseCatalog";
import type { CaseSession } from "./caseStore";
import { createInitialCaseSession } from "./caseStore";

const CASE_ID = supplierCase.id;
const SESSION_KEY = `relay:case-session:${CASE_ID}`;

// Clear case storage between tests so each test starts from a known state.
beforeEach(() => {
  localStorage.clear();
});

function renderDesk() {
  return render(
    <MemoryRouter>
      <CaseDesk caseId={CASE_ID} />
    </MemoryRouter>,
  );
}

// Drive the desk into the investigate phase by clicking the brief's Start.
async function startInvestigate() {
  renderDesk();
  await userEvent.setup().click(
    screen.getByRole("button", { name: "Start investigation" }),
  );
  await screen.findByRole("heading", { name: "Gather evidence and weigh the rails" });
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe("CaseDesk accessibility", () => {
  it("the brief phase renders a level-1 phase heading", () => {
    renderDesk();
    // The brief is the only phase that uses an <h1> (the investigate/recommend/
    // resolve/debrief phases use <h2>). The case title is the brief heading.
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1).toHaveTextContent(supplierCase.title);
  });

  it("moves focus to the phase heading on transition into investigate", async () => {
    await startInvestigate();
    // The investigate phase heading receives programmatic focus (tabindex=-1)
    // so a screen-reader user lands on the new phase context after the
    // Start click.
    const heading = screen.getByRole("heading", { name: "Gather evidence and weigh the rails" });
    expect(heading).toHaveFocus();
    expect(heading).toHaveAttribute("tabindex", "-1");
  });

  it("exposes the evidence live region with aria-live=polite", async () => {
    await startInvestigate();
    const live = document.querySelector(".case-desk__live");
    expect(live).not.toBeNull();
    expect(live).toHaveAttribute("aria-live", "polite");
  });

  it("announces evidence growth in the live region when facts are requested", async () => {
    await startInvestigate();
    const user = userEvent.setup();
    const live = document.querySelector(".case-desk__live") as HTMLElement;
    expect(live.textContent).toBe("");

    // Toggle the "Fee sensitivity" checkbox and request it.
    await user.click(screen.getByRole("checkbox", { name: /Fee sensitivity/i }));
    await user.click(screen.getByRole("button", { name: "Request facts" }));

    // The live region announces one new fact.
    expect(live.textContent).toMatch(/1 new fact available/i);
  });

  it("renders the brief's simulation disclaimer (synthetic-data disclosure)", () => {
    renderDesk();
    // The brief surfaces the simulation note up front so the learner knows
    // the case is fictional before they invest time.
    const note = screen.getByText(/fictional training simulation/i);
    expect(note).toBeVisible();
  });

  it("labels the investigate phase as a region with an accessible name", async () => {
    await startInvestigate();
    // The wrapping <section aria-label="Investigate the case"> is a landmark
    // a screen-reader user can jump to.
    const region = screen.getByRole("region", { name: "Investigate the case" });
    expect(region).toBeVisible();
  });

  it("supports keyboard-only operation through the investigate phase", async () => {
    await startInvestigate();
    const user = userEvent.setup();

    // Tab from the focused heading to the first control. The exact tab order
    // is not asserted (that would be brittle); we assert that Tab moves focus
    // FORWARD into the desk's interactive controls and that the first
    // checkbox is reachable via keyboard alone.
    const heading = screen.getByRole("heading", { name: "Gather evidence and weigh the rails" });
    expect(heading).toHaveFocus();

    // Tab until focus lands on a checkbox inside the FactRequest fieldset.
    let guard = 0;
    while (guard++ < 25) {
      await user.tab();
      const active = document.activeElement;
      if (active && active.tagName === "INPUT" && active.getAttribute("type") === "checkbox") {
        return; // success: a keyboard-only user reached the first fact.
      }
    }
    throw new Error("Tabbing never reached a FactRequest checkbox");
  });

  it("keeps every StatusChip free of role=status (no chatty live-region)", async () => {
    // Regression: StatusChip must not announce itself as role=status (that
    // would spam the screen reader). It exposes its label via aria-label.
    // The brief phase renders no chips; investigate surfaces them on the
    // evidence rail (verified) + the ineligible Interac rail.
    await startInvestigate();
    const chips = document.querySelectorAll(".status-chip");
    expect(chips.length).toBeGreaterThan(0);
    chips.forEach((chip) => {
      expect(chip).not.toHaveAttribute("role", "status");
    });
  });
});

// ─── Debrief distinct-section invariant (synthetic session) ────────────────
//
// The debrief's load-bearing contract: supported performance and independent
// transfer are DISTINCT sections with distinct accessible names, never blended
// into a single score. We render the CaseDesk against a synthetic completed
// session pinned to the current catalog revision and assert the two regions.

describe("CaseDebrief distinct-section invariant", () => {
  function completedSession(): CaseSession {
    const base = createInitialCaseSession(CASE_ID);
    return {
      ...base,
      schemaVersion: 1,
      caseId: CASE_ID,
      caseRevision: CASE_REVISION,
      status: "completed",
      phase: "debrief",
      requestedFactIds: ["price-sensitivity", "tracking-need"],
      draft: {
        shortlist: ["swift-fedwire"],
        selectedRail: "swift-fedwire",
        reasons: [],
        conditions: [],
        priceExpectation: "Higher fees, deadline justifies.",
        arrivalExpectation: "Same-day value.",
        trackingExpectation: "UETR tracking.",
        customerExplanation: "Recommend SWIFT→Fedwire.",
      },
      firstAttempt: {
        draft: {
          shortlist: ["swift-fedwire"],
          selectedRail: "swift-fedwire",
          reasons: [],
          conditions: [],
          priceExpectation: "Higher fees, deadline justifies.",
          arrivalExpectation: "Same-day value.",
          trackingExpectation: "UETR tracking.",
          customerExplanation: "Recommend SWIFT→Fedwire.",
        },
        outcome: {
          quality: "preferred",
          consequence: "Same-day USD value protected the shipment release.",
          reasoningGap: null,
          soundReasoning: ["Selected the rail matching the disclosed urgency."],
          nextAction: "",
          invalidRailIds: [],
          missingFactIds: [],
          workedExplanation: null,
        },
        submittedAt: "2026-07-01T00:00:00.000Z",
      },
      revisedAttempt: null,
      openedReferenceIds: [],
      transferOutcome: {
        quality: "preferred",
        consequence: "Transfer pick matched the lower-urgency variant.",
        reasoningGap: null,
        soundReasoning: ["Picked the cheap, slower rail."],
        nextAction: "",
        invalidRailIds: [],
        missingFactIds: [],
        workedExplanation: null,
      },
      updatedAt: "2026-07-01T00:00:00.000Z",
    };
  }

  function renderDebrief() {
    localStorage.setItem(SESSION_KEY, JSON.stringify(completedSession()));
    return render(
      <MemoryRouter>
        <CaseDesk caseId={CASE_ID} />
      </MemoryRouter>,
    );
  }

  it("renders supported performance and independent transfer as DISTINCT labelled regions", () => {
    renderDebrief();
    // CaseDebrief sets BOTH aria-label and aria-labelledby on each section.
    // Per the ARIA spec, aria-labelledby takes precedence — so the accessible
    // name resolves to the linked heading text ("Supported performance" /
    // "Independent transfer"), which is exactly the section-distinct label.
    const supported = screen.getByRole("region", { name: "Supported performance" });
    const transfer = screen.getByRole("region", { name: "Independent transfer" });
    expect(supported).toBeVisible();
    expect(transfer).toBeVisible();
    // They are genuinely distinct DOM subtrees.
    expect(supported).not.toBe(transfer);
  });

  it("renders the synthetic-data disclosure as role=note with an accessible name", () => {
    renderDebrief();
    const disclosure = screen.getByRole("note", { name: "Synthetic data disclosure" });
    expect(disclosure).toBeVisible();
    expect(disclosure.textContent).toMatch(/synthetic|fictional/i);
  });

  it("does not blend the two conditions into a single comparison/score", () => {
    renderDebrief();
    const debrief = screen.getByRole("region", { name: "Case debrief" });
    const text = debrief.textContent ?? "";
    // The framing explicitly names the transfer as a DIFFERENT CONDITION, not
    // a comparison — a learner never reads "you did better/worse than".
    expect(text).toMatch(/different condition, not a comparison/i);
  });
});

// ─── RecoveryNotice role=status invariant ───────────────────────────────────

describe("CaseDesk recovery notice accessibility", () => {
  function staleSession(): CaseSession {
    const base = createInitialCaseSession(CASE_ID);
    return {
      ...base,
      caseRevision: "stale-revision",
      status: "in_progress",
      phase: "resolve",
      firstAttempt: {
        draft: base.draft,
        outcome: {
          quality: "defensible",
          consequence: "Stale first attempt.",
          reasoningGap: null,
          soundReasoning: [],
          nextAction: "",
          invalidRailIds: [],
          missingFactIds: [],
          workedExplanation: null,
        },
        submittedAt: "2026-01-01T00:00:00.000Z",
      },
    };
  }

  it("uses role=status (polite) — never role=alert — for the recovery notice", () => {
    localStorage.setItem(SESSION_KEY, JSON.stringify(staleSession()));
    render(
      <MemoryRouter>
        <CaseDesk caseId={CASE_ID} />
      </MemoryRouter>,
    );
    // The recovery notice surfaces as role=status (polite, informational),
    // NOT role=alert (which would interrupt).
    const status = screen.getByRole("status");
    expect(status).toBeVisible();
    expect(status.textContent).toMatch(/updated since your last visit/i);
    // No alert role is rendered anywhere on the desk.
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("dismisses the recovery notice via keyboard without losing the desk", async () => {
    localStorage.setItem(SESSION_KEY, JSON.stringify(staleSession()));
    render(
      <MemoryRouter>
        <CaseDesk caseId={CASE_ID} />
      </MemoryRouter>,
    );
    const user = userEvent.setup();
    const dismiss = screen.getByRole("button", { name: "Got it" });
    dismiss.focus();
    expect(dismiss).toHaveFocus();
    // Activate via keyboard.
    await user.keyboard("{Enter}");
    // The notice is gone but the desk is still alive — the investigate
    // heading is present (the recovered session resumes in investigate).
    await screen.findByRole("heading", { name: "Gather evidence and weigh the rails" });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});

// ─── ReferenceSheet button has an accessible name ──────────────────────────

describe("ReferenceSheet trigger labelling", () => {
  it("the EvidenceRail's open-reference buttons are labelled buttons (not icon-only)", async () => {
    await startInvestigate();
    // Every claim-bearing fact renders an "Open reference" button with a
    // visible text label — never an icon-only control.
    const buttons = screen.getAllByRole("button", { name: "Open reference" });
    expect(buttons.length).toBeGreaterThan(0);
    buttons.forEach((btn) => {
      expect(btn.textContent?.trim()).toBe("Open reference");
    });
  });

  it("the reference sheet's close button has an aria-label", async () => {
    await startInvestigate();
    const user = userEvent.setup();
    await user.click(screen.getAllByRole("button", { name: "Open reference" })[0]);
    // The close button exposes an accessible name even though its visible
    // text is just "Close" — the aria-label disambiguates it from any other
    // "Close" control on the page.
    const close = screen.getByRole("button", { name: /close reference/i });
    expect(close).toBeVisible();
  });
});

// (No module-level footer — every import above is used.)
