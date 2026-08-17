import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { CASE_CATALOG } from "./cases/caseCatalog";
import { LearnIndexPage } from "./LearnIndexPage";

beforeEach(() => {
  localStorage.clear();
});

describe("LearnIndexPage case browsing", () => {
  it("renders every case in one document-order list", () => {
    render(
      <MemoryRouter>
        <LearnIndexPage />
      </MemoryRouter>,
    );

    const list = screen.getByRole("list", { name: "Customer cases" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(CASE_CATALOG.length);
    expect(within(list).getAllByRole("heading").map((heading) => heading.textContent)).toEqual(
      CASE_CATALOG.map((definition) => definition.title),
    );
  });
});
