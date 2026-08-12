import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { PracticePage } from "./PracticePage";
import { loadPracticeState, dayKey } from "./practiceStore";
import {
  createTestSink,
  resetAnalyticsSink,
  setAnalyticsSink,
} from "../../../lib/analytics/analytics";

function renderPage() {
  const user = userEvent.setup();
  const utils = render(
    <MemoryRouter initialEntries={["/learn/practice"]}>
      <PracticePage />
    </MemoryRouter>,
  );
  return { user, ...utils };
}

/** Answer the currently shown question by clicking its first enabled option. */
async function answerCurrent(user: ReturnType<typeof userEvent.setup>) {
  const fieldset = document.querySelector(".practice-question");
  if (!fieldset) throw new Error("no active question");
  const option = fieldset.querySelector<HTMLButtonElement>(
    "button.lab-multiple-choice__option:not([disabled])",
  );
  if (!option) throw new Error("no enabled option");
  await user.click(option);
}

beforeEach(() => {
  localStorage.clear();
  resetAnalyticsSink();
  // Seed a learner with several completed modules so the pool supports a
  // full five-question drill.
  localStorage.setItem(
    "relay:progress",
    JSON.stringify({
      schemaVersion: 1,
      completedModuleIds: ["lab-1", "lab-2", "lab-3", "lab-4", "lab-5", "lab-6", "lab-7"],
    }),
  );
});

describe("PracticePage", () => {
  it("shows the intro with streak stats and a start button", () => {
    renderPage();
    expect(screen.getByRole("heading", { name: /daily practice/i })).toBeVisible();
    expect(screen.getByText(/day streak/i)).toBeVisible();
    expect(screen.getByRole("button", { name: /start today's five/i })).toBeVisible();
  });

  it("walks through five questions and records the drill", async () => {
    const { user } = renderPage();
    await user.click(screen.getByRole("button", { name: /start today's five/i }));

    for (let i = 1; i <= 5; i++) {
      expect(screen.getByText(`Question ${i} of 5`)).toBeVisible();
      await answerCurrent(user);
      const nextLabel = i < 5 ? /next question/i : /finish drill/i;
      await user.click(screen.getByRole("button", { name: nextLabel }));
    }

    expect(screen.getByRole("heading", { name: /drill complete/i })).toBeVisible();

    const state = loadPracticeState();
    expect(state.lastPracticeDay).toBe(dayKey(new Date()));
    expect(state.streak).toBe(1);
    expect(state.history).toHaveLength(1);
    expect(state.history[0].total).toBe(5);
  });

  it("locks the question after one attempt (single-attempt drill)", async () => {
    const { user } = renderPage();
    await user.click(screen.getByRole("button", { name: /start today's five/i }));

    await answerCurrent(user);

    const fieldset = document.querySelector(".practice-question")!;
    const options = fieldset.querySelectorAll<HTMLButtonElement>("button.lab-multiple-choice__option");
    for (const option of options) {
      expect(option).toBeDisabled();
    }
    // Explanation feedback is visible
    expect(fieldset.querySelector(".lab-multiple-choice__feedback")).not.toBeNull();
  });

  it("captures bounded telemetry for a practice drill", async () => {
    const sink = createTestSink();
    setAnalyticsSink(sink);
    const { user } = renderPage();

    await user.click(screen.getByRole("button", { name: /start today's five/i }));
    expect(sink.events).toContainEqual({
      name: "practice_started",
      properties: { question_count: 5 },
    });

    await answerCurrent(user);
    expect(sink.events).toContainEqual({
      name: "question_answered",
      properties: expect.objectContaining({
        surface: "practice",
        question_id: expect.any(String),
        correct: expect.any(Boolean),
        attempt_index: 1,
      }),
    });

    for (let i = 1; i <= 5; i++) {
      if (i > 1) await answerCurrent(user);
      const nextLabel = i < 5 ? /next question/i : /finish drill/i;
      await user.click(screen.getByRole("button", { name: nextLabel }));
    }

    expect(sink.events).toContainEqual({
      name: "practice_completed",
      properties: expect.objectContaining({
        question_count: 5,
        correct_count: expect.any(Number),
      }),
    });
    const completed = sink.events.find((event) => event.name === "practice_completed");
    if (!completed || completed.name !== "practice_completed") {
      throw new Error("expected practice_completed telemetry");
    }
    expect(completed.properties.correct_count).toBeGreaterThanOrEqual(0);
    expect(completed.properties.correct_count).toBeLessThanOrEqual(5);
  });

  it("offers 'practice again' once today's drill is done", async () => {
    const { user, unmount } = renderPage();
    await user.click(screen.getByRole("button", { name: /start today's five/i }));
    for (let i = 1; i <= 5; i++) {
      await answerCurrent(user);
      const nextLabel = i < 5 ? /next question/i : /finish drill/i;
      await user.click(screen.getByRole("button", { name: nextLabel }));
    }
    unmount();

    renderPage();
    expect(screen.getByText(/already practiced today/i)).toBeVisible();
    expect(screen.getByRole("button", { name: /practice again/i })).toBeVisible();
  });
});
