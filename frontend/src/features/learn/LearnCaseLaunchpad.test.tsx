import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { LearnCaseLaunchpad } from "./LearnCaseLaunchpad";
import { CASE_CATALOG, supplierCase } from "./cases/caseCatalog";
import { createInitialCaseSession, type CaseSession } from "./cases/caseStore";
import type { CaseEntrySnapshot } from "./cases/selectDominantCase";

beforeEach(() => {
  localStorage.clear();
});

function snapshot(
  index: number,
  session: CaseSession | null,
  definition = CASE_CATALOG[index]!,
): CaseEntrySnapshot {
  return { definition, session, index };
}

function session(caseId: string, status: CaseSession["status"]): CaseSession {
  return {
    ...createInitialCaseSession(caseId),
    status,
    phase: status === "completed" ? "debrief" : "investigate",
    updatedAt: "2026-08-20T10:00:00.000Z",
  } as CaseSession;
}

function renderLaunchpad(
  entries: readonly CaseEntrySnapshot[],
  dominant: CaseEntrySnapshot | null = entries[0] ?? null,
) {
  return render(
    <MemoryRouter>
      <LearnCaseLaunchpad
        entries={entries}
        dominant={dominant}
        practice={{ doneToday: false, reviewsDue: 2, streak: 3 }}
      />
    </MemoryRouter>,
  );
}

describe("LearnCaseLaunchpad", () => {
  it("puts the dominant active case first and preserves its Resume action", () => {
    const active = snapshot(1, session(CASE_CATALOG[1]!.id, "in_progress"));
    renderLaunchpad([active, snapshot(0, null)], active);

    const desk = screen.getByRole("region", { name: "Active case desk" });
    const activeList = within(desk).getByRole("list", { name: /active case/i });
    expect(within(activeList).getAllByRole("listitem")[0]).toHaveTextContent(active.definition.title);
    expect(within(activeList).getByRole("link", { name: /resume case/i })).toHaveAttribute(
      "href",
      `/learn/cases/${active.definition.id}`,
    );
  });

  it("keeps secondary cases in a compact list with their real actions", () => {
    const dominant = snapshot(0, null);
    const secondary = snapshot(1, null);
    renderLaunchpad([dominant, secondary], dominant);

    const other = screen.getByRole("list", { name: "Other cases" });
    expect(within(other).getAllByRole("listitem")).toHaveLength(1);
    expect(within(other).getByRole("link", { name: /start case/i })).toHaveAttribute(
      "href",
      `/learn/cases/${secondary.definition.id}`,
    );
  });

  it("shows safe under-review alternatives without inventing an active case", () => {
    const underReview = snapshot(0, null, { ...supplierCase, reviewStatus: "under_review" });
    renderLaunchpad([underReview], null);

    expect(screen.queryByRole("list", { name: /active case/i })).toBeNull();
    expect(screen.getByRole("link", { name: /which rail/i })).toHaveAttribute("href", "/learn/lab-7");
    expect(screen.getByRole("link", { name: /start drill/i })).toHaveAttribute("href", "/learn/practice");
    expect(screen.getByRole("link", { name: "Technical labs" })).toHaveAttribute("href", "#technical-labs");
  });

  it("exposes named route links and explicit list/listitem structure", () => {
    const dominant = snapshot(0, null);
    renderLaunchpad([dominant, snapshot(1, null)], dominant);

    expect(screen.getByRole("link", { name: "Cases" })).toHaveAttribute("href", "#active-case-desk");
    expect(screen.getByRole("link", { name: "Technical labs" })).toHaveAttribute("href", "#technical-labs");
    expect(screen.getByRole("link", { name: /start drill/i })).toHaveAttribute("href", "/learn/practice");

    const desk = screen.getByRole("region", { name: "Active case desk" });
    for (const list of within(desk).getAllByRole("list")) {
      expect(within(list).getAllByRole("listitem").length).toBeGreaterThan(0);
    }
  });

  it("does not render the retired all-cases grid or standalone practice strip", () => {
    const dominant = snapshot(0, null);
    const { container } = renderLaunchpad([dominant], dominant);

    expect(container.querySelector(".learn-case-desks__track")).toBeNull();
    expect(container.querySelector(".learn-practice-strip")).toBeNull();
    expect(container.querySelector("#technical-labs")).toBeNull();
  });
});
