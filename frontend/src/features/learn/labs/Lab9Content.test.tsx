import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../../../test/server";
import { Lab9Content } from "./Lab9Content";

function renderLab(onCheckpoint = vi.fn()) {
  const user = userEvent.setup();
  const utils = render(
    <Lab9Content moduleId="lab-9" isComplete={false} onCheckpoint={onCheckpoint} />,
  );
  return { user, onCheckpoint, ...utils };
}

const CAD_SCHEMES_FIXTURE = {
  currency: "CAD",
  country: "Canada",
  countryCode: "CA",
  iban: false,
  localIdentifier: "Transit Number",
  schemes: [
    {
      name: "Interac e-Transfer",
      speed: "Instant",
      limit: "$10,000",
      cost: "$1.50",
      useCase: "Retail P2P",
      operator: "Interac",
      settlement: "Batch",
      reversible: false,
      howItWorks: ["Sender initiates", "Autodeposit lands"],
      features: ["Request money", "Autodeposit"],
    },
  ],
  verifiedAsof: "2026-07-01",
};

const GBP_SCHEMES_FIXTURE = {
  currency: "GBP",
  country: "United Kingdom",
  countryCode: "GB",
  iban: true,
  localIdentifier: "Sort Code",
  schemes: [
    { name: "CHAPS", speed: "Same-day", limit: "No limit", cost: "£25", useCase: "High-value", operator: "BoE" },
  ],
};

describe("Lab9Content", () => {
  it("renders the rail-detail concept heading", () => {
    renderLab();
    expect(screen.getByRole("heading", { name: /enriched rail detail/i })).toBeVisible();
  });

  it("loads and renders CAD rail detail from /api/schemes", async () => {
    server.use(http.get("/api/schemes", () => HttpResponse.json(CAD_SCHEMES_FIXTURE)));

    const { user } = renderLab();
    await user.click(screen.getByRole("button", { name: "CAD" }));

    await waitFor(() => {
      expect(screen.getAllByText("Interac e-Transfer").length).toBeGreaterThanOrEqual(1);
    });
  });

  it("loads and renders GBP rail detail from /api/schemes", async () => {
    server.use(http.get("/api/schemes", () => HttpResponse.json(GBP_SCHEMES_FIXTURE)));

    const { user } = renderLab();
    await user.click(screen.getByRole("button", { name: "GBP" }));

    await waitFor(() => {
      expect(screen.getAllByText("CHAPS").length).toBeGreaterThanOrEqual(1);
    });
  });

  it("fires autodeposit-vop checkpoint when VoP reveals the account holder name", async () => {
    server.use(
      http.post("/api/verify-payee", () =>
        HttpResponse.json({
          iban: "CA1234567890123456789012",
          submitted_name: "Jane Doe",
          outcome: "MATCH",
          score: 1.0,
          account_holder_name: "Jane Doe",
          advice: "Names match — safe to proceed.",
        }),
      ),
    );

    const { user, onCheckpoint } = renderLab();
    const nameInput = screen.getByLabelText(/payee name to verify/i);
    await user.type(nameInput, "Jane Doe");
    await user.click(screen.getByRole("button", { name: /verify payee/i }));

    await waitFor(() => {
      expect(onCheckpoint).toHaveBeenCalledWith("autodeposit-vop");
    });
  });

  it("fires chaps-pacs008 checkpoint when a country-only address is flagged", async () => {
    server.use(
      http.post("/api/message/pacs008-check", () =>
        HttpResponse.json({
          verdict: "REPAIRABLE",
          passes: false,
          findings: [
            {
              field: "Cdtr/PstlAdr",
              field_name: "Creditor Postal Address",
              severity: "warning",
              code: "PACS-ADDR-UNSTRUCTURED",
              message: "country-only address",
              repair: "add street and town",
            },
          ],
          disclaimer: "primer",
        }),
      ),
    );

    const { user, onCheckpoint } = renderLab();
    await user.click(screen.getByRole("button", { name: /check the chaps message/i }));

    await waitFor(() => {
      expect(onCheckpoint).toHaveBeenCalledWith("chaps-pacs008");
    });
  });

  it("fires eft-window checkpoint when a sample submission time is selected", async () => {
    const { user, onCheckpoint } = renderLab();
    await user.click(screen.getByRole("button", { name: /04:00 ET/i }));

    await waitFor(() => {
      expect(onCheckpoint).toHaveBeenCalledWith("eft-window");
    });
  });

  it("renders the EFT settlement result with a value date", async () => {
    const { user } = renderLab();
    await user.click(screen.getByRole("button", { name: /04:00 ET/i }));

    await waitFor(() => {
      expect(screen.getByText(/value date/i)).toBeVisible();
    });
  });

  it("fires limit-check checkpoint when the limit checker runs", async () => {
    const { user, onCheckpoint } = renderLab();
    await user.click(screen.getByRole("button", { name: /check limits/i }));

    await waitFor(() => {
      expect(onCheckpoint).toHaveBeenCalledWith("limit-check");
    });
  });

  it("fires app-reimbursement checkpoint when the APP calculator runs", async () => {
    const { user, onCheckpoint } = renderLab();
    await user.click(screen.getByRole("button", { name: /calculate reimbursement/i }));

    await waitFor(() => {
      expect(onCheckpoint).toHaveBeenCalledWith("app-reimbursement");
    });
  });

  it("renders the APP reimbursement split", async () => {
    const { user } = renderLab();
    await user.click(screen.getByRole("button", { name: /calculate reimbursement/i }));

    await waitFor(() => {
      expect(screen.getByText(/sender psp pays/i)).toBeVisible();
      expect(screen.getByText(/receiver psp pays/i)).toBeVisible();
    });
  });

  it("fires rail-chooser checkpoint when CHAPS is selected for the £900k house", async () => {
    const { user, onCheckpoint } = renderLab();
    await user.click(screen.getByRole("button", { name: "CHAPS" }));

    await waitFor(() => {
      expect(onCheckpoint).toHaveBeenCalledWith("rail-chooser");
    });
  });
});
