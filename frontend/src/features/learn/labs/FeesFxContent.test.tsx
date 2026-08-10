import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../../../test/server";
import { FeesFxContent } from "./FeesFxContent";

function renderLab(onCheckpoint = vi.fn()) {
  const user = userEvent.setup();
  const utils = render(
    <FeesFxContent moduleId="fees-fx" isComplete={false} onCheckpoint={onCheckpoint} />,
  );
  return { user, onCheckpoint, ...utils };
}

function feeFixture(chargeCode: string) {
  const sha = chargeCode !== "OUR";
  return {
    charge_code: chargeCode,
    currency: "USD",
    sent_amount: 1000,
    received_amount: sha ? 975 : 1000,
    total_fees: 25,
    sender_pays_extra: chargeCode === "OUR" ? 25 : 0,
    hops: [
      {
        bic: "CITIUS33XXX",
        bank_name: "Citibank N.A.",
        fee: 15,
        amount_in: 1000,
        amount_out: sha ? 985 : 1000,
        cumulative_fees: 15,
      },
      {
        bic: "CHASUS33XXX",
        bank_name: "JPMorgan Chase",
        fee: 10,
        amount_in: sha ? 985 : 1000,
        amount_out: sha ? 975 : 1000,
        cumulative_fees: 25,
      },
    ],
    fee_breakdown: `Charge code ${chargeCode}. Total fees: 25 USD.`,
  };
}

