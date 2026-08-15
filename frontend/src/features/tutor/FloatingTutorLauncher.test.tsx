import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FloatingTutorLauncher } from "./FloatingTutorLauncher";
import { clearTutorContext, publishTutorContext } from "./tutorSurfaceStore";
import { buildLessonContext } from "./tutorContext";

/**
 * The pill is the tutor's only entry point, so "is it reachable from here?"
 * has exactly one answer everywhere: yes.
 *
 * That is the whole reason it exists. The three in-page launchers it replaced
 * put the tutor on a lesson page, a scheme tab, and a tracking *result* — so
 * every page a learner opens first had nothing, and two of the three were
 * gated behind state the learner had to create before the tutor appeared.
 */

beforeEach(() => {
  clearTutorContext();
});

describe("FloatingTutorLauncher", () => {
  it("is present with no page context at all", () => {
    render(<FloatingTutorLauncher />);
    expect(screen.getByRole("button", { name: /tutor/i })).toBeVisible();
  });

  it("renders only the pill until it is opened", () => {
    // The panel is lazy-loaded, so mounting this in the shell costs every route
    // one button rather than the tutor UI.
    render(<FloatingTutorLauncher />);
    expect(screen.queryByRole("log")).not.toBeInTheDocument();
  });

  it("opens the panel on click", async () => {
    render(<FloatingTutorLauncher />);
    await userEvent.setup().click(screen.getByRole("button", { name: /tutor/i }));
    expect(await screen.findByRole("log")).toBeInTheDocument();
  });

  it("reports its open state to assistive technology", async () => {
    render(<FloatingTutorLauncher />);
    const pill = screen.getByRole("button", { name: /tutor/i });
    expect(pill).toHaveAttribute("aria-expanded", "false");
    await userEvent.setup().click(pill);
    await waitFor(() => expect(pill).toHaveAttribute("aria-expanded", "true"));
  });

  it("moves focus to the panel heading when it opens", async () => {
    render(<FloatingTutorLauncher />);
    await userEvent.setup().click(screen.getByRole("button", { name: /tutor/i }));
    const heading = await screen.findByRole("heading", { name: /tutor/i });
    await waitFor(() => expect(heading).toHaveFocus());
  });

  it("restores focus to the pill when it closes", async () => {
    const user = userEvent.setup();
    render(<FloatingTutorLauncher />);
    await user.click(screen.getByRole("button", { name: /^tutor$/i }));
    await screen.findByRole("log");
    await user.click(screen.getByRole("button", { name: /close tutor/i }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /^tutor$/i })).toHaveFocus(),
    );
  });

  it("closes on Escape", async () => {
    const user = userEvent.setup();
    render(<FloatingTutorLauncher />);
    await user.click(screen.getByRole("button", { name: /^tutor$/i }));
    await screen.findByRole("log");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("log")).not.toBeInTheDocument());
  });

  it("toggles shut when the pill is pressed again", async () => {
    const user = userEvent.setup();
    render(<FloatingTutorLauncher />);
    const pill = screen.getByRole("button", { name: /^tutor$/i });
    await user.click(pill);
    await screen.findByRole("log");
    await user.click(pill);
    await waitFor(() => expect(screen.queryByRole("log")).not.toBeInTheDocument());
  });

  it("uses the global surface when no page has published context", async () => {
    render(<FloatingTutorLauncher />);
    await userEvent.setup().click(screen.getByRole("button", { name: /tutor/i }));
    // The global empty state names the domain rather than a specific module.
    expect(await screen.findByText(/cross-border payments/i)).toBeVisible();
  });

  it("picks up the context the current page published", async () => {
    publishTutorContext(
      buildLessonContext({ moduleId: "lab-1", moduleTitle: "Identifiers: BICs & IBANs" }),
    );
    render(<FloatingTutorLauncher />);
    await userEvent.setup().click(screen.getByRole("button", { name: /tutor/i }));
    expect(await screen.findByText(/identifiers: bics & ibans/i)).toBeVisible();
  });

  it("leaves the rest of the page operable while open", async () => {
    // Non-modal on purpose: a learner reads the page and asks about it at the
    // same time. A focus trap would make that impossible.
    const user = userEvent.setup();
    render(
      <div>
        <button type="button">Page control</button>
        <FloatingTutorLauncher />
      </div>,
    );
    await user.click(screen.getByRole("button", { name: /^tutor$/i }));
    await screen.findByRole("log");

    const pageControl = screen.getByRole("button", { name: /page control/i });
    pageControl.focus();
    expect(pageControl).toHaveFocus();
    expect(screen.getByRole("log")).toBeInTheDocument();
  });
});
