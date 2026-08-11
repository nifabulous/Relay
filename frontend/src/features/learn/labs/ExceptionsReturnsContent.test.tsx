import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../../../test/server";
import { ExceptionsReturnsContent } from "./ExceptionsReturnsContent";

function renderLab(onCheckpoint = vi.fn()) {
  const user = userEvent.setup();
  const utils = render(
    <ExceptionsReturnsContent
      moduleId="exceptions-returns"
      isComplete={false}
      onCheckpoint={onCheckpoint}
    />,
  );
  return { user, onCheckpoint, ...utils };
}

const REJECTED_FIXTURE = {
  uetr: "11111111-2222-3333-4444-555555555555",
  current_status: "REJECTED",
  is_terminal: true,
  event_count: 3,
  sent_amount: "5000.00",
  final_amount: "5000.00",
  total_fees: 0,
  last_updated: "2026-08-11T12:00:00Z",
  timeline: [
    {
      status: "INITIATED",
      bank_bic: "BOFAUS3N",
      bank_name: "Bank of America",
      hop: 0,
      timestamp: "2026-08-11T12:00:00Z",
      amount: "5000.00",
      currency: "USD",
      message: "Payment initiated by Bank of America",
    },
    {
      status: "ACCEPTED",
      bank_bic: "CITIUS33",
      bank_name: "Citibank",
      hop: 1,
      timestamp: "2026-08-11T12:00:50Z",
      amount: "5000.00",
      currency: "USD",
      message: "Accepted by Citibank for processing",
    },
    {
      status: "REJECTED",
      bank_bic: "CITIUS33",
      bank_name: "Citibank",
      hop: 2,
      timestamp: "2026-08-11T12:02:20Z",
      amount: "5000.00",
      currency: "USD",
      message: "Rejected by Citibank: compliance screening failed",
    },
  ],
  disclaimer: "SIMULATION",
};

function mockTrackCreate() {
  server.use(
    http.post("/api/track/create", () => HttpResponse.json(REJECTED_FIXTURE)),
  );
}

