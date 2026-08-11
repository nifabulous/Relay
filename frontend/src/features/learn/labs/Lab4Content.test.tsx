import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../../../test/server";
import { Lab4Content } from "./Lab4Content";

function renderLab(onCheckpoint = vi.fn()) {
  const user = userEvent.setup();
  const utils = render(
    <Lab4Content moduleId="lab-4" isComplete={false} onCheckpoint={onCheckpoint} />,
  );
  return { user, onCheckpoint, ...utils };
}

const ROUTE_FIXTURE = {
  bic: "GTBINGLAXXX",
  currency: "USD",
  valid: true,
  bank: null,
  beneficiary_country: "NG",
  suggested_intermediaries: [
    { bic: "CITIUS33", bank: "Citibank", corridor: "USD-NGN", confidence: "high" },
    { bic: "BOFAUS3N", bank: "Bank of America", corridor: "USD-NGN", confidence: "medium" },
  ],
  notes: "Heuristic routing",
  source: "curated-corridor-table",
};

const JAPAN_FIXTURE = {
  bic: "BOTKJPJTXXX",
  currency: "USD",
  valid: true,
  bank: null,
  beneficiary_country: "JP",
  suggested_intermediaries: [
    { bic: "CITIUS33", bank: "Citibank", corridor: "USD-JPY", confidence: "high" },
    { bic: "BOFAUS3N", bank: "Bank of America", corridor: "USD-JPY", confidence: "high" },
    { bic: "CHASUS33", bank: "JP Morgan Chase", corridor: "USD-JPY", confidence: "medium" },
  ],
  notes: "Japan route via US intermediaries",
  source: "curated-corridor-table",
};

