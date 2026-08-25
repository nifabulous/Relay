import { describe, it, expect } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { server } from "../../../test/server";
import { ToolIndexPage } from "./ToolIndexPage";
import { FeePage } from "./FeePage";
import { ScreeningPage } from "./ScreeningPage";
import { ValueDatePage } from "./ValueDatePage";
import { StpPage } from "./StpPage";
import { TrackingPage } from "../tracking/TrackingPage";

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("ToolIndexPage", () => {
  it("renders the tools grid with one actionable link per tool", () => {
    renderWithProviders(<ToolIndexPage />);
    expect(screen.getByRole("heading", { name: "Tools" })).toBeVisible();
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(5);
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/operate/fees",
      "/operate/screening",
      "/operate/value-date",
      "/operate/stp",
      "/operate/tracking",
    ]);
    expect(screen.getByRole("link", { name: /fee calculator.*open/i })).toBeVisible();
    expect(screen.getByRole("link", { name: /sanctions screening.*open/i })).toBeVisible();
    expect(screen.getByRole("link", { name: /value date.*open/i })).toBeVisible();
    expect(screen.getByRole("link", { name: /stp.*checker.*open/i })).toBeVisible();
    expect(screen.getByRole("link", { name: /payment tracking.*open/i })).toBeVisible();
    expect(document.querySelectorAll(".tool-index__icon-tile")).toHaveLength(5);
  });
});

describe("FeePage", () => {
  it("renders the fee calculator form with amount, currency, and charge code", () => {
    renderWithProviders(<FeePage />);
    expect(screen.getByLabelText(/amount/i)).toBeVisible();
    expect(screen.getByLabelText(/currency/i)).toBeVisible();
    expect(screen.getByLabelText(/charge code/i)).toBeVisible();
    expect(screen.getByRole("button", { name: /simulate/i })).toBeVisible();
  });

  it("sends the illustrative intermediary chain to the fee simulator", async () => {
    let requestBody: Record<string, unknown> = {};
    server.use(
      http.post("/api/fees/simulate", async ({ request }) => {
        requestBody = await request.json() as Record<string, unknown>;
        return HttpResponse.json({
          charge_code: "SHA",
          currency: "USD",
          sent_amount: 1000,
          received_amount: 972.5,
          total_fees: 27.5,
          sender_pays_extra: 0,
          hops: [],
          fee_breakdown: "Simulation",
        });
      }),
    );

    const user = userEvent.setup();
    renderWithProviders(<FeePage />);
    await user.type(screen.getByLabelText(/amount/i), "1000");
    await user.click(screen.getByRole("button", { name: /simulate/i }));

    await waitFor(() => expect(requestBody.intermediary_bics).toEqual([
      "CITIUS33XXX", "BOFAUS3NXXX",
    ]));
    expect(requestBody.intermediary_names).toEqual(["Citibank", "Bank of America"]);
  });
});

describe("ScreeningPage", () => {
  it("renders the screening form with sender and beneficiary name fields", () => {
    renderWithProviders(<ScreeningPage />);
    expect(screen.getByLabelText(/sender name/i)).toBeVisible();
    expect(screen.getByLabelText(/beneficiary name/i)).toBeVisible();
    expect(screen.getByRole("button", { name: /screen/i })).toBeVisible();
  });
});

describe("ValueDatePage", () => {
  it("renders the value date form", () => {
    renderWithProviders(<ValueDatePage />);
    expect(screen.getByLabelText(/send date/i)).toBeVisible();
    expect(screen.getByLabelText(/currency/i)).toBeVisible();
    expect(screen.getByRole("button", { name: /calculate/i })).toBeVisible();
  });

  it("shows the settlement date details and week legend from the response", async () => {
    server.use(
      http.post("/api/value-date", () => HttpResponse.json({
        trade_date: "2026-05-14",
        cut_off_local: "14:00",
        cut_off_tz: "Europe/London",
        cut_off_note: "",
        missed_cut_off: false,
        value_date: "2026-05-18",
        settlement_type: "T+2",
        business_days: 2,
        skipped_holidays: ["2026-05-20"],
        explanation: "Settlement rolls around the holiday.",
        disclaimer: "Simulation only",
      })),
    );

    const user = userEvent.setup();
    renderWithProviders(<ValueDatePage />);
    fireEvent.change(screen.getByLabelText(/send date/i), { target: { value: "2026-05-14T12:00" } });
    await user.click(screen.getByRole("button", { name: /calculate/i }));

    await waitFor(() => expect(screen.getByText("18 May 2026")).toBeVisible());
    expect(screen.getByText(/2026-05-20/)).toBeVisible();
    expect(screen.getByRole("list", { name: /settlement week days/i })).toBeVisible();
    expect(screen.getAllByRole("listitem")).toHaveLength(7);
    expect(screen.getByRole("listitem", { name: /public holiday/i })).toBeVisible();
    expect(screen.getByRole("listitem", { name: /settlement date/i })).toBeVisible();
    expect(screen.getByText(/simulation.*not a real payment/i)).toBeVisible();
  });
});

