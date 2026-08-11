import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../../../test/server";
import { SanctionsContent } from "./SanctionsContent";

function renderLab(onCheckpoint = vi.fn()) {
  const user = userEvent.setup();
  const utils = render(
    <SanctionsContent moduleId="sanctions" isComplete={false} onCheckpoint={onCheckpoint} />,
  );
  return { user, onCheckpoint, ...utils };
}

/** Build a /api/screen fixture keyed off the beneficiary name, mirroring the
 *  real backend scores for the lab's three scenarios. */
function screenFixture(beneficiaryName: string) {
  const profiles: Record<string, { score: number; rec: string; overall: string }> = {
    "Adaeze Okafor": { score: 0.4, rec: "CLEAR", overall: "CLEAR" },
    "Tarik Kasem": { score: 0.8696, rec: "REVIEW", overall: "REVIEW" },
    "Tariq Kassem": { score: 1.0, rec: "REJECT", overall: "BLOCKED" },
  };
  const p = profiles[beneficiaryName] ?? { score: 0.1, rec: "CLEAR", overall: "CLEAR" };
  const blocked = p.overall === "BLOCKED";
  return {
    sender: {
      party: "sender",
      name: "Acme Manufacturing Inc",
      hit: false,
      score: 0.2,
      recommendation: "CLEAR",
      matched_entry: null,
    },
    beneficiary: {
      party: "beneficiary",
      name: beneficiaryName,
      hit: p.rec !== "CLEAR",
      score: p.score,
      recommendation: p.rec,
      matched_entry: null,
    },
    hops: [
      {
        hop: 0,
        bic: "SENDER",
        bank_name: "Acme Manufacturing Inc",
        decision: blocked ? "HARD_HIT" : p.rec === "REVIEW" ? "POSSIBLE_HIT" : "CLEAR",
        action: blocked ? "REJECT" : p.rec === "REVIEW" ? "HOLD" : "PASS",
        delay_hours: blocked ? 0 : p.rec === "REVIEW" ? 24 : 0.1,
        notes: "test",
      },
      ...(blocked
        ? []
        : [
            {
              hop: 1,
              bic: "CITIUS33XXX",
              bank_name: "Citibank N.A.",
              decision: p.rec === "REVIEW" ? "POSSIBLE_HIT" : "CLEAR",
              action: p.rec === "REVIEW" ? "HOLD" : "PASS",
              delay_hours: p.rec === "REVIEW" ? 24 : 0.1,
              notes: "test",
            },
          ]),
    ],
    overall_recommendation: p.overall,
    blocked,
    blocked_at_hop: blocked ? 0 : null,
    total_delay_hours: blocked ? 0 : p.rec === "REVIEW" ? 48 : 0.3,
    disclaimer: "SIMULATION",
  };
}

function mockScreenEndpoint() {
  server.use(
    http.post("/api/screen", async ({ request }) => {
      const body = (await request.json()) as { beneficiary_name: string };
      return HttpResponse.json(screenFixture(body.beneficiary_name));
    }),
  );
}

