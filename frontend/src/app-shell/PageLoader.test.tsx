import { lazy, Suspense } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PageLoader } from "./PageLoader";

describe("PageLoader", () => {
  it("renders a named route loader while Explore is suspended", () => {
    const SuspendedExplore = lazy(() => new Promise<never>(() => {}));

    render(
      <Suspense fallback={<PageLoader destination="Explore" />}>
        <SuspendedExplore />
      </Suspense>,
    );

    expect(screen.getByRole("status", { name: "Loading Explore" })).toBeVisible();
  });
});
