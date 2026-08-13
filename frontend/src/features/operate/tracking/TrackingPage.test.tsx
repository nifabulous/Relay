import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
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

// ─── Scheduled pacing controls (RED phase, plan task 0.1) ────────────────────
//
// Acceptance matrix — tracking pacing (implementation in plan task 4.1):
//
//   FE-3a a non-terminal payment polls every 4.5s
//                      → it("polls a non-terminal payment every 4.5 seconds")
//   FE-3b terminal data stops polling / no polling without a UETR
//                      → it("stops polling once the payment is terminal") /
//                        it("does not poll when no UETR is submitted")
//   FE-3c "Advance one event" posts to /api/track/:uetr/skip and refreshes
//                      → it("advances exactly one event via the skip control")
//   FE-3d "Complete simulation" posts to /api/track/:uetr/complete until terminal
//                      → it("completes the simulation via the complete control")
//   FE-3e controls disappear once the response is terminal
//                      → it("hides the controls once the response is terminal") +
//                        it("shows no controls for an already-terminal payment")
//   FE-3f mutation failures are visible and retry-safe
//                      → it("surfaces a skip error and stays retry-safe")
//
// These tests fail today: the page has no controls and never polls. The
// button labels come from plan task 4.1 ("Advance one event",
// "Complete simulation"). Fixed UTC timestamps; no sleeps.

/** A fixed 4-event scheduled plan used by the pacing handlers. */
const PACING_PLAN = [
  { status: "INITIATED", bank_bic: "YOURBANKXX", bank_name: "Your bank", hop: 0, timestamp: "2026-08-13T09:00:00", message: "Payment initiated by Your bank" },
  { status: "ACCEPTED", bank_bic: "CITIUS33XXX", bank_name: "Citibank N.A.", hop: 1, timestamp: "2026-08-13T09:00:50", message: "Accepted by Citibank N.A. for processing" },
  { status: "IN_PROGRESS", bank_bic: "CITIUS33XXX", bank_name: "Citibank N.A.", hop: 2, timestamp: "2026-08-13T09:01:50", message: "Processing at Citibank N.A." },
  { status: "CREDITED", bank_bic: "GTBINGLAXXX", bank_name: "Guaranty Trust Bank", hop: 3, timestamp: "2026-08-13T09:03:20", message: "Credited to beneficiary account by Guaranty Trust Bank" },
] as const;

const POLL_INTERVAL_MS = 4500;

function pacingPayload(uetr: unknown, revealed: number) {
  const timeline = PACING_PLAN.slice(0, revealed);
  const last = timeline[timeline.length - 1];
  const terminal = last.status === "CREDITED";
  return {
    uetr,
    current_status: last.status,
    is_terminal: terminal,
    event_count: timeline.length,
    sent_amount: "5000.00",
    final_amount: terminal ? "4865.00" : null,
    total_fees: terminal ? 135 : null,
    last_updated: last.timestamp,
    timeline,
    disclaimer: "SIMULATION",
  };
}

