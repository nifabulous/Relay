import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Exercise } from "./Exercise";

function renderExercise(overrides: Partial<Parameters<typeof Exercise>[0]> = {}) {
  const onCorrect = vi.fn();
  const user = userEvent.setup();
  const utils = render(
    <Exercise
      id="test-ex"
      title="Test Exercise"
      prompt="What is 2+2?"
      label="Your answer"
      hint="Think carefully"
      checkAnswer={() => ({ correct: true, feedback: "Correct!" })}
      onCorrect={onCorrect}
      {...overrides}
    />,
  );
  return { user, onCorrect, ...utils };
}

describe("Exercise", () => {
  it("renders title, prompt, label, and input", () => {
    renderExercise();
    expect(screen.getByText("Test Exercise")).toBeVisible();
    expect(screen.getByText("What is 2+2?")).toBeVisible();
    expect(screen.getByLabelText("Your answer")).toBeVisible();
  });

  it("shows hint on demand via disclosure", async () => {
    const { user } = renderExercise();
    expect(screen.queryByText("Think carefully")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /show hint/i }));
    expect(screen.getByText("Think carefully")).toBeVisible();
  });

  it("submits on button click and shows success feedback", async () => {
    const { user } = renderExercise();
    await user.type(screen.getByLabelText("Your answer"), "4");
    await user.click(screen.getByRole("button", { name: /check answer/i }));
    expect(screen.getByText("Correct!")).toBeVisible();
  });

  it("submits on Enter key", async () => {
    const { user } = renderExercise();
    await user.type(screen.getByLabelText("Your answer"), "4");
    await user.keyboard("{Enter}");
    expect(screen.getByText("Correct!")).toBeVisible();
  });

  it("rejects whitespace-only input", async () => {
    const { user } = renderExercise();
    await user.type(screen.getByLabelText("Your answer"), "   ");
    await user.click(screen.getByRole("button", { name: /check answer/i }));
    // Should not call checker, should show error
    expect(screen.getByText(/enter an answer/i)).toBeVisible();
  });

  it("calls onCorrect exactly once when answer is correct", async () => {
    const { user, onCorrect } = renderExercise();
    await user.type(screen.getByLabelText("Your answer"), "4");
    await user.click(screen.getByRole("button", { name: /check answer/i }));
    expect(onCorrect).toHaveBeenCalledTimes(1);
  });

  it("does not call onCorrect on wrong answer", async () => {
    const { user, onCorrect } = renderExercise({
      checkAnswer: () => ({ correct: false, feedback: "Try again" }),
    });
    await user.type(screen.getByLabelText("Your answer"), "5");
    await user.click(screen.getByRole("button", { name: /check answer/i }));
    expect(onCorrect).not.toHaveBeenCalled();
    expect(screen.getByText("Try again")).toBeVisible();
  });

  it("clears stale feedback when input is edited after submission", async () => {
    const { user } = renderExercise({
      checkAnswer: () => ({ correct: false, feedback: "Wrong" }),
    });
    await user.type(screen.getByLabelText("Your answer"), "5");
    await user.click(screen.getByRole("button", { name: /check answer/i }));
    expect(screen.getByText("Wrong")).toBeVisible();

    // Edit the input — feedback should clear
    await user.type(screen.getByLabelText("Your answer"), "0");
    expect(screen.queryByText("Wrong")).not.toBeInTheDocument();
  });

  it("handles async checkers with loading state", async () => {
    const { user } = renderExercise({
      checkAnswer: async () => {
        await new Promise((r) => setTimeout(r, 50));
        return { correct: true, feedback: "Correct!" };
      },
    });
    await user.type(screen.getByLabelText("Your answer"), "4");
    await user.click(screen.getByRole("button", { name: /check answer/i }));
    // Button should show loading state
    expect(screen.getByRole("button", { name: /checking/i })).toBeDisabled();
  });

  it("recovers from a thrown checker error", async () => {
    const { user } = renderExercise({
      checkAnswer: () => { throw new Error("Checker crashed"); },
    });
    await user.type(screen.getByLabelText("Your answer"), "4");
    await user.click(screen.getByRole("button", { name: /check answer/i }));
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });
});
