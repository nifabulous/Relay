import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../../../test/server";
import { Lab1Content } from "./Lab1Content";

function renderLab(onCheckpoint = vi.fn()) {
  const user = userEvent.setup();
  const utils = render(
    <Lab1Content moduleId="lab-1" isComplete={false} onCheckpoint={onCheckpoint} />,
  );
  return { user, onCheckpoint, ...utils };
}

describe("Lab1Content", () => {
  it("renders static BIC decomposition for CITIUS33XXX", () => {
    renderLab();
    expect(screen.getByText("CITI")).toBeVisible();
    expect(screen.getByText("US")).toBeVisible();
    expect(screen.getByText("33")).toBeVisible();
  });

  it("renders static IBAN decomposition for GB29NWBK60161331926819", () => {
    renderLab();
    expect(screen.getByText("GB")).toBeVisible();
    expect(screen.getByText("29")).toBeVisible();
    expect(screen.getByText("NWBK")).toBeVisible();
  });

  it("renders the live analyzer input", () => {
    renderLab();
    expect(screen.getByPlaceholderText(/enter a BIC or IBAN/i)).toBeVisible();
    expect(screen.getByRole("button", { name: /analyze/i })).toBeVisible();
  });

  it("renders exercise 1 (identify country from BIC)", () => {
    renderLab();
    expect(screen.getByText(/which country/i)).toBeVisible();
  });

  it("renders exercise 2 (identify bank from IBAN)", () => {
    renderLab();
    expect(screen.getByText(/which bank/i)).toBeVisible();
  });

  it("emits analyze-identifier checkpoint when analyzer runs successfully", async () => {
    server.use(
      http.get("/api/validate", () =>
        HttpResponse.json({
          input: "CITIUS33",
          input_type: "bic",
          valid: true,
          bic: "CITIUS33",
          bank: { bic: "CITIUS33", bank_name: "Citibank", country_code: "US" },
          errors: [],
        }),
      ),
    );

    const { user, onCheckpoint } = renderLab();
    await user.type(screen.getByPlaceholderText(/enter a BIC or IBAN/i), "CITIUS33");
    await user.click(screen.getByRole("button", { name: /analyze/i }));

    await waitFor(() => {
      expect(onCheckpoint).toHaveBeenCalledWith("analyze-identifier");
    });
  });

  it("emits identify-country checkpoint when exercise 1 is answered correctly", async () => {
    const { user, onCheckpoint } = renderLab();
    // The exercise input has id "ex-country-input"
    await user.type(screen.getByLabelText(/country name or code/i), "Nigeria");
    // The check button is inside the same exercise
    const checkButtons = screen.getAllByRole("button", { name: /check answer/i });
    await user.click(checkButtons[0]);

    await waitFor(() => {
      expect(onCheckpoint).toHaveBeenCalledWith("identify-country");
    });
  });

  it("emits identify-bank checkpoint when exercise 2 is answered correctly", async () => {
    const { user, onCheckpoint } = renderLab();
    await user.type(screen.getByLabelText(/bank name or code/i), "NatWest");
    const checkButtons = screen.getAllByRole("button", { name: /check answer/i });
    await user.click(checkButtons[1]);

    await waitFor(() => {
      expect(onCheckpoint).toHaveBeenCalledWith("identify-bank");
    });
  });
});
