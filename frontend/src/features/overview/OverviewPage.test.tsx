import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, it, expect } from "vitest";
import { http, HttpResponse } from "msw";
import { selectPrimaryAction, type OverviewContext } from "./selectPrimaryAction";
import { OverviewPage } from "./OverviewPage";
import { server } from "../../test/server";
import { saveProgress } from "../../lib/persistence/storage";

function renderOverviewPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <OverviewPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
});

describe("selectPrimaryAction", () => {
  it("selects explore_intro for first-time users", () => {
    const action = selectPrimaryAction({ firstVisit: true });
    expect(action.kind).toBe("explore_intro");
    expect(action.href).toBeTruthy();
    expect(action.label).toBeTruthy();
  });

  it("selects resume_operate when operate draft is more recent than learn", () => {
    const action = selectPrimaryAction({
      unfinishedOperateAt: 20,
      unfinishedLearnAt: 10,
    });
    expect(action.kind).toBe("resume_operate");
  });

  it("selects resume_learn when learn is more recent than operate", () => {
    const action = selectPrimaryAction({
      unfinishedOperateAt: 10,
      unfinishedLearnAt: 20,
    });
    expect(action.kind).toBe("resume_learn");
  });

  it("selects next_learn when curriculum is incomplete with no active work", () => {
    const action = selectPrimaryAction({
      curriculumComplete: false,
      firstVisit: false,
    });
    expect(action.kind).toBe("next_learn");
  });

  it("selects prepare_payment when curriculum is complete", () => {
    const action = selectPrimaryAction({
      curriculumComplete: true,
      firstVisit: false,
    });
    expect(action.kind).toBe("prepare_payment");
  });

  it("prioritizes first visit over everything", () => {
    const action = selectPrimaryAction({
      firstVisit: true,
      curriculumComplete: true,
      unfinishedOperateAt: 100,
    });
    expect(action.kind).toBe("explore_intro");
  });

  it("prioritizes unfinished work over next module", () => {
    const action = selectPrimaryAction({
      unfinishedLearnAt: 50,
      curriculumComplete: false,
    });
    expect(action.kind).toBe("resume_learn");
  });

  // The production router mounts with basename="/app" and react-router
  // prepends it, so a `to` value that also carries /app renders /app/app/...
  // and dies on the catch-all route — the historical double-basename bug.
  it("never returns an /app-prefixed href from any branch of the table", () => {
    const contexts: OverviewContext[] = [
      { firstVisit: true },
      { unfinishedOperateAt: 20, unfinishedLearnAt: 10 },
      { unfinishedOperateAt: 10 },
      { unfinishedLearnAt: 10 },
      { curriculumComplete: false, nextModuleId: "lab-2" },
      { curriculumComplete: true },
    ];
    for (const ctx of contexts) {
      expect(selectPrimaryAction(ctx).href.startsWith("/app")).toBe(false);
    }
  });
});

describe("OverviewPage", () => {
  // The Learning backup panel is deliberately hidden for now. LearnerDataPanel
  // and LearnerDataPanel.test.tsx are untouched, so the component stays covered;
  // this asserts it is absent from the page so it cannot reappear unnoticed.
  // Restore the placement assertion when the panel comes back.
  it("does not render the Learning backup panel", async () => {
    renderOverviewPage();

    await waitFor(() => {
      expect(document.querySelector(".overview__status")).not.toBeNull();
    });

    expect(screen.queryByRole("heading", { name: /learning backup/i })).toBeNull();
    expect(document.querySelector(".overview__learner-data")).toBeNull();
  });
});

/**
 * Adaptive Command Center rendering contract
 * (docs/superpowers/specs/2026-08-21-overview-adaptive-command-center-design.md).
 * Assertions target user-visible copy and region presence, never query state.
 */
describe("OverviewPage adaptive command center", () => {
  it("renders the explicit page heading and supporting copy", () => {
    renderOverviewPage();

    expect(screen.getByRole("heading", { level: 1, name: "Overview" })).toBeInTheDocument();
    expect(screen.getByText("Your payment routing learning hub.")).toBeInTheDocument();
  });

  it("renders the first-visit action with its exact copy contract and one CTA", () => {
    renderOverviewPage();

    // Exactly one primary CTA, carrying the explore_intro copy.
    const ctas = document.querySelectorAll(".overview__cta");
    expect(ctas).toHaveLength(1);
    expect(ctas[0]).toHaveAttribute("href", "/explore?intro=1");
    expect(ctas[0]).toHaveAccessibleName(/explore how payments move/i);

    expect(screen.getByText("Start here")).toBeInTheDocument();
    expect(document.querySelector(".overview__action-title")).toHaveTextContent(
      "Explore how payments move",
    );
    expect(
      screen.getByText("Start with an illustrative payment flow."),
    ).toBeInTheDocument();
  });

  it("shows the zero-progress starting point and omits zero-value pulse rows", () => {
    renderOverviewPage();

    const pulse = screen.getByRole("complementary", { name: /learning pulse/i });
    expect(pulse).toHaveTextContent("0 / 16");
    // Zero streak and zero reviews are omitted rather than rendered as stats.
    expect(pulse).not.toHaveTextContent(/day streak/i);
    expect(pulse).not.toHaveTextContent(/due for review/i);
  });

  it("keeps the four quick routes as real links to their destinations", () => {
    renderOverviewPage();

    const expected = [
      [/^search/i, "/explore"],
      [/^directory/i, "/explore/banks"],
      [/^track/i, "/operate"],
      [/^practice/i, "/learn/practice"],
    ] as const;
    for (const [name, href] of expected) {
      const link = screen.getByRole("link", { name: new RegExp(name.source, name.flags) });
      expect(link).toHaveAttribute("href", href);
    }
  });

  it("shows the first-visit empty activity copy", () => {
    renderOverviewPage();

    expect(
      screen.getByText("No activity yet. Start by exploring how payments move."),
    ).toBeInTheDocument();
  });

  it("adapts copy for a returning learner mid-curriculum", () => {
    saveProgress({ schemaVersion: 1, completedModuleIds: ["lab-1"] });
    renderOverviewPage();

    // next_learn kind — title, supporting line, and CTA label per the contract.
    expect(document.querySelector(".overview__action-title")).toHaveTextContent(
      "Continue to the next module",
    );
    expect(
      screen.getByText("Build on your progress with the next lesson."),
    ).toBeInTheDocument();
    expect(document.querySelector(".overview__cta")).toHaveAttribute(
      "href",
      "/learn/lab-2",
    );
    // Progress reflects the seeded module; still no streak without practice.
    expect(screen.getByRole("complementary", { name: /learning pulse/i })).toHaveTextContent(
      "1 / 16",
    );
    // Returning user with an empty feed gets the returning-visitor copy.
    expect(
      screen.getByText("No activity yet. Your recent simulations and learning will appear here."),
    ).toBeInTheDocument();
  });

  it("degrades the system inventory to a quiet note when health fails", async () => {
    server.use(
      http.get("/api/health", () => HttpResponse.error(), { once: true }),
    );

    renderOverviewPage();

    await waitFor(() => {
      expect(
        screen.getByText("System inventory is temporarily unavailable."),
      ).toBeInTheDocument();
    });

    // The failure must not take the rest of the page down with it.
    expect(document.querySelector(".overview__cta")).not.toBeNull();
    expect(screen.getByRole("complementary", { name: /learning pulse/i })).toBeInTheDocument();
  });
});
