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

  describe("when the IBAN is valid but no BIC can be derived", () => {
    // GB82 WEST 1234 5698 7654 32 passes its checksum, but WEST is not a bank
    // code schwifty knows, so /api/validate answers bic: null. The capstone used
    // to fall back to a hardcoded NatWest BIC for the timeline, naming a bank the
    // learner never chose.
    const NO_BIC_IBAN = "GB82WEST12345698765432";

    interface Captured {
      validateValues: string[];
      verifyCalls: number;
      routeBics: string[];
      ssiBics: string[];
      prepareBodies: Record<string, unknown>[];
      trackBodies: Record<string, unknown>[];
    }

    function mockNoBicChain(): Captured {
      mockAllSteps();
      const captured: Captured = {
        validateValues: [], verifyCalls: 0, routeBics: [], ssiBics: [], prepareBodies: [], trackBodies: [],
      };
      server.use(
        http.get("/api/validate", ({ request }) => {
          const value = new URL(request.url).searchParams.get("value") ?? "";
          captured.validateValues.push(value);
          if (value === NO_BIC_IBAN) {
            return HttpResponse.json({
              input: value, input_type: "iban", valid: true, bic: null, bank: null, errors: [],
            });
          }
          if (value.toUpperCase() === "BARCGB22") {
            return HttpResponse.json({
              input: value, input_type: "bic", valid: true, bic: "BARCGB22XXX",
              bank: { bic: "BARCGB22XXX", bank_name: "Barclays", country_code: "GB" }, errors: [],
            });
          }
          return HttpResponse.json({
            input: value, input_type: "bic", valid: false, bic: null, bank: null,
            errors: [`Enter a valid SWIFT BIC — it must be 8 or 11 characters (you entered ${value.length}).`],
          });
        }),
        http.post("/api/verify-payee", () => {
          captured.verifyCalls += 1;
          return HttpResponse.json({
            iban: NO_BIC_IBAN, submitted_name: "John Smith",
            outcome: "MATCH", score: 1.0, advice: "Name matches.",
          });
        }),
        http.get("/api/route", ({ request }) => {
          captured.routeBics.push(new URL(request.url).searchParams.get("bic") ?? "");
          return HttpResponse.json({
            bic: "BARCGB22XXX", currency: "GBP", valid: true, beneficiary_country: "GB",
            suggested_intermediaries: [], notes: "Test", source: "curated",
          });
        }),
        http.get("/api/ssi", ({ request }) => {
          captured.ssiBics.push(new URL(request.url).searchParams.get("bic") ?? "");
          return HttpResponse.json({
            beneficiary_bic: "BARCGB22XXX", currency: "GBP", instructions: [], disclaimer: "SIMULATION",
          });
        }),
        http.post("/api/prepare-payment", async ({ request }) => {
          captured.prepareBodies.push((await request.json()) as Record<string, unknown>);
          return HttpResponse.json({
            recommendation: "PROCEED", reason: "All checks passed",
            is_blocking: false, uetr: "capstone-uetr",
            validation: { valid: true, bic: "BARCGB22XXX", errors: [] },
            vop: { outcome: "MATCH", advice: "ok" },
            routing: { suggested_intermediaries: [] },
            ssi: { instructions: [], has_real_accounts: false, has_placeholders_only: true },
            warnings: [], blocks: [],
          });
        }),
        http.post("/api/track/create", async ({ request }) => {
          captured.trackBodies.push((await request.json()) as Record<string, unknown>);
          return HttpResponse.json({
            uetr: "capstone-uetr", current_status: "CREDITED", is_terminal: true,
            event_count: 1, sent_amount: "5000.00", final_amount: "5000.00",
            total_fees: 0, last_updated: "2026-01-01T12:00:00",
            timeline: [{
              status: "CREDITED", bank_bic: "BARCGB22XXX", bank_name: "Barclays",
              hop: 0, timestamp: "2026-01-01T12:00:00",
            }],
            disclaimer: "SIMULATION",
          });
        }),
      );
      return captured;
    }

    async function startWithNoBicIban() {
      const captured = mockNoBicChain();
      const rendered = renderCapstone();
      const iban = screen.getByLabelText("IBAN");
      await rendered.user.clear(iban);
      await rendered.user.type(iban, NO_BIC_IBAN);
      await rendered.user.click(screen.getByRole("button", { name: /start.*simulation/i }));
      return { captured, ...rendered };
    }

    it("stops after Validate and asks for the beneficiary BIC", async () => {
      const { captured, onCheckpoint } = await startWithNoBicIban();

      expect(await screen.findByText(/no bic derivable/i)).toBeVisible();
      expect(screen.getByLabelText(/beneficiary bic/i)).toBeVisible();
      expect(onCheckpoint).toHaveBeenCalledWith("validate");
      expect(onCheckpoint).not.toHaveBeenCalledWith("verify");
      expect(captured.verifyCalls).toBe(0);
      expect(captured.routeBics).toEqual([]);
      expect(captured.ssiBics).toEqual([]);
      expect(captured.trackBodies).toEqual([]);
    });

    it("continues with the BIC the learner enters and never substitutes another bank", async () => {
      const { captured, user, onCheckpoint } = await startWithNoBicIban();

      await user.type(await screen.findByLabelText(/beneficiary bic/i), "barcgb22");
      await user.click(screen.getByRole("button", { name: /continue with this bic/i }));

      await waitFor(() => {
        expect(onCheckpoint).toHaveBeenCalledWith("track");
      }, { timeout: 10000 });

      expect(captured.validateValues).toEqual([NO_BIC_IBAN, "BARCGB22"]);
      expect(captured.routeBics).toEqual(["BARCGB22XXX"]);
      expect(captured.ssiBics).toEqual(["BARCGB22XXX"]);
      expect(captured.prepareBodies).toHaveLength(1);
      expect(captured.prepareBodies[0].beneficiary_bic).toBe("BARCGB22XXX");
      expect(captured.trackBodies).toHaveLength(1);
      expect(captured.trackBodies[0].beneficiary_bic).toBe("BARCGB22XXX");
      expect(captured.trackBodies[0].beneficiary_name).toBe("Barclays");
    });

    it("rejects a BIC that does not validate and stays stopped", async () => {
      const { captured, user } = await startWithNoBicIban();

      await user.type(await screen.findByLabelText(/beneficiary bic/i), "XXXX");
      await user.click(screen.getByRole("button", { name: /continue with this bic/i }));

      expect(await screen.findByText(/you entered 4/i)).toBeVisible();
      expect(screen.getByLabelText(/beneficiary bic/i)).toBeVisible();
      expect(captured.verifyCalls).toBe(0);
      expect(captured.trackBodies).toEqual([]);
    });

    it("rejects an IBAN typed into the BIC field", async () => {
      const { captured, user } = await startWithNoBicIban();

      // /api/validate accepts IBANs too, and this one is valid — but it is not
      // a BIC, so it must not unblock the capstone.
      await user.type(await screen.findByLabelText(/beneficiary bic/i), NO_BIC_IBAN);
      await user.click(screen.getByRole("button", { name: /continue with this bic/i }));

      expect(await screen.findByText(/enter a bic/i)).toBeVisible();
      expect(captured.verifyCalls).toBe(0);
    });

    // The BIC check is async and the IBAN stays editable. If the learner edits
    // the IBAN and starts again while it is in flight, the late answer was for
    // the previous prompt and must not answer the new one.
    it("ignores a BIC check that resolves after the learner started over", async () => {
      const captured = mockNoBicChain();
      let releaseBicCheck!: () => void;
      const bicCheckHeld = new Promise<void>((resolve) => { releaseBicCheck = resolve; });
      server.use(
        http.get("/api/validate", async ({ request }) => {
          const value = new URL(request.url).searchParams.get("value") ?? "";
          if (value !== "BARCGB22") return undefined;
          await bicCheckHeld;
          return HttpResponse.json({
            input: value, input_type: "bic", valid: true, bic: "BARCGB22XXX",
            bank: { bic: "BARCGB22XXX", bank_name: "Barclays", country_code: "GB" }, errors: [],
          });
        }),
      );
      const { user } = renderCapstone();
      const iban = screen.getByLabelText("IBAN");
      await user.clear(iban);
      await user.type(iban, NO_BIC_IBAN);
      await user.click(screen.getByRole("button", { name: /start.*simulation/i }));
      await user.type(await screen.findByLabelText(/beneficiary bic/i), "BARCGB22");
      await user.click(screen.getByRole("button", { name: /continue with this bic/i }));

      // Start over with the same IBAN while the check is still in flight.
      await user.type(screen.getByLabelText("IBAN"), " ");
      await user.type(screen.getByLabelText("IBAN"), "{Backspace}");
      await user.click(screen.getByRole("button", { name: /start.*simulation/i }));
      const freshPrompt = await screen.findByLabelText(/beneficiary bic/i);
      expect(freshPrompt).toHaveValue("");

      releaseBicCheck();
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(screen.getByLabelText(/beneficiary bic/i)).toBeVisible();
      expect(captured.verifyCalls).toBe(0);
    });

    it("lets the learner change the IBAN instead of entering a BIC", async () => {
      await startWithNoBicIban();
      await screen.findByText(/no bic derivable/i);

      expect(screen.getByLabelText("IBAN")).toBeEnabled();
    });
  });

  // The derivable path must keep sending exactly what it sent before: the
  // derived BIC, and no beneficiary_bic override on prepare-payment.
  it("sends no beneficiary_bic override to prepare-payment when the BIC was derived", async () => {
    mockAllSteps();
    let prepareBody: Record<string, unknown> | null = null;
    server.use(
      http.post("/api/prepare-payment", async ({ request }) => {
        prepareBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({
          recommendation: "PROCEED", reason: "All checks passed",
          is_blocking: false, uetr: "capstone-uetr",
          validation: { valid: true, errors: [] },
          vop: { outcome: "MATCH", advice: "ok" },
          routing: { suggested_intermediaries: [] },
          ssi: { instructions: [], has_real_accounts: false, has_placeholders_only: true },
          warnings: [], blocks: [],
        });
      }),
    );

    const { user } = renderCapstone();
    await user.click(screen.getByRole("button", { name: /start.*simulation/i }));

    await waitFor(() => {
      expect(prepareBody).not.toBeNull();
    }, { timeout: 5000 });
    expect(prepareBody).toEqual({
      beneficiary_iban: "GB29NWBK60161331926819",
      beneficiary_name: "John Smith",
      currency: "GBP",
      amount: 5000,
    });
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

  it("renders the shared timeline without pacing controls of its own", async () => {
    mockAllSteps();
    const { user } = renderCapstone();
    await user.click(screen.getByRole("button", { name: /start.*simulation/i }));

    // The UETR first appears at Step 5 (Decide) a render cycle before Step
    // 6's /api/track/create response renders the timeline list, so awaiting
    // the UETR text races the list under load. Await the list itself.
    const timeline = await screen.findByRole(
      "list",
      { name: /payment timeline/i },
      { timeout: 10000 },
    );

    // "Advance one event" / "Complete simulation" live on TrackingPage (task
    // 4.1); the shared timeline embedded here renders no buttons of its own,
    // so a lab that supplies no handlers never inherits unusable controls.
    expect(timeline.querySelectorAll("button").length).toBe(0);
  });
});
