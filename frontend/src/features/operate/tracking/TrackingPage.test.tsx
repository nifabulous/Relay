import { describe, it, expect } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Link } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { server } from "../../../test/server";
import { TrackingPage } from "./TrackingPage";

/** Echo the requested UETR back, so a test can tell which payment was fetched. */
function echoUetrHandler() {
  return http.get("/api/track/:uetr", ({ params }) =>
    HttpResponse.json({
      uetr: params.uetr,
      current_status: "CREDITED",
      is_terminal: true,
      event_count: 1,
      sent_amount: "1000.00",
      final_amount: "1000.00",
      total_fees: 0,
      last_updated: "2026-01-01T00:00:00",
      timeline: [
        {
          status: "CREDITED",
          bank_bic: "GTBINGLAXXX",
          bank_name: "GTBank",
          hop: 1,
          timestamp: "2026-01-01T00:00:00",
        },
      ],
      disclaimer: "SIMULATION",
    }),
  );
}

function renderPage(initialEntry: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const user = userEvent.setup();
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter basename="/app" initialEntries={[initialEntry]}>
        {/* Real in-app navigation to a second UETR on the same route. */}
        <Link to="/operate/tracking?uetr=UETR-B">Track B</Link>
        <TrackingPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { user, ...utils };
}

describe("TrackingPage arrival", () => {
  it("fires the lookup automatically when a uetr is in the URL", async () => {
    server.use(echoUetrHandler());
    renderPage("/app/operate/tracking?uetr=UETR-A");

    await waitFor(() => {
      expect(screen.getByText("UETR-A")).toBeVisible();
    });
  });

  it("stays idle with no uetr in the URL", () => {
    server.use(echoUetrHandler());
    renderPage("/app/operate/tracking");

    expect(screen.getByLabelText("UETR")).toHaveValue("");
    expect(screen.queryByLabelText(/payment timeline/i)).toBeNull();
  });

  // React's useState only reads its initializer on mount. Because both `uetr`
  // and `submittedUetr` were seeded from searchParams there, navigating from
  // ?uetr=A to ?uetr=B on the same route reused the mounted component and kept
  // querying A — the page showed one payment's timeline under another
  // payment's URL. In a tool teaching that a UETR identifies exactly one
  // payment, that is the lesson inverted.
  it("re-queries when the uetr search param changes on the same route", async () => {
    server.use(echoUetrHandler());
    const { user } = renderPage("/app/operate/tracking?uetr=UETR-A");

    await waitFor(() => {
      expect(screen.getByText("UETR-A")).toBeVisible();
    });

    await user.click(screen.getByRole("link", { name: "Track B" }));

    await waitFor(() => {
      expect(screen.getByText("UETR-B")).toBeVisible();
    });
    expect(screen.queryByText("UETR-A")).toBeNull();
    // The input follows the URL too, so the form does not contradict the page.
    expect(screen.getByLabelText("UETR")).toHaveValue("UETR-B");
  });

  it("does not clobber a UETR the user typed while the URL is unchanged", async () => {
    server.use(echoUetrHandler());
    const { user } = renderPage("/app/operate/tracking?uetr=UETR-A");

    await waitFor(() => {
      expect(screen.getByText("UETR-A")).toBeVisible();
    });

    const input = screen.getByLabelText("UETR");
    await user.clear(input);
    await user.type(input, "TYPED-BY-HAND");

    expect(input).toHaveValue("TYPED-BY-HAND");
  });
});