describe("Lab4Content", () => {
  it("renders the concept explanation about correspondent routing", () => {
    renderLab();
    expect(screen.getByRole("heading", { name: /correspondent/i })).toBeVisible();
  });

  it("renders the route demo form with BIC and currency inputs", () => {
    renderLab();
    expect(screen.getByLabelText(/beneficiary bic/i)).toBeVisible();
    expect(screen.getByLabelText(/currency/i)).toBeVisible();
    expect(screen.getByRole("button", { name: /find.*intermediar/i })).toBeVisible();
  });

  it("emits route-demo checkpoint when intermediaries are found", async () => {
    server.use(
      http.get("/api/route", ({ request }) => {
        const url = new URL(request.url);
        const bic = url.searchParams.get("bic");
        if (bic === "BOTKJPJTXXX") return HttpResponse.json(JAPAN_FIXTURE);
        return HttpResponse.json(ROUTE_FIXTURE);
      }),
    );

    const { user, onCheckpoint } = renderLab();
    await user.click(screen.getByRole("button", { name: /find.*intermediar/i }));

    await waitFor(() => {
      expect(onCheckpoint).toHaveBeenCalledWith("route-demo");
    });
  });

  it("renders ranked correspondents as possible options, not one confirmed chain", async () => {
    server.use(
      http.get("/api/route", () => HttpResponse.json(ROUTE_FIXTURE)),
    );

    const { user } = renderLab();
    await user.click(screen.getByRole("button", { name: /find.*intermediar/i }));

    await waitFor(() => {
      const citi = screen.getAllByText("Citibank");
      expect(citi.length).toBeGreaterThanOrEqual(1);
    });
    expect(screen.getAllByText("Bank of America").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole("heading", { name: "Possible correspondent options" })).toBeVisible();
    expect(screen.getByText(/candidates, not a confirmed chain/i)).toBeVisible();
    expect(screen.queryByRole("img", { name: /Payment from Your bank/i })).toBeNull();
    const tables = screen.getAllByRole("table");
    expect(tables.some((t) => t.classList.contains("lab-route-result__table"))).toBe(true);
  });

  it("shows the Japan exercise prompt", () => {
    renderLab();
    expect(screen.getByText(/Route to Japan/i)).toBeVisible();
  });

  it("emits route-japan checkpoint when the Japan exercise is completed", async () => {
    server.use(
      http.get("/api/route", ({ request }) => {
        const url = new URL(request.url);
        const bic = url.searchParams.get("bic");
        if (bic === "BOTKJPJTXXX") return HttpResponse.json(JAPAN_FIXTURE);
        return HttpResponse.json(ROUTE_FIXTURE);
      }),
    );

    const { user, onCheckpoint } = renderLab();

    // Fill the Japan exercise input
    await user.type(screen.getByLabelText(/Japan bank BIC/i), "BOTKJPJTXXX");
    // Click the exercise check button (last "Check answer" button)
    const checkButtons = screen.getAllByRole("button", { name: /check answer/i });
    await user.click(checkButtons[checkButtons.length - 1]);

    await waitFor(() => {
      expect(onCheckpoint).toHaveBeenCalledWith("route-japan");
    });
  });

  it("labels a published-SSI response as authoritative and shows settlement IDs", async () => {
    server.use(
      http.get("/api/route", () =>
        HttpResponse.json({
          bic: "ABNGNGLAXXX",
          currency: "NGN",
          valid: true,
          bank: null,
          beneficiary_country: "NG",
          suggested_intermediaries: [
            {
              bic: "CITIUS33XXX",
              bank: "Citibank NA New York",
              corridor: "USD->NG",
              confidence: "high",
              basis: "published-ssi",
              settlement: { chips_uid: "0008", aba: "021000089" },
            },
            {
              bic: "BKTRUS33XXX",
              bank: "Deutsche Bank Trust Company Americas",
              corridor: "USD->NG",
              confidence: "high",
              basis: "published-ssi",
              settlement: { chips_uid: "0103", aba: "021001033" },
            },
          ],
          notes: "Published correspondents.",
          source: "published-ssi",
        }),
      ),
    );

    const { user } = renderLab();
    await user.clear(screen.getByLabelText(/beneficiary bic/i));
    await user.type(screen.getByLabelText(/beneficiary bic/i), "ABNGNGLAXXX");
    await user.click(screen.getByRole("button", { name: /find.*intermediar/i }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Published correspondents" })).toBeVisible();
    });
    expect(screen.getByText(/authoritative instruction, not a guess/i)).toBeVisible();
    expect(screen.getByText("CHIPS 0008 · ABA 021000089")).toBeVisible();
    expect(screen.getByText("CHIPS 0103 · ABA 021001033")).toBeVisible();
    expect(screen.getAllByText("published SSI").length).toBe(2);
  });

  it("labels corridor results as heuristic in the basis column", async () => {
    server.use(
      http.get("/api/route", () => HttpResponse.json(ROUTE_FIXTURE)),
    );

    const { user } = renderLab();
    await user.click(screen.getByRole("button", { name: /find.*intermediar/i }));

    await waitFor(() => {
      expect(screen.getAllByText("heuristic").length).toBeGreaterThanOrEqual(2);
    });
    expect(screen.getByRole("heading", { name: "Possible correspondent options" })).toBeVisible();
  });

  it("renders the CHIPS vs Fedwire settlement-layer section", () => {
    renderLab();
    expect(
      screen.getByRole("heading", { name: /the settlement layer: chips and fedwire/i }),
    ).toBeVisible();
    expect(screen.getByText(/The Clearing House \(private, bank-owned\)/i)).toBeVisible();
    expect(screen.getByText(/Real-time gross/i)).toBeVisible();
  });

  it("emits settlement-system for the netting answer", async () => {
    const { user, onCheckpoint } = renderLab();

    await user.click(
      screen.getByRole("button", { name: /nets payments against each other all day/i }),
    );

    await waitFor(() => {
      expect(onCheckpoint).toHaveBeenCalledWith("settlement-system");
    });
  });

  it("does not emit settlement-system for the SWIFT-moves-money answer", async () => {
    const { user, onCheckpoint } = renderLab();

    await user.click(screen.getByRole("button", { name: /SWIFT moves the money/i }));
    expect(onCheckpoint).not.toHaveBeenCalledWith("settlement-system");
  });

  it("emits serial-cover for the information-ahead answer", async () => {
    const { user, onCheckpoint } = renderLab();

    await user.click(
      screen.getByRole("button", { name: /gets the information there before the money/i }),
    );

    await waitFor(() => {
      expect(onCheckpoint).toHaveBeenCalledWith("serial-cover");
    });
  });

  it("does not emit serial-cover for the no-difference answer", async () => {
    const { user, onCheckpoint } = renderLab();

    await user.click(screen.getByRole("button", { name: /banks pick at random/i }));
    expect(onCheckpoint).not.toHaveBeenCalledWith("serial-cover");
  });

  it("handles empty route results gracefully", async () => {
    server.use(
      http.get("/api/route", () =>
        HttpResponse.json({
          bic: "UNKNOWNXXX",
          currency: "XXX",
          valid: true,
          suggested_intermediaries: [],
          notes: "No route found",
          source: "curated-corridor-table",
        }),
      ),
    );

    const { user } = renderLab();
    await user.clear(screen.getByLabelText(/beneficiary bic/i));
    await user.type(screen.getByLabelText(/beneficiary bic/i), "UNKNOWNXXX");
    await user.click(screen.getByRole("button", { name: /find.*intermediar/i }));

    await waitFor(() => {
      expect(screen.getByText(/No intermediaries found/i)).toBeVisible();
    });
  });
});
