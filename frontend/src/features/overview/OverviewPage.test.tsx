import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, it, expect } from "vitest";
import { selectPrimaryAction } from "./selectPrimaryAction";
import { OverviewPage } from "./OverviewPage";

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
});

describe("OverviewPage", () => {
  it("places Learning backup after Recent activity and before the lower data summary", async () => {
    renderOverviewPage();

    const activitySection = screen
      .getByRole("heading", { name: /recent activity/i })
      .closest("section");
    const backupSection = screen
      .getByRole("heading", { name: /learning backup/i })
      .closest("section");

    expect(activitySection).not.toBeNull();
    expect(backupSection).not.toBeNull();

    await waitFor(() => {
      expect(document.querySelector(".overview__status")).not.toBeNull();
    });

    const statusSection = document.querySelector(".overview__status");

    expect(
      activitySection!.compareDocumentPosition(backupSection!) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      backupSection!.compareDocumentPosition(statusSection!) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});
