import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { GlossaryPage } from "./ExplorePage";

function renderGlossary(path = "/app/explore/glossary") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <GlossaryPage />
    </MemoryRouter>,
  );
}

describe("GlossaryPage", () => {
  it("groups terms into scan-friendly reference sections", () => {
    renderGlossary();

    expect(screen.getByRole("heading", { name: "Identifiers" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Correspondent banking" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Tracking & messaging" })).toBeVisible();
    expect(screen.getByText("BIC", { selector: "dt" })).toBeVisible();
  });

  it("shows the filtered result count and a no-results state", async () => {
    const user = userEvent.setup();
    renderGlossary();
    const filter = screen.getByRole("searchbox", { name: "Filter glossary terms" });

    await user.type(filter, "MOD-97");
    expect(screen.getByText("1 term", { selector: "span.glossary-toolbar__count" })).toBeVisible();
    expect(screen.getByText("MOD-97", { selector: "dt" })).toBeVisible();

    await user.clear(filter);
    await user.type(filter, "does-not-exist");
    expect(screen.getByText(/No terms match/i)).toBeVisible();
  });

  it("highlights a term addressed by the search deep link", () => {
    renderGlossary("/app/explore/glossary?term=IBAN");
    expect(screen.getByText("IBAN", { selector: "dt" }).closest(".glossary-entry"))
      .toHaveClass("glossary-entry--highlighted");
  });
});
