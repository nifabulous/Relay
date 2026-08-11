import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../../../test/server";
import { OpsRepairContent } from "./OpsRepairContent";

function renderLab(onCheckpoint = vi.fn()) {
  const user = userEvent.setup();
  const utils = render(
    <OpsRepairContent moduleId="ops-repair" isComplete={false} onCheckpoint={onCheckpoint} />,
  );
  return { user, onCheckpoint, ...utils };
}

const REJECTED_CHECK = {
  verdict: "REJECTED",
  stp_passes: false,
  findings: [
    {
      field: "59",
      field_name: "Beneficiary Customer",
      severity: "error",
      code: "STP-BENEFICIARY-MISSING",
      message: "Beneficiary account (field 59) is missing.",
      repair: "Supply both the beneficiary name and account.",
    },
    {
      field: "121",
      field_name: "UETR",
      severity: "info",
      code: "STP-UETR-MISSING",
      message: "No UETR (field 121) supplied.",
      repair: "A UETR will be auto-generated at initiation.",
    },
  ],
  field_summary: [],
  disclaimer: "SIMULATION",
};

const CLEAN_CHECK = {
  verdict: "CLEAN",
  stp_passes: true,
  findings: [],
  field_summary: [],
  disclaimer: "SIMULATION",
};

/** Mock that returns REJECTED for the broken payment (empty beneficiary
 *  account) and CLEAN for the repaired one. */
function mockStpEndpoint() {
  server.use(
    http.post("/api/message/stp-check", async ({ request }) => {
      const body = (await request.json()) as { beneficiary: { account: string } };
      const broken = !body.beneficiary?.account;
      return HttpResponse.json(broken ? REJECTED_CHECK : CLEAN_CHECK);
    }),
  );
}

/** Answer the repair question correctly so the re-run section appears. */
async function chooseCorrectRepair(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    screen.getByRole("button", { name: /source the beneficiary account number/i }),
  );
}

