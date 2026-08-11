import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { http, HttpResponse } from "msw";
import { server } from "../../../test/server";
import { CapstoneContent } from "./CapstoneContent";

function renderCapstone(onCheckpoint = vi.fn()) {
  const user = userEvent.setup();
  const utils = render(
    <MemoryRouter>
      <CapstoneContent moduleId="capstone" isComplete={false} onCheckpoint={onCheckpoint} />
    </MemoryRouter>,
  );
  return { user, onCheckpoint, ...utils };
}

// Full mock chain for all 6 API steps
function mockAllSteps() {
  server.use(
    http.get("/api/validate", () =>
      HttpResponse.json({
        input: "GB29NWBK60161331926819", input_type: "iban", valid: true,
        bic: "NWBKGB2L", errors: [],
        // The real endpoint resolves the institution behind the IBAN. Included
        // here because the track step needs the receiving BANK's name, which is
        // a different thing from the payee's name.
        bank: { bic: "NWBKGB2L", bank_name: "NatWest Bank plc", country_code: "GB" },
      }),
    ),
    http.post("/api/verify-payee", () =>
      HttpResponse.json({
        iban: "GB29NWBK60161331926819", submitted_name: "John Smith",
        outcome: "MATCH", score: 1.0, advice: "Name matches.",
      }),
    ),
    http.get("/api/route", () =>
      HttpResponse.json({
        bic: "NWBKGB2L", currency: "GBP", valid: true, beneficiary_country: "GB",
        suggested_intermediaries: [
          { bic: "BARCGB22", bank: "Barclays", corridor: "GBP", confidence: "high" },
        ],
        notes: "Test", source: "curated",
      }),
    ),
    http.get("/api/ssi", () =>
      HttpResponse.json({
        beneficiary_bic: "NWBKGB2L", currency: "GBP",
        instructions: [], disclaimer: "SIMULATION",
      }),
    ),
    http.post("/api/prepare-payment", () =>
      HttpResponse.json({
        recommendation: "PROCEED", reason: "All checks passed",
        is_blocking: false, uetr: "capstone-uetr",
        validation: { valid: true, errors: [] },
        vop: { outcome: "MATCH", advice: "ok" },
        routing: { suggested_intermediaries: [] },
        ssi: { instructions: [], has_real_accounts: false, has_placeholders_only: true },
        warnings: [], blocks: [],
      }),
    ),
    http.post("/api/track/create", () =>
      HttpResponse.json({
        uetr: "capstone-uetr", current_status: "CREDITED", is_terminal: true,
        event_count: 1, sent_amount: "5000.00", final_amount: "5000.00",
        total_fees: 0, last_updated: "2026-01-01T12:00:00",
        timeline: [{
          status: "CREDITED", bank_bic: "NWBKGB2L", bank_name: "NatWest",
          hop: 0, timestamp: "2026-01-01T12:00:00",
          amount: undefined, currency: undefined, message: undefined,
          instructing_bic: undefined, instructed_bic: undefined,
        }],
        disclaimer: "SIMULATION",
      }),
    ),
  );
}

