import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../../../test/server";
import { Lab3Content } from "./Lab3Content";

function renderLab(onCheckpoint = vi.fn()) {
  const user = userEvent.setup();
  const utils = render(
    <Lab3Content moduleId="lab-3" isComplete={false} onCheckpoint={onCheckpoint} />,
  );
  return { user, onCheckpoint, ...utils };
}

const VOP_FIXTURES = {
  match: {
    iban: "GB29NWBK60161331926819",
    submitted_name: "John Smith",
    outcome: "MATCH",
    score: 1.0,
    account_holder_name: null,
    advice: "Name matches the account holder.",
  },
  close: {
    iban: "GB29NWBK60161331926819",
    submitted_name: "Jon Smyth",
    outcome: "CLOSE_MATCH",
    score: 0.82,
    account_holder_name: "John Smith",
    advice: "Submitted name is close to the account holder. Please verify.",
  },
  nomatch: {
    iban: "GB29NWBK60161331926819",
    submitted_name: "Fraudster McScam",
    outcome: "NO_MATCH",
    score: 0.12,
    account_holder_name: null,
    advice: "Name does not match. Do not proceed.",
  },
};

describe("Lab3Content", () => {
  it("renders the outcome reference table with all four outcomes", () => {
    renderLab();
    expect(screen.getByText("MATCH")).toBeVisible();
    expect(screen.getByText("CLOSE_MATCH")).toBeVisible();
    expect(screen.getByText("NO_MATCH")).toBeVisible();
    expect(screen.getByText("NOT_CHECKED")).toBeVisible();
  });

  it("renders the demo form with IBAN and name inputs", () => {
    renderLab();
    const iban = screen.getByLabelText("IBAN");
    expect(iban).toBeVisible();
    expect(iban).toHaveAttribute("type", "text");
    expect(iban).not.toHaveAttribute("readonly");
    expect(screen.getByLabelText("Payee name")).toBeVisible();
  });

  it("renders three quick-scenario buttons", () => {
    renderLab();
    // Each button contains its label + description text
    const matchBtn = screen.getByRole("button", { name: /Use exact match.*Fills John Smith/ });
    const closeBtn = screen.getByRole("button", { name: /Use close match.*Fills Jon Smyth/ });
    const fraudBtn = screen.getByRole("button", { name: /Use fraud example.*Fills a different name/ });
    expect(matchBtn).toBeVisible();
    expect(closeBtn).toBeVisible();
    expect(fraudBtn).toBeVisible();
  });

  it("submits the edited IBAN and payee name and renders the VoP result", async () => {
    let requestBody: Record<string, string> | null = null;
    server.use(
      http.post("/api/verify-payee", async ({ request }) => {
        requestBody = await request.json() as Record<string, string>;
        return HttpResponse.json(VOP_FIXTURES.match);
      }),
    );

    const { user } = renderLab();
    const iban = screen.getByLabelText("IBAN");
    await user.clear(iban);
    await user.type(iban, "GB29NWBK60161331926819");
    await user.type(screen.getByLabelText("Payee name"), "John Smith");
    await user.click(screen.getByRole("button", { name: "Verify payee" }));

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent("MATCH");
    });
    expect(requestBody).toEqual({ iban: "GB29NWBK60161331926819", name: "John Smith" });
  });

  it("shows validation feedback without requesting when a form field is empty", async () => {
    let requestCount = 0;
    server.use(
      http.post("/api/verify-payee", () => {
        requestCount += 1;
        return HttpResponse.json(VOP_FIXTURES.match);
      }),
    );

    const { user, onCheckpoint } = renderLab();
    await user.click(screen.getByRole("button", { name: "Verify payee" }));

    expect(screen.getByRole("alert")).toHaveTextContent(/enter an iban and payee name/i);
    expect(requestCount).toBe(0);
    expect(onCheckpoint).not.toHaveBeenCalled();

    const section = screen.getByRole("heading", { name: /Try it: Verify a payee/i }).closest("section");
    expect(section?.querySelector(".lab-vop-scenarios")).not.toBeNull();
    expect(section?.querySelector(".lab-error")).not.toBeNull();
  });

  it("fills a scenario without submitting it", async () => {
    let requestCount = 0;
    server.use(
      http.post("/api/verify-payee", () => {
        requestCount += 1;
        return HttpResponse.json(VOP_FIXTURES.close);
      }),
    );

    const { user } = renderLab();
    await user.click(screen.getByRole("button", { name: /use close match/i }));

    expect(screen.getByLabelText("Payee name")).toHaveValue("Jon Smyth");
    expect(requestCount).toBe(0);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("emits run-match checkpoint when MATCH scenario is run", async () => {
    server.use(
      http.post("/api/verify-payee", () => HttpResponse.json(VOP_FIXTURES.match)),
    );

    const { user, onCheckpoint } = renderLab();
    await user.click(screen.getByRole("button", { name: /use exact match/i }));
    await user.click(screen.getByRole("button", { name: "Verify payee" }));

    await waitFor(() => {
      expect(onCheckpoint).toHaveBeenCalledWith("run-match");
    });
  });

  it("emits run-close-match checkpoint when CLOSE_MATCH scenario is run", async () => {
    server.use(
      http.post("/api/verify-payee", () => HttpResponse.json(VOP_FIXTURES.close)),
    );

    const { user, onCheckpoint } = renderLab();
    await user.click(screen.getByRole("button", { name: /use close match/i }));
    await user.click(screen.getByRole("button", { name: "Verify payee" }));

    await waitFor(() => {
      expect(onCheckpoint).toHaveBeenCalledWith("run-close-match");
    });
  });

  it("shows the real account holder name on CLOSE_MATCH", async () => {
    server.use(
      http.post("/api/verify-payee", () => HttpResponse.json(VOP_FIXTURES.close)),
    );

    const { user } = renderLab();
    await user.click(screen.getByRole("button", { name: /use close match/i }));
    await user.click(screen.getByRole("button", { name: "Verify payee" }));

    await waitFor(() => {
      expect(screen.getByText("John Smith")).toBeVisible();
    });
  });

  it("does not show the comparison section on MATCH (privacy)", async () => {
    server.use(
      http.post("/api/verify-payee", () => HttpResponse.json(VOP_FIXTURES.match)),
    );

    const { user } = renderLab();
    await user.click(screen.getByRole("button", { name: /use exact match/i }));
    await user.click(screen.getByRole("button", { name: "Verify payee" }));

    // Wait for result to render (the advice text is unique to the result)
    await waitFor(() => {
      expect(screen.getByText("Name matches the account holder.")).toBeVisible();
    });
    // The comparison section should NOT be rendered on MATCH
    expect(document.querySelector(".lab-vop-compare")).toBeNull();
  });

  it("emits identify-fraud-risk checkpoint when NO_MATCH scenario is run", async () => {
    server.use(
      http.post("/api/verify-payee", () => HttpResponse.json(VOP_FIXTURES.nomatch)),
    );

    const { user, onCheckpoint } = renderLab();
    await user.click(screen.getByRole("button", { name: /use fraud example/i }));
    await user.click(screen.getByRole("button", { name: "Verify payee" }));

    await waitFor(() => {
      expect(onCheckpoint).toHaveBeenCalledWith("identify-fraud-risk");
    });
  });

  it("renders the score bar when a result has a score", async () => {
    server.use(
      http.post("/api/verify-payee", () => HttpResponse.json(VOP_FIXTURES.close)),
    );

    const { user } = renderLab();
    await user.click(screen.getByRole("button", { name: /use close match/i }));
    await user.click(screen.getByRole("button", { name: "Verify payee" }));

    await waitFor(() => {
      expect(screen.getByText(/82%/)).toBeVisible();
    });
  });

  it("shows stop advice for NO_MATCH", async () => {
    server.use(
      http.post("/api/verify-payee", () => HttpResponse.json(VOP_FIXTURES.nomatch)),
    );

    const { user } = renderLab();
    await user.click(screen.getByRole("button", { name: /use fraud example/i }));
    await user.click(screen.getByRole("button", { name: "Verify payee" }));

    await waitFor(() => {
      expect(screen.getByText(/do not proceed/i)).toBeVisible();
    });
  });

  it("renders the decision drill with two questions", () => {
    renderLab();
    expect(screen.getByRole("heading", { name: /Choose the safest next step/i })).toBeVisible();
    expect(screen.getByText(/Use each VoP result to decide what should happen next/i)).toBeVisible();
    expect(screen.getByText(/CLOSE_MATCH.*Jonathan Smythe.*John Smith/i)).toBeVisible();
    expect(screen.getByText(/NOT_CHECKED.*beneficiary bank/i)).toBeVisible();
  });

  it("does not emit decide-outcome after only one correct answer", async () => {
    const { user, onCheckpoint } = renderLab();
    await user.click(
      screen.getByRole("button", { name: /Pause and confirm the account holder name/i }),
    );
    expect(onCheckpoint).not.toHaveBeenCalledWith("decide-outcome");
  });

  it("emits decide-outcome only after both decision questions are answered correctly", async () => {
    const { user, onCheckpoint } = renderLab();

    // Wrong answer first — no checkpoint
    await user.click(
      screen.getByRole("button", { name: /Send it — 0\.81 is a high score/i }),
    );
    expect(onCheckpoint).not.toHaveBeenCalledWith("decide-outcome");

    // Correct answers to both questions
    await user.click(
      screen.getByRole("button", { name: /Pause and confirm the account holder name/i }),
    );
    await user.click(
      screen.getByRole("button", { name: /doesn't participate in VoP, so the name was never compared/i }),
    );

    await waitFor(() => {
      expect(onCheckpoint).toHaveBeenCalledWith("decide-outcome");
    });
  });
});
