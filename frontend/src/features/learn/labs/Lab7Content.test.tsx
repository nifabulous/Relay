import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../../../test/server";
import { Lab7Content } from "./Lab7Content";

function renderLab(onCheckpoint = vi.fn()) {
  const user = userEvent.setup();
  const utils = render(
    <Lab7Content moduleId="lab-7" isComplete={false} onCheckpoint={onCheckpoint} />,
  );
  return { user, onCheckpoint, ...utils };
}

const SCHEMES_FIXTURE = {
  currency: "GBP",
  country: "United Kingdom",
  countryCode: "GB",
  iban: true,
  localIdentifier: "Sort Code",
  schemes: [
    { name: "Faster Payments", speed: "Instant", limit: "£1M", cost: "Free", useCase: "Retail", operator: "Pay.UK" },
    { name: "CHAPS", speed: "Same-day", limit: "No limit", cost: "£25", useCase: "High-value", operator: "BoE" },
  ],
};

describe("Lab7Content", () => {
  it("renders the concept explanation about payment schemes", () => {
    renderLab();
    expect(screen.getByRole("heading", { name: /many rails/i })).toBeVisible();
  });

  it("renders currency picker buttons", () => {
    renderLab();
    expect(screen.getByRole("button", { name: "GBP" })).toBeVisible();
    expect(screen.getByRole("button", { name: "USD" })).toBeVisible();
  });

  it("emits load-schemes checkpoint when schemes are loaded", async () => {
    server.use(
      http.get("/api/schemes", () => HttpResponse.json(SCHEMES_FIXTURE)),
    );

    const { user, onCheckpoint } = renderLab();
    await user.click(screen.getByRole("button", { name: "GBP" }));

    await waitFor(() => {
      expect(onCheckpoint).toHaveBeenCalledWith("load-schemes");
    });
  });

  it("renders scheme cards after loading", async () => {
    server.use(
      http.get("/api/schemes", () => HttpResponse.json(SCHEMES_FIXTURE)),
    );

    const { user } = renderLab();
    await user.click(screen.getByRole("button", { name: "GBP" }));

    await waitFor(() => {
      // Scheme names appear in both cards and quiz options — use getAllByText
      expect(screen.getAllByText("Faster Payments").length).toBeGreaterThanOrEqual(1);
    });
    expect(screen.getAllByText("CHAPS").length).toBeGreaterThanOrEqual(1);
  });

  it("renders seven scenario quizzes", () => {
    renderLab();
    // Each scenario is a fieldset with a legend
    const fieldsets = document.querySelectorAll("fieldset");
    // At least the quizzes (there may be extra fieldsets, so check for >= 7)
    expect(fieldsets.length).toBeGreaterThanOrEqual(7);
  });

  it("emits complete-seven-scenarios when all quizzes are answered correctly", async () => {
    const { user, onCheckpoint } = renderLab();

    // Find all correct option buttons across all quizzes
    // Each quiz has options; the correct ones are marked aria-pressed after click
    // We need to click the correct option in each of the 7 quizzes
    const fieldsets = screen.getAllByRole("group");
    for (const fieldset of fieldsets) {
      const buttons = fieldset.querySelectorAll("button");
      // Click the first button in each (tests use simple correct/wrong patterns)
      // In practice, we need to find the correct one — let's click each until one turns correct
      for (const btn of buttons) {
        if (btn.textContent && !btn.hasAttribute("disabled")) {
          await user.click(btn as HTMLElement);
          // If this was correct, it'll have the correct class
          if (btn.className.includes("correct")) break;
          // Reset by clicking elsewhere — the quiz auto-resets wrong answers
        }
      }
    }

    // This test is complex — verify the checkpoint fires
    // The real implementation tracks unique correct scenario IDs
    await waitFor(() => {
      expect(onCheckpoint).toHaveBeenCalledWith("complete-seven-scenarios");
    }, { timeout: 5000 });
  });
});
