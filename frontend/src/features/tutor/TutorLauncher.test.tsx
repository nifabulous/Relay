import { describe, it, expect } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../../test/server";
import { TutorLauncher } from "./TutorLauncher";
import { buildLessonContext } from "./tutorContext";

const LESSON = buildLessonContext({
  moduleId: "lab-1",
  moduleTitle: "Identifiers: BICs & IBANs",
});

function renderLauncher(props = {}) {
  return render(<TutorLauncher context={LESSON} label="Ask the tutor" {...props} />);
}

describe("TutorLauncher", () => {
  it("renders only a button until it is opened", () => {
    // The panel is lazy-loaded, so an unopened launcher costs a route nothing
    // beyond one button.
    renderLauncher();
    expect(screen.getByRole("button", { name: /ask the tutor/i })).toBeVisible();
    expect(screen.queryByRole("log")).not.toBeInTheDocument();
  });

  it("opens the panel on click", async () => {
    renderLauncher();
    await userEvent.setup().click(screen.getByRole("button", { name: /ask the tutor/i }));
    expect(await screen.findByRole("log")).toBeInTheDocument();
  });

  it("moves focus to the panel heading when it opens", async () => {
    // Otherwise a keyboard user's focus stays on the launcher and they have to
    // hunt forward through the page to reach the thing they just opened.
    renderLauncher();
    await userEvent.setup().click(screen.getByRole("button", { name: /ask the tutor/i }));
    const heading = await screen.findByRole("heading", { name: /tutor/i });
    await waitFor(() => expect(heading).toHaveFocus());
  });

  it("restores focus to the launcher when it closes", async () => {
    const user = userEvent.setup();
    renderLauncher();
    await user.click(screen.getByRole("button", { name: /ask the tutor/i }));
    await screen.findByRole("log");
    await user.click(screen.getByRole("button", { name: /close tutor/i }));
    // Re-queried rather than captured: the launcher unmounts while the panel is
    // open, so React mounts a fresh node on close. What matters is that focus
    // lands on the launcher, not that it is the same DOM object as before.
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /ask the tutor/i })).toHaveFocus(),
    );
  });

  it("closes on Escape", async () => {
    const user = userEvent.setup();
    renderLauncher();
    await user.click(screen.getByRole("button", { name: /ask the tutor/i }));
    await screen.findByRole("log");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("log")).not.toBeInTheDocument());
  });

  it("leaves the rest of the page operable while open", async () => {
    // The drawer is non-modal on purpose: a learner reads the lesson and asks
    // about it at the same time. A focus trap would make that impossible.
    const user = userEvent.setup();
    render(
      <div>
        <button type="button">Page control</button>
        <TutorLauncher context={LESSON} label="Ask the tutor" />
      </div>,
    );
    await user.click(screen.getByRole("button", { name: /ask the tutor/i }));
    await screen.findByRole("log");

    const pageControl = screen.getByRole("button", { name: /page control/i });
    pageControl.focus();
    expect(pageControl).toHaveFocus();
    expect(screen.getByRole("log")).toBeInTheDocument();
  });

  it("passes its context through to the request", async () => {
    const sent: Array<Record<string, unknown>> = [];
    server.use(
      http.post("/api/tutor/chat", async ({ request }) => {
        sent.push((await request.json()) as Record<string, unknown>);
        return HttpResponse.json({
          answer: "An IBAN identifies an account.",
          mode: "explain",
          grounded: false,
          turn_id: "b7a66317-f6ea-4d22-adec-b0600d67c148",
          citations: [],
          needs_clarification: true,
          safety_notice: null,
        });
      }),
    );
    const user = userEvent.setup();
    renderLauncher();
    await user.click(screen.getByRole("button", { name: /ask the tutor/i }));
    await screen.findByRole("log");
    await user.click(screen.getByRole("button", { name: /^explain$/i }));

    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0].context).toMatchObject({ surface: "lesson", module_id: "lab-1" });
  });

  it("uses the label it is given so each surface reads naturally", () => {
    renderLauncher({ label: "Explain this timeline" });
    expect(screen.getByRole("button", { name: /explain this timeline/i })).toBeVisible();
  });
});
