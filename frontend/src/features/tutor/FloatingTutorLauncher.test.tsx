import { describe, it, expect, beforeEach } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../../test/server";
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

// ── Review fixes: DT2, T12 ──────────────────────────────────────────────────

describe("FloatingTutorLauncher — unavailable deployment", () => {
  it("renders the pill disabled rather than vanishing", async () => {
    /*
     * DT2. An absent control teaches nothing. A learner who saw the tutor on a
     * colleague's screen, or in docs, and finds no trace of it here concludes
     * Relay is broken rather than that this deployment runs without it.
     */
    server.use(
      http.get("/api/tutor/availability", () => HttpResponse.json({ available: false })),
    );
    render(<FloatingTutorLauncher />);
    const pill = await screen.findByRole("button", { name: /tutor/i });
    expect(pill).toBeDisabled();
  });

  it("explains why on tap, not only on hover", async () => {
    // Touch devices have no hover. A tooltip-only explanation is invisible to
    // exactly the learners on the viewport where the pill is most prominent.
    server.use(
      http.get("/api/tutor/availability", () => HttpResponse.json({ available: false })),
    );
    render(<FloatingTutorLauncher />);
    const pill = await screen.findByRole("button", { name: /tutor/i });
    expect(pill).toHaveAccessibleDescription(/not available|not enabled/i);
  });

  it("asks availability once per mount, not per render", async () => {
    // The probe is unmetered but not free; one request per page is the budget.
    let calls = 0;
    server.use(
      http.get("/api/tutor/availability", () => {
        calls += 1;
        return HttpResponse.json({ available: true });
      }),
    );
    const { rerender } = render(<FloatingTutorLauncher />);
    await screen.findByRole("button", { name: /tutor/i });
    rerender(<FloatingTutorLauncher />);
    rerender(<FloatingTutorLauncher />);
    await waitFor(() => expect(calls).toBe(1));
  });

  it("keeps the pill disabled when availability is not a boolean", async () => {
    server.use(
      http.get("/api/tutor/availability", () =>
        HttpResponse.json({ available: "false" }),
      ),
    );
    render(<FloatingTutorLauncher />);
    expect(await screen.findByRole("button", { name: /tutor/i })).toBeDisabled();
  });
});
