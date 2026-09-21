import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { server } from "../../test/server";
import { SsiQualityPage } from "./SsiQualityPage";

const snapshot = {
  generated_at: "2026-09-21",
  stale_after_days: 180,
  totals: {
    total_rows: 1209,
    instruction_rows: 856,
    bic_only_rows: 353,
    terms_inferred_rows: 24,
    routing_ready_rows: 0,
    published_rows: 0,
    unverified_rows: 1022,
    archived_rows: 187,
    illustrative_rows: 0,
    stale_rows: 187,
    missing_source_date_rows: 181,
    missing_citation_rows: 0,
    unique_beneficiaries: 412,
    unique_intermediaries: 68,
    currencies: 34,
  },
  freshness: [
    { label: "0-30 days", count: 1022 },
    { label: "31-90 days", count: 0 },
    { label: "91-180 days", count: 0 },
    { label: ">180 days", count: 6 },
    { label: "No source date", count: 181 },
  ],
  queue: [{
    beneficiary_bic: "BANKGB22XXX",
    beneficiary_bank_name: "Example Bank",
    currency: "GBP",
    intermediary_bic: "CITIUS33XXX",
    intermediary_bank_name: "Citibank N.A.",
    status: "archived",
    bic_only: false,
    terms_inferred: false,
    as_of: "2025-01-01",
    age_days: 628,
    issues: ["stale-source"],
  }],
  disclaimer: "Quality signals describe this curated SSI corpus, not live bank availability.",
};

function renderPage() {
  server.use(http.get("/api/ssi/quality", () => HttpResponse.json(snapshot)));
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/app/explore/ssi-quality"]}>
        <SsiQualityPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("SsiQualityPage", () => {
  it("shows denominators, freshness, and the actionable review queue", async () => {
    renderPage();

    expect(await screen.findByRole("heading", { name: "SSI data quality" })).toBeVisible();
    await screen.findByText("1,209", { selector: ".ssi-quality__metric strong" });
    const summary = screen.getByRole("region", { name: "SSI quality summary" });
    expect(summary).toHaveTextContent(/1,209\s*Total rows/);
    expect(summary).toHaveTextContent(/0\s*Routing-ready rows/);
    expect(screen.getByRole("heading", { name: "Freshness" })).toBeVisible();
    expect(screen.getByText("181", { selector: ".ssi-quality__bar-value" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Review queue" })).toBeVisible();
    expect(screen.getByRole("link", { name: "BANKGB22XXX" })).toBeVisible();
    expect(screen.getAllByText("Source older than threshold")[0]).toBeVisible();
  });

  it("keeps the corpus warning visible so quality is not mistaken for live availability", async () => {
    renderPage();

    expect(await screen.findByRole("note")).toHaveTextContent(/not live bank availability/i);
  });
});