describe("FeesFxContent", () => {
  it("renders the concept, simulator, and FX sections", () => {
    renderLab();
    expect(screen.getByText(/case of the missing \$25/i)).toBeVisible();
    expect(screen.getByText(/Simulate the fee chain/i)).toBeVisible();
    expect(screen.getByText(/FX margin/i, { selector: "h2" })).toBeVisible();
  });

  it("renders the three charge-code buttons", () => {
    renderLab();
    const group = screen.getByRole("group", { name: /charge code/i });
    expect(group).toBeVisible();
    for (const code of ["OUR", "SHA", "BEN"]) {
      expect(screen.getByRole("button", { name: code })).toBeVisible();
    }
  });

  it("shows the hop table after running a simulation", async () => {
    server.use(
      http.post("/api/fees/simulate", async ({ request }) => {
        const body = (await request.json()) as { charge_code: string };
        return HttpResponse.json(feeFixture(body.charge_code));
      }),
    );

    const { user } = renderLab();
    await user.click(screen.getByRole("button", { name: "SHA" }));

    await waitFor(() => {
      expect(screen.getAllByText(/Citibank N.A./).length).toBeGreaterThanOrEqual(1);
    });
    expect(screen.getAllByText(/JPMorgan Chase/).length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("975.00").length).toBeGreaterThanOrEqual(1);
  });

  it("does not emit simulate-fees after a single charge code", async () => {
    server.use(
      http.post("/api/fees/simulate", async ({ request }) => {
        const body = (await request.json()) as { charge_code: string };
        return HttpResponse.json(feeFixture(body.charge_code));
      }),
    );

    const { user, onCheckpoint } = renderLab();
    await user.click(screen.getByRole("button", { name: "SHA" }));
    await waitFor(() => {
      expect(screen.getAllByText(/Citibank N.A./).length).toBeGreaterThanOrEqual(1);
    });
    expect(onCheckpoint).not.toHaveBeenCalledWith("simulate-fees");
  });

  it("emits simulate-fees after two different charge codes are compared", async () => {
    server.use(
      http.post("/api/fees/simulate", async ({ request }) => {
        const body = (await request.json()) as { charge_code: string };
        return HttpResponse.json(feeFixture(body.charge_code));
      }),
    );

    const { user, onCheckpoint } = renderLab();
    await user.click(screen.getByRole("button", { name: "SHA" }));
    await waitFor(() => {
      expect(screen.getAllByText(/Citibank N.A./).length).toBeGreaterThanOrEqual(1);
    });
    await user.click(screen.getByRole("button", { name: "OUR" }));

    await waitFor(() => {
      expect(onCheckpoint).toHaveBeenCalledWith("simulate-fees");
    });
  });

  it("emits predict-received for the correct SHA prediction", async () => {
    const { user, onCheckpoint } = renderLab();

    await user.type(screen.getByLabelText(/amount received/i), "975");
    await user.click(screen.getByRole("button", { name: /check answer/i }));

    await waitFor(() => {
      expect(onCheckpoint).toHaveBeenCalledWith("predict-received");
    });
  });

  it("rejects the sent amount as a prediction with targeted feedback", async () => {
    const { user, onCheckpoint } = renderLab();

    await user.type(screen.getByLabelText(/amount received/i), "1000");
    await user.click(screen.getByRole("button", { name: /check answer/i }));

    await waitFor(() => {
      expect(screen.getByText(/that's what the sender sends/i)).toBeVisible();
    });
    expect(onCheckpoint).not.toHaveBeenCalledWith("predict-received");
  });

  it("accepts formatted answers like $975.00", async () => {
    const { user, onCheckpoint } = renderLab();

    await user.type(screen.getByLabelText(/amount received/i), "$975.00");
    await user.click(screen.getByRole("button", { name: /check answer/i }));

    await waitFor(() => {
      expect(onCheckpoint).toHaveBeenCalledWith("predict-received");
    });
  });

  it("emits spot-fx-margin when the FX question is answered correctly", async () => {
    const { user, onCheckpoint } = renderLab();

    await user.click(screen.getByRole("button", { name: /\$230 — a \$220 hidden FX margin/i }));

    await waitFor(() => {
      expect(onCheckpoint).toHaveBeenCalledWith("spot-fx-margin");
    });
  });

  it("does not emit spot-fx-margin for a wrong FX answer", async () => {
    const { user, onCheckpoint } = renderLab();

    await user.click(screen.getByRole("button", { name: /\$10 — the wire fee/i }));
    expect(onCheckpoint).not.toHaveBeenCalledWith("spot-fx-margin");
  });

  it("renders the four currency pills", () => {
    renderLab();
    const group = screen.getByRole("group", { name: /currency/i });
    expect(group).toBeVisible();
    for (const ccy of ["USD", "CAD", "GBP", "EUR"]) {
      expect(screen.getByRole("button", { name: ccy })).toBeVisible();
    }
  });

  it("switching currency swaps the correspondent chain", async () => {
    const { user } = renderLab();

    // USD chain by default
    expect(screen.getAllByText(/Citibank N.A./).length).toBeGreaterThanOrEqual(1);

    await user.click(screen.getByRole("button", { name: "CAD" }));
    expect(screen.getAllByText(/RBC Royal Bank/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Toronto-Dominion Bank/).length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText(/Citibank N.A./)).toBeNull();

    await user.click(screen.getByRole("button", { name: "GBP" }));
    expect(screen.getAllByText(/Barclays/).length).toBeGreaterThanOrEqual(1);

    await user.click(screen.getByRole("button", { name: "EUR" }));
    expect(screen.getAllByText(/Deutsche Bank/).length).toBeGreaterThanOrEqual(1);
  });

  it("sends the selected currency and chain to the simulator", async () => {
    let captured: { currency?: string; intermediary_bics?: string[] } = {};
    server.use(
      http.post("/api/fees/simulate", async ({ request }) => {
        const body = (await request.json()) as {
          charge_code: string; currency: string; intermediary_bics: string[];
        };
        captured = body;
        return HttpResponse.json({
          ...feeFixture(body.charge_code),
          currency: body.currency,
        });
      }),
    );

    const { user } = renderLab();
    await user.click(screen.getByRole("button", { name: "CAD" }));
    await user.click(screen.getByRole("button", { name: "SHA" }));

    await waitFor(() => {
      expect(captured.currency).toBe("CAD");
    });
    expect(captured.intermediary_bics).toEqual(["ROYCCAT2XXX", "TDOMCATTXXX"]);
  });

  it("validates the CAD prediction against the CAD chain", async () => {
    const { user, onCheckpoint } = renderLab();

    await user.click(screen.getByRole("button", { name: "CAD" }));
    await user.type(screen.getByLabelText(/amount received/i), "970.50");
    await user.click(screen.getByRole("button", { name: /check answer/i }));

    await waitFor(() => {
      expect(onCheckpoint).toHaveBeenCalledWith("predict-received");
    });
  });

  it("rejects the USD answer once the currency is GBP", async () => {
    const { user, onCheckpoint } = renderLab();

    await user.click(screen.getByRole("button", { name: "GBP" }));
    await user.type(screen.getByLabelText(/amount received/i), "975");
    await user.click(screen.getByRole("button", { name: /check answer/i }));

    await waitFor(() => {
      expect(screen.getByText(/not quite/i)).toBeVisible();
    });
    expect(onCheckpoint).not.toHaveBeenCalledWith("predict-received");
  });

  it("requires two charge codes on the SAME currency for simulate-fees", async () => {
    server.use(
      http.post("/api/fees/simulate", async ({ request }) => {
        const body = (await request.json()) as { charge_code: string };
        return HttpResponse.json(feeFixture(body.charge_code));
      }),
    );

    const { user, onCheckpoint } = renderLab();
    // SHA on USD, then OUR on CAD — different payments, no checkpoint
    await user.click(screen.getByRole("button", { name: "SHA" }));
    await waitFor(() => {
      expect(screen.getAllByText(/Citibank N.A./).length).toBeGreaterThanOrEqual(1);
    });
    await user.click(screen.getByRole("button", { name: "CAD" }));
    await user.click(screen.getByRole("button", { name: "OUR" }));
    await waitFor(() => {
      expect(screen.getAllByText("Citibank N.A.").length).toBeGreaterThanOrEqual(1);
    });
    expect(onCheckpoint).not.toHaveBeenCalledWith("simulate-fees");

    // Second code on CAD completes the comparison
    await user.click(screen.getByRole("button", { name: "SHA" }));
    await waitFor(() => {
      expect(onCheckpoint).toHaveBeenCalledWith("simulate-fees");
    });
  });

  it("shows an error when the simulation fails", async () => {
    server.use(
      http.post("/api/fees/simulate", () => HttpResponse.json({ detail: "boom" }, { status: 500 })),
    );

    const { user } = renderLab();
    await user.click(screen.getByRole("button", { name: "SHA" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/could not run/i);
    });
  });
});