describe("Scheduled pacing controls", () => {
  it("polls a non-terminal payment every 4.5 seconds", async () => {
    let requests = 0;
    server.use(
      http.get("/api/track/:uetr", ({ params }) => {
        requests += 1;
        return HttpResponse.json(pacingPayload(params.uetr, 1));
      }),
    );

    vi.useFakeTimers();
    try {
      renderPage("/app/operate/tracking?uetr=UETR-A");
      // Flush the mount fetch so the count is deterministic.
      await act(async () => {});
      expect(requests).toBe(1);

      await act(async () => {
        vi.advanceTimersByTime(POLL_INTERVAL_MS + 500);
      });
      expect(requests).toBe(2);

      await act(async () => {
        vi.advanceTimersByTime(POLL_INTERVAL_MS + 500);
      });
      expect(requests).toBe(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it("stops polling once the payment is terminal", async () => {
    let requests = 0;
    server.use(
      http.get("/api/track/:uetr", ({ params }) => {
        requests += 1;
        return HttpResponse.json(pacingPayload(params.uetr, PACING_PLAN.length));
      }),
    );

    vi.useFakeTimers();
    try {
      renderPage("/app/operate/tracking?uetr=UETR-A");
      await act(async () => {});
      expect(requests).toBe(1);

      await act(async () => {
        vi.advanceTimersByTime(POLL_INTERVAL_MS * 4);
      });
      expect(requests).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not poll when no UETR is submitted", async () => {
    let requests = 0;
    server.use(
      http.get("/api/track/:uetr", ({ params }) => {
        requests += 1;
        return HttpResponse.json(pacingPayload(params.uetr, 1));
      }),
    );

    vi.useFakeTimers();
    try {
      renderPage("/app/operate/tracking");
      await act(async () => {
        vi.advanceTimersByTime(POLL_INTERVAL_MS * 4);
      });
      expect(requests).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("advances exactly one event via the skip control to the right UETR", async () => {
    let revealed = 1;
    let skippedUetr: string | null = null;
    server.use(
      http.get("/api/track/:uetr", ({ params }) =>
        HttpResponse.json(pacingPayload(params.uetr, revealed)),
      ),
      http.post("/api/track/:uetr/skip", ({ params }) => {
        skippedUetr = String(params.uetr);
        revealed += 1;
        return HttpResponse.json(pacingPayload(params.uetr, revealed));
      }),
    );
    const { user } = renderPage("/app/operate/tracking?uetr=UETR-A");

    await screen.findByText("UETR-A");
    await user.click(screen.getByRole("button", { name: "Advance one event" }));

    // The refreshed timeline now shows the revealed intermediary hop.
    expect(await screen.findByText("Citibank N.A.")).toBeVisible();
    expect(skippedUetr).toBe("UETR-A");
  });

  it("completes the simulation via the complete control", async () => {
    let revealed = 1;
    server.use(
      http.get("/api/track/:uetr", ({ params }) =>
        HttpResponse.json(pacingPayload(params.uetr, revealed)),
      ),
      http.post("/api/track/:uetr/complete", ({ params }) => {
        revealed = PACING_PLAN.length;
        return HttpResponse.json(pacingPayload(params.uetr, revealed));
      }),
    );
    const { user } = renderPage("/app/operate/tracking?uetr=UETR-A");

    await screen.findByText("UETR-A");
    await user.click(screen.getByRole("button", { name: "Complete simulation" }));

    // Terminal state: credited bank visible, amounts revealed, controls gone.
    expect(
      await screen.findByText("Credited to beneficiary account by Guaranty Trust Bank"),
    ).toBeVisible();
  });

  it("hides the controls once the response is terminal", async () => {
    let revealed = 1;
    server.use(
      http.get("/api/track/:uetr", ({ params }) =>
        HttpResponse.json(pacingPayload(params.uetr, revealed)),
      ),
      http.post("/api/track/:uetr/skip", ({ params }) => {
        revealed += 1;
        return HttpResponse.json(pacingPayload(params.uetr, revealed));
      }),
      http.post("/api/track/:uetr/complete", ({ params }) => {
        revealed = PACING_PLAN.length;
        return HttpResponse.json(pacingPayload(params.uetr, revealed));
      }),
    );
    const { user } = renderPage("/app/operate/tracking?uetr=UETR-A");

    await screen.findByText("UETR-A");
    await user.click(screen.getByRole("button", { name: "Complete simulation" }));

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Advance one event" })).toBeNull();
      expect(screen.queryByRole("button", { name: "Complete simulation" })).toBeNull();
    });
  });

  it("shows no controls for an already-terminal payment", async () => {
    server.use(
      http.get("/api/track/:uetr", ({ params }) =>
        HttpResponse.json(pacingPayload(params.uetr, PACING_PLAN.length)),
      ),
    );
    renderPage("/app/operate/tracking?uetr=UETR-A");

    await screen.findByText("UETR-A");
    expect(screen.queryByRole("button", { name: "Advance one event" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Complete simulation" })).toBeNull();
  });

  it("surfaces a skip error and stays retry-safe", async () => {
    server.use(
      http.get("/api/track/:uetr", ({ params }) =>
        HttpResponse.json(pacingPayload(params.uetr, 1)),
      ),
      http.post("/api/track/:uetr/skip", () =>
        HttpResponse.json({ detail: "boom" }, { status: 500 }),
      ),
    );
    const { user } = renderPage("/app/operate/tracking?uetr=UETR-A");

    await screen.findByText("UETR-A");
    await user.click(screen.getByRole("button", { name: "Advance one event" }));

    // The failure is visible...
    expect(await screen.findByText(/could not|couldn\'t|failed|error/i)).toBeVisible();
    // ...and the control is enabled again, so retry is possible.
    expect(screen.getByRole("button", { name: "Advance one event" })).toBeEnabled();
  });
});
