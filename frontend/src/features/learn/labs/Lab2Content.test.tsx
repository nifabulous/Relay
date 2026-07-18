import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../../../test/server";
import { Lab2Content } from "./Lab2Content";

function renderLab(onCheckpoint = vi.fn()) {
  const user = userEvent.setup();
  const utils = render(
    <Lab2Content moduleId="lab-2" isComplete={false} onCheckpoint={onCheckpoint} />,
  );
  return { user, onCheckpoint, ...utils };
}

describe("Lab2Content", () => {
  it("renders the MOD-97 concept explanation", () => {
    renderLab();
    expect(screen.getByRole("heading", { name: /MOD-97/i })).toBeVisible();
  });

  it("renders the pre-filled valid IBAN demo", () => {
    renderLab();
    // The demo IBAN DE89370400440532013000 should be visible somewhere
    expect(screen.getByText(/DE89370400440532013000/)).toBeVisible();
  });

  it("renders the Check button for the valid IBAN demo", () => {
    renderLab();
    expect(screen.getByRole("button", { name: /check.*valid/i })).toBeVisible();
  });

  it("renders the break-it interactive section", () => {
    renderLab();
    expect(screen.getByText(/break/i)).toBeVisible();
  });

  it("renders the find-the-typo multiple choice exercise", () => {
    renderLab();
    // Two IBAN options should be visible
    expect(screen.getByText(/GB29NWBK60161331926819/)).toBeVisible();
    expect(screen.getByText(/GB29NWBK60161331926818/)).toBeVisible();
  });

  it("emits validate-original checkpoint when valid IBAN is checked", async () => {
    server.use(
      http.get("/api/validate", ({ request }) => {
        const url = new URL(request.url);
        const value = url.searchParams.get("value") ?? "";
        const valid = value === "DE89370400440532013000";
        return HttpResponse.json({
          input: value,
          input_type: "iban",
          valid,
          errors: valid ? [] : ["Checksum failed"],
        });
      }),
    );

    const { user, onCheckpoint } = renderLab();
    const checkBtn = screen.getByRole("button", { name: /check.*valid/i });
    await user.click(checkBtn);

    await waitFor(() => {
      expect(onCheckpoint).toHaveBeenCalledWith("validate-original");
    });
  });

  it("emits break-checksum checkpoint when a broken IBAN is checked", async () => {
    const { user, onCheckpoint } = renderLab();
    server.use(
      http.get("/api/validate", () =>
        HttpResponse.json({
          input: "test",
          input_type: "iban",
          valid: false,
          errors: ["Checksum failed"],
        }),
      ),
    );

    // Find the break-it input by its aria-label
    const breakInput = screen.getByLabelText("IBAN to break");
    await user.clear(breakInput);
    await user.type(breakInput, "DE89370400440532013009");
    const breakBtn = screen.getByRole("button", { name: /check.*broken/i });
    await user.click(breakBtn);

    await waitFor(() => {
      expect(onCheckpoint).toHaveBeenCalledWith("break-checksum");
    });
  });

  it("emits find-valid-iban checkpoint when correct option is chosen", async () => {
    server.use(
      http.get("/api/validate", ({ request }) => {
        const url = new URL(request.url);
        const value = url.searchParams.get("value") ?? "";
        return HttpResponse.json({
          input: value,
          input_type: "iban",
          valid: value === "GB29NWBK60161331926819",
          errors: value === "GB29NWBK60161331926819" ? [] : ["Checksum failed"],
        });
      }),
    );

    const { user, onCheckpoint } = renderLab();
    // Click the valid IBAN option in the multiple choice
    await user.click(screen.getByText("GB29NWBK60161331926819"));

    await waitFor(() => {
      expect(onCheckpoint).toHaveBeenCalledWith("find-valid-iban");
    });
  });
});
