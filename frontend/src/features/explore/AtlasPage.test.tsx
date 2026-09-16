import { describe, expect, it } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { http, HttpResponse } from "msw";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { server } from "../../test/server";
import { AtlasPage } from "./AtlasPage";

const network = {
  scope: "all",
  totals: { ssi_rows: 10, beneficiary_banks: 4, correspondents: 3, currencies: 2 },
  by_status_and_tier: [
    { status: "unverified", bic_only: false, count: 8 },
    { status: "unverified", bic_only: true, count: 2 },
    { status: "archived", bic_only: false, count: 0 },
    { status: "archived", bic_only: true, count: 0 },
    { status: "illustrative", bic_only: false, count: 0 },
    { status: "illustrative", bic_only: true, count: 0 },
    { status: "published", bic_only: false, count: 0 },
    { status: "published", bic_only: true, count: 0 },
  ],
  spokes: [{ iso2: "US", beneficiary_banks: 2, rows: 5, evidence: [{ status: "unverified", bic_only: false, count: 5 }] }],
  hub_countries: [
    { iso2: "US", banks_served: 4, currencies: 2, correspondents: 2 },
    { iso2: "CA", banks_served: 2, currencies: 1, correspondents: 1 },
  ],
  hubs: [
    { bic: "CITIUS33XXX", name: "Citibank N.A.", iso2: "US", banks_served: 3, currencies: 2 },
    { bic: "CHASUS33XXX", name: "JPMorgan Chase", iso2: "US", banks_served: 1, currencies: 1 },
    { bic: "CITICA33XXX", name: "Citibank Canada", iso2: "CA", banks_served: 2, currencies: 1 },
  ],
  observed_beneficiary_country_codes: ["US"],
  observed_intermediary_country_codes: ["CA", "US"],
  disclaimer: "Observed SSI relationships, not payment volume or market share.",
};

const country = {
  scope: "all",
  iso2: "US",
  collected: true,
  in_scope: { beneficiary_banks: 2, beneficiary_banks_total: 4, rows: 5, ssi_rows_total: 10 },
  all_scopes: { beneficiary_banks: 2, beneficiary_banks_total: 4, rows: 5, ssi_rows_total: 10 },
  correspondents: [{
    bic: "CITIUS33XXX", name: "Citibank N.A.", iso2: "US", beneficiary_banks: 2,
    currencies: ["EUR", "USD"], disclosures: [{ beneficiary_bic: "BANKUS33XXX", beneficiary_bank_name: "Example Bank", status: "unverified", bic_only: false, row_count: 2 }],
  }],
  disclaimer: network.disclaimer,
};

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="atlas-location">{location.pathname}{location.search}</output>;
}

function renderAtlas(initialEntry = "/app/explore/atlas") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  server.use(
    http.get("/api/atlas/network", ({ request }) => {
      const scope = new URL(request.url).searchParams.get("scope") ?? "all";
      return HttpResponse.json({ ...network, scope });
    }),
    http.get("/api/atlas/country/:iso2", () => HttpResponse.json(country)),
    http.get(/countries-50m\.json/, () => HttpResponse.json({ type: "Topology", objects: { countries: { type: "GeometryCollection", geometries: [] } }, arcs: [] })),
  );
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <AtlasPage />
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("AtlasPage", () => {
  it("opens on the hub view with a denominator-bearing metric rail", async () => {
    renderAtlas();

    expect(await screen.findByText("4", { selector: ".atlas__metrics strong" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Who does the reaching" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("Atlas sample")).toHaveTextContent("4beneficiary banks");
    expect(screen.getByText(/observed SSI relationships/i)).toBeVisible();
  });

  it("owns view and scope in the URL and refetches the selected scope", async () => {
    const user = userEvent.setup();
    renderAtlas();

    await screen.findByText("4", { selector: ".atlas__metrics strong" });
    await user.click(screen.getByRole("button", { name: "Who gets reached" }));
    await user.click(screen.getByRole("button", { name: "Rows with instruction fields" }));
    await waitFor(() => expect(screen.getByTestId("atlas-location")).toHaveTextContent("view=spoke&scope=settleable"));
    expect(screen.getByText("Rows with instruction fields")).toBeVisible();
  });

  it("opens a country panel and links each beneficiary disclosure to the bank route", async () => {
    const user = userEvent.setup();
    renderAtlas("/app/explore/atlas?view=spoke");

    await screen.findByText("4", { selector: ".atlas__metrics strong" });
    await user.click(screen.getByRole("button", { name: /United States/i }));
    expect(await screen.findByRole("heading", { name: /United States network position/i })).toBeVisible();
    expect(await screen.findByRole("link", { name: "Example Bank" })).toHaveAttribute("href", "/explore/banks/BANKUS33XXX");
  });

  it("filters the loaded table without fetching a second index", async () => {
    const user = userEvent.setup();
    renderAtlas();
    await screen.findByText("4", { selector: ".atlas__metrics strong" });
    await user.type(screen.getByRole("searchbox", { name: /search countries/i }), "Citibank");
    const table = document.querySelector(".atlas-table--hub");
    expect(table).not.toBeNull();
    if (!table) return;
    const tableElement = table as HTMLElement;
    expect(within(tableElement).getByRole("link", { name: /Citibank N\.A\./ })).toBeVisible();
    expect(within(tableElement).queryByRole("link", { name: /JPMorgan Chase/ })).toBeNull();
  });

  it("selects an exact country search in the shared URL state", async () => {
    const user = userEvent.setup();
    renderAtlas();
    await screen.findByText("4", { selector: ".atlas__metrics strong" });

    await user.type(screen.getByRole("searchbox", { name: /search countries/i }), "US");

    await waitFor(() => expect(screen.getByTestId("atlas-location")).toHaveTextContent("q=US&selected=US"));
  });

  it("renders hub detail as correspondent-country detail", async () => {
    const user = userEvent.setup();
    renderAtlas();
    await screen.findByText("4", { selector: ".atlas__metrics strong" });

    await user.click(screen.getByRole("button", { name: /Canada/i }));

    expect(await screen.findByRole("heading", { name: /Canada correspondent position/i })).toBeVisible();
    expect(screen.getByText("Citibank Canada")).toBeVisible();
  });

  it("resolves correspondent search in the spoke view", async () => {
    const user = userEvent.setup();
    renderAtlas("/app/explore/atlas?view=spoke");
    await screen.findByText("4", { selector: ".atlas__metrics strong" });

    await user.type(screen.getByRole("searchbox", { name: /search countries/i }), "Citibank N.A.");

    await waitFor(() => expect(screen.getByTestId("atlas-location")).toHaveTextContent("selected=US"));
    expect(screen.getByRole("button", { name: /United States/i })).toBeVisible();
  });

  it("ignores malformed selected URL values", async () => {
    renderAtlas("/app/explore/atlas?view=spoke&selected=../network");

    expect(await screen.findByRole("heading", { name: /United States network position/i })).toBeVisible();
    expect(screen.queryByRole("heading", { name: /network position/i })).not.toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("exposes mobile field labels and denominator-bearing values", async () => {
    const rendered = renderAtlas();
    await screen.findByText("4", { selector: ".atlas__metrics strong" });

    expect(screen.getByText("2 of 2 currencies")).toBeVisible();
    rendered.unmount();
    renderAtlas("/app/explore/atlas?view=spoke");
    await screen.findByText("4", { selector: ".atlas__metrics strong" });
    expect(screen.getByText("5 of 10 rows")).toBeVisible();
    expect(screen.getByText("5 of 10 rows").closest("span")).toHaveAttribute("data-label", "Rows");
  });
});
