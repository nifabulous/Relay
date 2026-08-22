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
});