describe("OpsRepairContent", () => {
  it("renders both workflows and the closing sections", () => {
    renderLab();
    expect(screen.getByText(/the desk where payments get fixed/i)).toBeVisible();
    expect(screen.getByText(/workflow 1: the repair queue/i)).toBeVisible();
    expect(screen.getByText(/workflow 2: nostro reconciliation/i)).toBeVisible();
    expect(screen.getByText(/why these two workflows matter together/i)).toBeVisible();
  });

  it("shows the broken payment with its empty field 59", () => {
    renderLab();
    expect(screen.getByText(/account: \(empty\)/i)).toBeVisible();
    expect(screen.getByText("INV-2026-0812")).toBeVisible();
  });

  it("runs the STP check, shows findings, and emits run-stp-check", async () => {
    mockStpEndpoint();
    const { user, onCheckpoint } = renderLab();

    await user.click(screen.getByRole("button", { name: /run stp check/i }));

    await waitFor(() => {
      expect(screen.getByText("REJECTED")).toBeVisible();
    });
    expect(screen.getByText(/beneficiary account \(field 59\) is missing/i)).toBeVisible();
    expect(onCheckpoint).toHaveBeenCalledWith("run-stp-check");
  });

  it("keeps the repair question hidden until the check has run", () => {
    renderLab();
    expect(screen.queryByText(/choose the repair/i)).toBeNull();
  });

  it("emits choose-repair for the correct repair and reveals the re-run", async () => {
    mockStpEndpoint();
    const { user, onCheckpoint } = renderLab();

    await user.click(screen.getByRole("button", { name: /run stp check/i }));
    await waitFor(() => {
      expect(screen.getByText(/choose the repair/i)).toBeVisible();
    });

    await chooseCorrectRepair(user);

    await waitFor(() => {
      expect(onCheckpoint).toHaveBeenCalledWith("choose-repair");
    });
    expect(screen.getByRole("button", { name: /re-run stp check/i })).toBeVisible();
  });

  it("does not emit choose-repair for the delete-the-name answer", async () => {
    mockStpEndpoint();
    const { user, onCheckpoint } = renderLab();

    await user.click(screen.getByRole("button", { name: /run stp check/i }));
    await waitFor(() => {
      expect(screen.getByText(/choose the repair/i)).toBeVisible();
    });

    await user.click(screen.getByRole("button", { name: /delete the beneficiary name/i }));
    expect(onCheckpoint).not.toHaveBeenCalledWith("choose-repair");
  });

  it("emits rerun-clean when the repaired payment passes", async () => {
    mockStpEndpoint();
    const { user, onCheckpoint } = renderLab();

    await user.click(screen.getByRole("button", { name: /run stp check/i }));
    await waitFor(() => {
      expect(screen.getByText(/choose the repair/i)).toBeVisible();
    });
    await chooseCorrectRepair(user);
    await user.click(screen.getByRole("button", { name: /re-run stp check/i }));

    await waitFor(() => {
      expect(onCheckpoint).toHaveBeenCalledWith("rerun-clean");
    });
    expect(screen.getByText(/leaves your queue/i)).toBeVisible();
  });

  it("sends the repaired beneficiary account on the re-run", async () => {
    const bodies: Array<{ beneficiary: { account: string } }> = [];
    server.use(
      http.post("/api/message/stp-check", async ({ request }) => {
        const body = (await request.json()) as { beneficiary: { account: string } };
        bodies.push(body);
        return HttpResponse.json(body.beneficiary?.account ? CLEAN_CHECK : REJECTED_CHECK);
      }),
    );
    const { user } = renderLab();

    await user.click(screen.getByRole("button", { name: /run stp check/i }));
    await waitFor(() => {
      expect(screen.getByText(/choose the repair/i)).toBeVisible();
    });
    await chooseCorrectRepair(user);
    await user.click(screen.getByRole("button", { name: /re-run stp check/i }));

    await waitFor(() => {
      expect(bodies).toHaveLength(2);
    });
    expect(bodies[0].beneficiary.account).toBe("");
    expect(bodies[1].beneficiary.account).toBe("ACCT-20734");
  });

  it("renders the ledger and statement tables with the two breaks", () => {
    renderLab();
    expect(screen.getAllByText("OUT-4471").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("+39,972.00")).toBeVisible();
    expect(screen.getByText("CHG-2210")).toBeVisible();
  });

  it("emits spot-break for the lift-fee explanation", async () => {
    const { user, onCheckpoint } = renderLab();

    await user.click(
      screen.getByRole("button", { name: /intermediaries deducted lift fees in flight/i }),
    );

    await waitFor(() => {
      expect(onCheckpoint).toHaveBeenCalledWith("spot-break");
    });
  });

  it("does not emit spot-break for the fraud answer", async () => {
    const { user, onCheckpoint } = renderLab();

    await user.click(screen.getByRole("button", { name: /fraud — someone skimmed/i }));
    expect(onCheckpoint).not.toHaveBeenCalledWith("spot-break");
  });

  it("emits size-break for the correct 28.00 difference", async () => {
    const { user, onCheckpoint } = renderLab();

    await user.type(screen.getByLabelText(/break amount/i), "28.00");
    await user.click(screen.getByRole("button", { name: /check answer/i }));

    await waitFor(() => {
      expect(onCheckpoint).toHaveBeenCalledWith("size-break");
    });
  });

  it("redirects the 12.00 service-charge answer to the right break", async () => {
    const { user, onCheckpoint } = renderLab();

    await user.type(screen.getByLabelText(/break amount/i), "12");
    await user.click(screen.getByRole("button", { name: /check answer/i }));

    await waitFor(() => {
      expect(screen.getByText(/the OTHER break/i)).toBeVisible();
    });
    expect(onCheckpoint).not.toHaveBeenCalledWith("size-break");
  });

  it("shows an error when the STP check fails", async () => {
    server.use(
      http.post("/api/message/stp-check", () =>
        HttpResponse.json({ detail: "boom" }, { status: 500 }),
      ),
    );
    const { user } = renderLab();

    await user.click(screen.getByRole("button", { name: /run stp check/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/could not run/i);
    });
  });
});
