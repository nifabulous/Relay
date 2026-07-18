import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../../../test/server";
import { Lab5Content } from "./Lab5Content";

function renderLab(onCheckpoint = vi.fn()) {
  const user = userEvent.setup();
  const utils = render(
    <Lab5Content moduleId="lab-5" isComplete={false} onCheckpoint={onCheckpoint} />,
  );
  return { user, onCheckpoint, ...utils };
}

const SSI_FIXTURE = {
  beneficiary_bic: "EBILAEADXXX",
  currency: "USD",
  instructions: [
    {
      beneficiary_bic: "EBILAEADXXX",
      beneficiary_bank_name: "Emirates NBD",
      currency: "USD",
      intermediary_bic: "CITIUS33XXX",
      intermediary_bank_name: "Citibank",
      intermediary_account: "ACCT-1234567890",
      beneficiary_account: null,
      charge_code: "SHA",
      value_date: "spot",
      notes: null,
    },
  ],
  disclaimer: "SIMULATION",
};

describe("Lab5Content", () => {
  it("renders the concept explanation about SSI", () => {
    renderLab();
    expect(screen.getByRole("heading", { name: /settlement/i })).toBeVisible();
  });

  it("renders the SSI lookup form", () => {
    renderLab();
    expect(screen.getByLabelText(/beneficiary bic/i)).toBeVisible();
    expect(screen.getByRole("button", { name: /show.*instructions/i })).toBeVisible();
  });

  it("renders charge code definitions (OUR/SHA/BEN)", () => {
    renderLab();
    expect(screen.getByText("OUR")).toBeVisible();
    expect(screen.getByText("SHA")).toBeVisible();
    expect(screen.getByText("BEN")).toBeVisible();
  });

  it("shows placeholder account warning", () => {
    renderLab();
    expect(screen.getByText(/placeholder/i)).toBeVisible();
  });

  it("emits lookup-ssi checkpoint when instructions are found", async () => {
    server.use(
      http.get("/api/ssi", () => HttpResponse.json(SSI_FIXTURE)),
    );

    const { user, onCheckpoint } = renderLab();
    await user.click(screen.getByRole("button", { name: /show.*instructions/i }));

    await waitFor(() => {
      expect(onCheckpoint).toHaveBeenCalledWith("lookup-ssi");
    });
  });

  it("renders SSI instruction details in a table", async () => {
    server.use(
      http.get("/api/ssi", () => HttpResponse.json(SSI_FIXTURE)),
    );

    const { user } = renderLab();
    await user.click(screen.getByRole("button", { name: /show.*instructions/i }));

    await waitFor(() => {
      // Citibank appears in both table and charge codes — use getAllByText
      expect(screen.getAllByText("Citibank").length).toBeGreaterThanOrEqual(1);
    });
    // "spot" only appears in the SSI table
    expect(screen.getByText("spot")).toBeVisible();
  });

  it("emits identify-correspondent checkpoint on correct exercise answer", async () => {
    server.use(
      http.get("/api/ssi", () => HttpResponse.json(SSI_FIXTURE)),
    );

    const { user, onCheckpoint } = renderLab();

    // First look up SSI so the exercise checker has data
    await user.click(screen.getByRole("button", { name: /show.*instructions/i }));
    await waitFor(() => {
      expect(screen.getAllByText("Citibank").length).toBeGreaterThanOrEqual(1);
    });

    // Now answer the exercise
    await user.type(screen.getByLabelText(/correspondent.*answer/i), "Citibank");
    const checkButtons = screen.getAllByRole("button", { name: /check answer/i });
    await user.click(checkButtons[checkButtons.length - 1]);

    await waitFor(() => {
      expect(onCheckpoint).toHaveBeenCalledWith("identify-correspondent");
    });
  });

  it("handles empty SSI instructions gracefully", async () => {
    server.use(
      http.get("/api/ssi", () =>
        HttpResponse.json({
          beneficiary_bic: "UNKNOWNXXX",
          currency: "XXX",
          instructions: [],
          disclaimer: "SIMULATION",
        }),
      ),
    );

    const { user } = renderLab();
    await user.clear(screen.getByLabelText(/beneficiary bic/i));
    await user.type(screen.getByLabelText(/beneficiary bic/i), "UNKNOWNXXX");
    await user.click(screen.getByRole("button", { name: /show.*instructions/i }));

    await waitFor(() => {
      expect(screen.getByText(/no.*instructions/i)).toBeVisible();
    });
  });
});