describe("ExceptionsReturnsContent", () => {
  it("renders the taxonomy, return codes, recall, and aftermath sections", () => {
    renderLab();
    expect(screen.getByText(/when payments don't make it/i)).toBeVisible();
    expect(screen.getByText(/the pacs\.004 and its reason codes/i)).toBeVisible();
    expect(screen.getByText(/asking for your money back/i)).toBeVisible();
    expect(screen.getByText(/the NO_MATCH aftermath/i)).toBeVisible();
  });

  it("shows the exception taxonomy with message types", () => {
    renderLab();
    expect(screen.getAllByText("pacs.002 (RJCT)").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("pacs.004").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("camt.056 → camt.029").length).toBeGreaterThanOrEqual(1);
  });

  it("lists the return reason codes", () => {
    renderLab();
    for (const code of ["AC01", "AC04", "AC06", "AM05", "CUST", "FOCR", "FRAD"]) {
      expect(screen.getAllByText(code).length).toBeGreaterThanOrEqual(1);
    }
  });

  it("shows the simulation notice", () => {
    renderLab();
    expect(screen.getByRole("note")).toHaveTextContent(/not a real payment/i);
  });

  it("creates the doomed payment and emits simulate-rejection", async () => {
    mockTrackCreate();
    const { user, onCheckpoint } = renderLab();

    await user.click(screen.getByRole("button", { name: /create the doomed payment/i }));

    await waitFor(() => {
      expect(onCheckpoint).toHaveBeenCalledWith("simulate-rejection");
    });
    expect(screen.getByText(/rejected by citibank/i)).toBeVisible();
  });

  it("sends outcome=rejected to the tracking API", async () => {
    let captured: { outcome?: string } = {};
    server.use(
      http.post("/api/track/create", async ({ request }) => {
        captured = (await request.json()) as { outcome: string };
        return HttpResponse.json(REJECTED_FIXTURE);
      }),
    );
    const { user } = renderLab();

    await user.click(screen.getByRole("button", { name: /create the doomed payment/i }));

    await waitFor(() => {
      expect(captured.outcome).toBe("rejected");
    });
  });

  it("hides the rejection-reading exercise until the payment exists", () => {
    renderLab();
    expect(screen.queryByText(/where did it die/i)).toBeNull();
  });

  it("emits read-rejection when the learner names Citibank", async () => {
    mockTrackCreate();
    const { user, onCheckpoint } = renderLab();

    await user.click(screen.getByRole("button", { name: /create the doomed payment/i }));
    await waitFor(() => {
      expect(screen.getByText(/where did it die/i)).toBeVisible();
    });

    await user.type(screen.getByLabelText(/bank name/i), "Citibank");
    await user.click(screen.getByRole("button", { name: /check answer/i }));

    await waitFor(() => {
      expect(onCheckpoint).toHaveBeenCalledWith("read-rejection");
    });
  });

  it("rejects GTBank with feedback pointing back at the timeline", async () => {
    mockTrackCreate();
    const { user, onCheckpoint } = renderLab();

    await user.click(screen.getByRole("button", { name: /create the doomed payment/i }));
    await waitFor(() => {
      expect(screen.getByText(/where did it die/i)).toBeVisible();
    });

    await user.type(screen.getByLabelText(/bank name/i), "GTBank");
    await user.click(screen.getByRole("button", { name: /check answer/i }));

    await waitFor(() => {
      expect(screen.getByText(/never received anything to reject/i)).toBeVisible();
    });
    expect(onCheckpoint).not.toHaveBeenCalledWith("read-rejection");
  });

  it("emits map-return-code for AC04 on the closed-account story", async () => {
    const { user, onCheckpoint } = renderLab();

    await user.click(screen.getByRole("button", { name: "AC04" }));

    await waitFor(() => {
      expect(onCheckpoint).toHaveBeenCalledWith("map-return-code");
    });
  });

  it("does not emit map-return-code for AC01", async () => {
    const { user, onCheckpoint } = renderLab();

    await user.click(screen.getByRole("button", { name: "AC01" }));
    expect(onCheckpoint).not.toHaveBeenCalledWith("map-return-code");
  });

  it("emits recall-reality for the request-not-command answer", async () => {
    const { user, onCheckpoint } = renderLab();

    await user.click(
      screen.getByRole("button", { name: /asks the beneficiary bank to return the funds/i }),
    );

    await waitFor(() => {
      expect(onCheckpoint).toHaveBeenCalledWith("recall-reality");
    });
  });

  it("does not emit recall-reality for the auto-reverse answer", async () => {
    const { user, onCheckpoint } = renderLab();

    await user.click(screen.getByRole("button", { name: /reverses the settlement automatically/i }));
    expect(onCheckpoint).not.toHaveBeenCalledWith("recall-reality");
  });

  it("emits misdirected-aftermath for the fast-recall answer", async () => {
    const { user, onCheckpoint } = renderLab();

    await user.click(
      screen.getByRole("button", { name: /request a recall — speed matters/i }),
    );

    await waitFor(() => {
      expect(onCheckpoint).toHaveBeenCalledWith("misdirected-aftermath");
    });
  });

  it("does not emit misdirected-aftermath for the chargeback answer", async () => {
    const { user, onCheckpoint } = renderLab();

    await user.click(screen.getByRole("button", { name: /file a chargeback/i }));
    expect(onCheckpoint).not.toHaveBeenCalledWith("misdirected-aftermath");
  });

  it("shows an error when payment creation fails", async () => {
    server.use(
      http.post("/api/track/create", () => HttpResponse.json({ detail: "boom" }, { status: 500 })),
    );
    const { user } = renderLab();

    await user.click(screen.getByRole("button", { name: /create the doomed payment/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/could not create/i);
    });
  });
});