describe("CapstoneContent", () => {
  it("renders the step indicator with 6 steps", () => {
    renderCapstone();
    expect(screen.getByText("Validate")).toBeVisible();
    expect(screen.getByText("Verify")).toBeVisible();
    expect(screen.getByText("Route")).toBeVisible();
    expect(screen.getByText("Settle")).toBeVisible();
    expect(screen.getByText("Decide")).toBeVisible();
    expect(screen.getByText("Track")).toBeVisible();
  });

  it("renders the payment input form", () => {
    renderCapstone();
    expect(screen.getByLabelText(/iban/i)).toBeVisible();
    expect(screen.getByRole("button", { name: /start.*simulation/i })).toBeVisible();
  });

  it("shows simulation label persistently", () => {
    renderCapstone();
    expect(screen.getByText(/simulation.*not a real payment/i)).toBeVisible();
  });

  it("emits validate checkpoint after validation step", async () => {
    mockAllSteps();
    const { user, onCheckpoint } = renderCapstone();
    await user.click(screen.getByRole("button", { name: /start.*simulation/i }));

    await waitFor(() => {
      expect(onCheckpoint).toHaveBeenCalledWith("validate");
    });
  });

  it("emits all six checkpoints on successful completion", async () => {
    mockAllSteps();
    const { user, onCheckpoint } = renderCapstone();
    await user.click(screen.getByRole("button", { name: /start.*simulation/i }));

    // Wait for all steps to complete (each step auto-advances)
    await waitFor(() => {
      expect(onCheckpoint).toHaveBeenCalledWith("validate");
      expect(onCheckpoint).toHaveBeenCalledWith("verify");
      expect(onCheckpoint).toHaveBeenCalledWith("route");
      expect(onCheckpoint).toHaveBeenCalledWith("settle");
      expect(onCheckpoint).toHaveBeenCalledWith("decide");
      expect(onCheckpoint).toHaveBeenCalledWith("track");
    }, { timeout: 10000 });
  });

  it("shows the recommendation after the decide step", async () => {
    mockAllSteps();
    const { user } = renderCapstone();
    await user.click(screen.getByRole("button", { name: /start.*simulation/i }));

    await waitFor(() => {
      expect(screen.getByText("PROCEED")).toBeVisible();
    }, { timeout: 10000 });
  });

  it("shows the UETR after the track step", async () => {
    mockAllSteps();
    const { user } = renderCapstone();
    await user.click(screen.getByRole("button", { name: /start.*simulation/i }));

    await waitFor(() => {
      expect(screen.getByText("capstone-uetr")).toBeVisible();
    }, { timeout: 10000 });
  });

  // TrackPaymentRequest.beneficiary_name is documented in app/schemas.py:123 as
  // "The receiving bank's name", and generate_timeline uses it as the bank_name
  // on the final hop. The Capstone was sending the payee's name, so the last row
  // of the timeline read like a person rather than a bank — in a lab whose whole
  // subject is which institution holds which leg of the payment.
  it("sends the receiving bank's name to track/create, not the payee's", async () => {
    mockAllSteps();
    let trackBody: Record<string, unknown> | null = null;
    server.use(
      http.post("/api/track/create", async ({ request }) => {
        trackBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({
          uetr: "capstone-uetr", current_status: "CREDITED", is_terminal: true,
          event_count: 1, sent_amount: "5000.00", final_amount: "5000.00",
          total_fees: 0, last_updated: "2026-01-01T12:00:00",
          timeline: [{
            status: "CREDITED", bank_bic: "NWBKGB2L", bank_name: "NatWest Bank plc",
            hop: 0, timestamp: "2026-01-01T12:00:00",
          }],
          disclaimer: "SIMULATION",
        });
      }),
    );

    const { user } = renderCapstone();
    await user.click(screen.getByRole("button", { name: /start.*simulation/i }));

    await waitFor(() => {
      expect(trackBody).not.toBeNull();
    }, { timeout: 5000 });

    expect(trackBody!.beneficiary_name).toBe("NatWest Bank plc");
    expect(trackBody!.beneficiary_name).not.toBe("John Smith");
  });

  it("renders a link to the Operate workspace", () => {
    renderCapstone();
    expect(screen.getByRole("link", { name: /operate.*prepare/i })).toBeVisible();
  });

  it("labels route suggestions as candidates instead of a confirmed chain", async () => {
    mockAllSteps();
    const { user } = renderCapstone();
    await user.click(screen.getByRole("button", { name: /start.*simulation/i }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /possible correspondent options/i })).toBeVisible();
    }, { timeout: 10000 });
    expect(screen.getByText(/candidates, not a confirmed chain/i)).toBeVisible();
    expect(screen.queryByRole("img", { name: /Payment from Your bank/i })).toBeNull();
  });
});
