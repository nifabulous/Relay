import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { NotFoundPage } from "./NotFoundPage";

// basename="/app" matches the production BrowserRouter.
function renderAt(url: string) {
  return render(
    <MemoryRouter basename="/app" initialEntries={[url]}>
      <Routes>
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("NotFoundPage", () => {
  it("names the unmatched path", () => {
    renderAt("/app/nope");
    expect(screen.getByText("/app/nope")).toBeVisible();
  });

  it("keeps the query string, which often carries the broken parameter", () => {
    renderAt("/app/operate/tracking?uetr=abc");
    expect(screen.getByText("/app/operate/tracking?uetr=abc")).toBeVisible();
  });

  // The whole point of this page is that the path it prints can be pasted into
  // a bug report. `useLocation()` reports the basename-STRIPPED pathname, so a
  // doubled-basename URL like /app/app/operate/tracking printed as
  // /app/operate/tracking — a path that is real and routable, which hides the
  // very bug the page exists to expose.
  it("reports the doubled basename rather than concealing it", () => {
    renderAt("/app/app/operate/tracking");
    expect(screen.getByText("/app/app/operate/tracking")).toBeVisible();
    expect(screen.queryByText("/app/operate/tracking")).toBeNull();
  });

  it("offers a way back to Overview", () => {
    renderAt("/app/nope");
    expect(screen.getByRole("link", { name: /overview/i })).toHaveAttribute("href", "/app");
  });
});