describe("StpPage", () => {
  it("renders the STP checker form with MT103 fields", () => {
    renderWithProviders(<StpPage />);
    expect(screen.getByLabelText(/transaction reference/i)).toBeVisible();
    expect(screen.getByLabelText(/value date/i)).toBeVisible();
    expect(screen.getByLabelText(/currency/i)).toBeVisible();
    expect(screen.getByRole("button", { name: /check/i })).toBeVisible();
  });

  it("shows the pacs.008 view when toggled", async () => {
    server.use(
      http.post("/api/message/translate", () =>
        HttpResponse.json({
          mapping: [
            {
              mt_tag: "59",
              mt_label: "Beneficiary Customer",
              iso_path: "Cdtr/Nm",
              iso_label: "Creditor Name",
              value: "Beta Ltd",
            },
          ],
          xml: "<Document/>",
          disclaimer: "primer",
        }),
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(<StpPage />);
    await user.type(screen.getByLabelText(/transaction reference/i), "REF1");
    await user.type(screen.getByLabelText(/value date/i), "2026-07-20");
    await user.type(screen.getByLabelText(/interbank amount/i), "100000");
    await user.click(screen.getByRole("button", { name: /view as pacs\.008/i }));
    await waitFor(() =>
      expect(screen.getByText(/MT103 → pacs\.008 field mapping/i)).toBeInTheDocument(),
    );
  });

  it("renders the field checklist and can re-validate the current message", async () => {
    let calls = 0;
    server.use(
      http.post("/api/message/stp-check", () => {
        calls += 1;
        return HttpResponse.json({
          verdict: "REPAIRABLE",
          stp_passes: true,
          field_summary: [
            { field: "20", field_name: "Sender's Reference", present: true, valid: true, findings: 0 },
            { field: "71A", field_name: "Details of Charges", present: false, valid: false, findings: 1 },
          ],
          findings: [{
            field: "71A",
            field_name: "Details of Charges",
            severity: "warning",
            code: "STP-CHARGE-CODE-MISSING",
            message: "Details of charges is missing.",
            repair: "Add SHA, OUR, or BEN.",
          }],
          disclaimer: "Simulation only",
        });
      }),
    );

    const user = userEvent.setup();
    renderWithProviders(<StpPage />);
    await user.type(screen.getByLabelText(/transaction reference/i), "REF1");
    await user.type(screen.getByLabelText(/value date/i), "2026-07-20");
    await user.type(screen.getByLabelText(/interbank amount/i), "100000");
    await user.click(screen.getByRole("button", { name: /check stp compliance/i }));

    await waitFor(() => expect(screen.getByRole("list", { name: /stp field validation checklist/i })).toBeVisible());
    expect(screen.getByText("Sender's Reference")).toBeVisible();
    expect(screen.getByText("Details of Charges")).toBeVisible();
    expect(screen.getByText("Add SHA, OUR, or BEN.")).toBeVisible();
    expect(screen.getByLabelText(/checklist coverage 50%/i)).toBeVisible();
    expect(screen.getByText(/derived from returned field checks.*not a backend compliance score/i)).toBeVisible();
    expect(screen.getByText("Simulation — not a real payment.")).toBeVisible();
    expect(screen.getByText("Simulation only")).toBeVisible();

    await user.clear(screen.getByLabelText(/transaction reference/i));
    const revalidate = screen.getByRole("button", { name: /re-validate/i });
    expect(revalidate).toBeDisabled();

    await user.click(revalidate);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(calls).toBe(1);
  });
});

describe("TrackingPage", () => {
  it("renders the tracking input with a UETR field", () => {
    renderWithProviders(<TrackingPage />);
    expect(screen.getByLabelText(/uetr/i)).toBeVisible();
    expect(screen.getByRole("button", { name: /track/i })).toBeVisible();
  });

  it("displays the simulation label persistently", () => {
    renderWithProviders(<TrackingPage />);
    expect(screen.getByText(/simulation.*not a real payment/i)).toBeVisible();
  });
});
