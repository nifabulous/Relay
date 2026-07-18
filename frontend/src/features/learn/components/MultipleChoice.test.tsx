import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MultipleChoice } from "./MultipleChoice";

describe("MultipleChoice", () => {
  it("renders question and all options in a fieldset", () => {
    render(
      <MultipleChoice
        question="Which rail?"
        options={[
          { id: "a", label: "Fedwire", correct: true, explanation: "Right" },
          { id: "b", label: "SEPA", correct: false, explanation: "Wrong" },
        ]}
      />,
    );
    expect(screen.getByText("Which rail?")).toBeVisible();
    expect(screen.getByText("Fedwire")).toBeVisible();
    expect(screen.getByText("SEPA")).toBeVisible();
  });

  it("marks correct answer and locks", async () => {
    const onCorrect = vi.fn();
    const user = userEvent.setup();
    render(
      <MultipleChoice
        question="Q"
        options={[
          { id: "a", label: "Right", correct: true, explanation: "Yes" },
          { id: "b", label: "Wrong", correct: false, explanation: "No" },
        ]}
        onCorrect={onCorrect}
      />,
    );

    await user.click(screen.getByText("Right"));
    expect(screen.getByText("Right")).toHaveClass("lab-multiple-choice__option--correct");
    expect(screen.getByText("Yes")).toBeVisible();
    expect(onCorrect).toHaveBeenCalledTimes(1);

    // Locked — can't click another option
    await user.click(screen.getByText("Wrong"));
    expect(screen.getByText("Wrong")).not.toHaveClass("lab-multiple-choice__option--wrong");
  });

  it("shows wrong feedback and allows retry on incorrect", async () => {
    const onCorrect = vi.fn();
    const user = userEvent.setup();
    render(
      <MultipleChoice
        question="Q"
        options={[
          { id: "a", label: "Right", correct: true, explanation: "Yes" },
          { id: "b", label: "Wrong", correct: false, explanation: "No" },
        ]}
        onCorrect={onCorrect}
      />,
    );

    await user.click(screen.getByText("Wrong"));
    expect(screen.getByText("Wrong")).toHaveClass("lab-multiple-choice__option--wrong");
    expect(screen.getByText("No")).toBeVisible();
    expect(onCorrect).not.toHaveBeenCalled();

    // Retry — click correct
    await user.click(screen.getByText("Right"));
    expect(onCorrect).toHaveBeenCalledTimes(1);
  });

  it("calls onCorrect exactly once", async () => {
    const onCorrect = vi.fn();
    const user = userEvent.setup();
    render(
      <MultipleChoice
        question="Q"
        options={[{ id: "a", label: "Right", correct: true, explanation: "Yes" }]}
        onCorrect={onCorrect}
      />,
    );

    await user.click(screen.getByText("Right"));
    await user.click(screen.getByText("Right")); // Locked, no-op
    expect(onCorrect).toHaveBeenCalledTimes(1);
  });
});