describe("SanctionsContent", () => {
  it("renders the concept, decision-band table, demo, and false-positive sections", () => {
    renderLab();
    expect(screen.getByText(/the list every payment is checked against/i)).toBeVisible();
    expect(screen.getByText(/three bands, three outcomes/i)).toBeVisible();
    expect(screen.getByText(/screen a payment/i, { selector: "h2" })).toBeVisible();
    expect(screen.getByText(/the false-positive problem/i)).toBeVisible();
  });

  it("labels the watchlist as fictional training data", () => {
    renderLab();
    expect(screen.getByText(/fictional training watchlist/i)).toBeVisible();
  });

  it("renders the three quick scenarios", () => {
    renderLab();
    expect(screen.getByRole("button", { name: /use clean payment/i })).toBeVisible();
    expect(screen.getByRole("button", { name: /use possible hit/i })).toBeVisible();
    expect(screen.getByRole("button", { name: /use hard hit/i })).toBeVisible();
  });

  it("shows hop table and CLEAR outcome for a clean payment", async () => {
    mockScreenEndpoint();
    const { user } = renderLab();

    await user.click(screen.getByRole("button", { name: /use clean payment/i }));

    await waitFor(() => {
      expect(screen.getAllByText("CLEAR").length).toBeGreaterThanOrEqual(1);
    });
    expect(screen.getAllByText(/Citibank N.A./).length).toBeGreaterThanOrEqual(1);
  });

  it("shows BLOCKED and the blocked hop for a hard hit", async () => {
    mockScreenEndpoint();
    const { user } = renderLab();

    await user.click(screen.getByRole("button", { name: /use hard hit/i }));

    await waitFor(() => {
      expect(screen.getByText("BLOCKED")).toBeVisible();
    });
    expect(screen.getByText(/blocked at hop 0/i)).toBeVisible();
  });

  it("does not emit screen-scenarios after only a clean run", async () => {
    mockScreenEndpoint();
    const { user, onCheckpoint } = renderLab();

    await user.click(screen.getByRole("button", { name: /use clean payment/i }));
    await waitFor(() => {
      expect(screen.getAllByText("CLEAR").length).toBeGreaterThanOrEqual(1);
    });
    expect(onCheckpoint).not.toHaveBeenCalledWith("screen-scenarios");
  });

  it("emits screen-scenarios after contrasting a clean and a flagged run", async () => {
    mockScreenEndpoint();
    const { user, onCheckpoint } = renderLab();

    await user.click(screen.getByRole("button", { name: /use clean payment/i }));
    await waitFor(() => {
      expect(screen.getAllByText("CLEAR").length).toBeGreaterThanOrEqual(1);
    });
    await user.click(screen.getByRole("button", { name: /use hard hit/i }));

    await waitFor(() => {
      expect(onCheckpoint).toHaveBeenCalledWith("screen-scenarios");
    });
  });

  it("screens a manually typed name via the form", async () => {
    let captured: { beneficiary_name?: string; sender_name?: string } = {};
    server.use(
      http.post("/api/screen", async ({ request }) => {
        const body = (await request.json()) as { beneficiary_name: string; sender_name: string };
        captured = body;
        return HttpResponse.json(screenFixture(body.beneficiary_name));
      }),
    );
    const { user } = renderLab();

    await user.type(screen.getByLabelText(/beneficiary name/i), "Adaeze Okafor");
    await user.click(screen.getByRole("button", { name: /screen payment/i }));

    await waitFor(() => {
      expect(captured.beneficiary_name).toBe("Adaeze Okafor");
    });
    expect(captured.sender_name).toBe("Acme Manufacturing Inc");
  });

  it("emits judge-threshold when the 0.82 question is answered correctly", async () => {
    const { user, onCheckpoint } = renderLab();

    await user.click(screen.getByRole("button", { name: /holds it for a human compliance review/i }));

    await waitFor(() => {
      expect(onCheckpoint).toHaveBeenCalledWith("judge-threshold");
    });
  });

  it("does not emit judge-threshold for a wrong answer", async () => {
    const { user, onCheckpoint } = renderLab();

    await user.click(screen.getByRole("button", { name: /rejects it automatically/i }));
    expect(onCheckpoint).not.toHaveBeenCalledWith("judge-threshold");
  });

  it("emits find-possible-hit when the exercise name scores REVIEW", async () => {
    mockScreenEndpoint();
    const { user, onCheckpoint } = renderLab();

    await user.type(screen.getByLabelText(/name to screen/i), "Tarik Kasem");
    await user.click(screen.getByRole("button", { name: /check answer/i }));

    await waitFor(() => {
      expect(onCheckpoint).toHaveBeenCalledWith("find-possible-hit");
    });
  });

  it("rejects an exact watchlist name in the exercise as a hard hit", async () => {
    mockScreenEndpoint();
    const { user, onCheckpoint } = renderLab();

    await user.type(screen.getByLabelText(/name to screen/i), "Tariq Kassem");
    await user.click(screen.getByRole("button", { name: /check answer/i }));

    await waitFor(() => {
      expect(screen.getByText(/you've overshot/i)).toBeVisible();
    });
    expect(onCheckpoint).not.toHaveBeenCalledWith("find-possible-hit");
  });

  it("rejects a clearly different name in the exercise as CLEAR", async () => {
    mockScreenEndpoint();
    const { user, onCheckpoint } = renderLab();

    await user.type(screen.getByLabelText(/name to screen/i), "Adaeze Okafor");
    await user.click(screen.getByRole("button", { name: /check answer/i }));

    await waitFor(() => {
      expect(screen.getByText(/the engine clears it/i)).toBeVisible();
    });
    expect(onCheckpoint).not.toHaveBeenCalledWith("find-possible-hit");
  });

  it("emits escalation-decision for the correct RFI answer", async () => {
    const { user, onCheckpoint } = renderLab();

    await user.click(
      screen.getByRole("button", { name: /under review; we may ask you for more information/i }),
    );

    await waitFor(() => {
      expect(onCheckpoint).toHaveBeenCalledWith("escalation-decision");
    });
  });

  it("does not emit escalation-decision for the stripping answer", async () => {
    const { user, onCheckpoint } = renderLab();

    await user.click(
      screen.getByRole("button", { name: /resend with a slightly different beneficiary name/i }),
    );
    expect(onCheckpoint).not.toHaveBeenCalledWith("escalation-decision");
  });

  it("emits false-positive for the correct secondary-identifier answer", async () => {
    const { user, onCheckpoint } = renderLab();

    await user.click(
      screen.getByRole("button", { name: /nothing to tell them apart/i }),
    );

    await waitFor(() => {
      expect(onCheckpoint).toHaveBeenCalledWith("false-positive");
    });
  });

  it("shows an error when screening fails", async () => {
    server.use(
      http.post("/api/screen", () => HttpResponse.json({ detail: "boom" }, { status: 500 })),
    );
    const { user } = renderLab();

    await user.click(screen.getByRole("button", { name: /use clean payment/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/could not run/i);
    });
  });
});
