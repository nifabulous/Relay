import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { CASE_CATALOG } from "./cases/caseCatalog";
import { LearnIndexPage } from "./LearnIndexPage";

beforeEach(() => {
  localStorage.clear();
});

describe("LearnIndexPage case browsing", () => {
  it("renders the dominant case first and the remaining cases in Other cases", () => {
    render(
      <MemoryRouter>
        <LearnIndexPage />
      </MemoryRouter>,
    );

    const active = screen.getByRole("list", { name: "Active case" });
    const other = screen.getByRole("list", { name: "Other cases" });
    expect(within(active).getAllByRole("listitem")).toHaveLength(1);
    expect(within(other).getAllByRole("listitem")).toHaveLength(CASE_CATALOG.length - 1);
    expect(within(active).getByRole("heading")).toHaveTextContent(CASE_CATALOG[0]!.title);
    expect(within(other).getAllByRole("heading").map((heading) => heading.textContent)).toEqual(
      CASE_CATALOG.slice(1).map((definition) => definition.title),
    );
  });

  it("wires the Technical labs link to the rendered technical-labs target", () => {
    render(
      <MemoryRouter>
        <LearnIndexPage />
      </MemoryRouter>,
    );

    const technicalLabsLink = screen.getByRole("link", { name: "Technical labs" });
    const technicalLabsTarget = document.getElementById("technical-labs");

    expect(technicalLabsLink).toHaveAttribute("href", "#technical-labs");
    expect(technicalLabsTarget).not.toBeNull();
  });

  it("surfaces the learning pulse and a scannable lab status table", () => {
    render(
      <MemoryRouter>
        <LearnIndexPage />
      </MemoryRouter>,
    );

    const practice = screen.getByRole("region", { name: "Daily practice" });
    expect(within(practice).getByText("day streak")).toBeInTheDocument();
    expect(within(practice).getByText("reviews due")).toBeInTheDocument();
    // With no drill recorded today the score is 0 out of the drill length —
    // the practice store's numbers, never a stand-in for them.
    expect(within(practice).getByText("correct today")).toBeInTheDocument();
    expect(within(practice).getByText(/^0 of 5$/)).toBeInTheDocument();

    const labs = screen.getByRole("list", { name: "Curriculum modules" });
    expect(within(labs).getByText("Next module")).toBeInTheDocument();
    expect(within(labs).getAllByText("Locked").length).toBeGreaterThan(0);
  });

  it("shows the active case step and progress context before the action", () => {
    render(
      <MemoryRouter>
        <LearnIndexPage />
      </MemoryRouter>,
    );

    const active = screen.getByRole("list", { name: "Active case" });
    expect(within(active).getByText(/step \d+ of 5/i)).toBeInTheDocument();

    // The bar reports the phase scale the learner is shown, not a percentage
    // that exists only in the DOM.
    const bar = within(active).getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuemax", "5");
    expect(bar).toHaveAccessibleName("Case progress");
  });
});
