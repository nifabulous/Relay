import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
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

async function readyPill() {
  const pill = await screen.findByRole("button", { name: /tutor/i });
  await waitFor(() => expect(pill).toBeEnabled());
  return pill;
}

describe("FloatingTutorLauncher", () => {
  it("is present with no page context at all", () => {
    render(<FloatingTutorLauncher />);
    expect(screen.getByRole("button", { name: /tutor/i })).toBeVisible();
  });

  it("scopes its own root and its portaled panel to the landing tokens", async () => {
    // The panel renders through a Base UI portal on document.body, outside the
    // shell tree, so it cannot inherit the shell's scope and needs its own class.
    const { container } = render(<FloatingTutorLauncher />);
    const pill = await readyPill();
    const cluster = container.querySelector(".tutor-fab-cluster");
    expect(cluster).toHaveClass("surface-landing");
    expect(cluster).toContainElement(pill);

    await userEvent.setup().click(pill);
    await screen.findByRole("log");
    const popup = document.getElementById("tutor-floating-panel");
    expect(popup).not.toBeNull();
    expect(popup).toHaveClass("surface-landing");
    expect(container).not.toContainElement(popup);
    // The scope never leaks onto a shared ancestor.
    expect(container).not.toHaveClass("surface-landing");
    expect(document.body).not.toHaveClass("surface-landing");
  });

  it("renders only the pill until it is opened", () => {
    // The panel is lazy-loaded, so mounting this in the shell costs every route
    // one button rather than the tutor UI.
    render(<FloatingTutorLauncher />);
    expect(screen.queryByRole("log")).not.toBeInTheDocument();
  });

  it("opens the panel on click", async () => {
    render(<FloatingTutorLauncher />);
    await userEvent.setup().click(await readyPill());
    expect(await screen.findByRole("log")).toBeInTheDocument();
  });

  it("reports its open state to assistive technology", async () => {
    render(<FloatingTutorLauncher />);
    const pill = screen.getByRole("button", { name: /tutor/i });
    expect(pill).toHaveAttribute("aria-expanded", "false");
    await waitFor(() => expect(pill).toBeEnabled());
    await userEvent.setup().click(pill);
    await waitFor(() => expect(pill).toHaveAttribute("aria-expanded", "true"));
  });

  it("moves focus to the panel heading when it opens", async () => {
    render(<FloatingTutorLauncher />);
    await userEvent.setup().click(await readyPill());
    const heading = await screen.findByRole("heading", { name: /tutor/i });
    await waitFor(() => expect(heading).toHaveFocus());
  });

  it("restores focus to the pill when it closes", async () => {
    const user = userEvent.setup();
    render(<FloatingTutorLauncher />);
    await user.click(await readyPill());
    await screen.findByRole("log");
    await user.click(screen.getByRole("button", { name: /close tutor/i }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /^tutor$/i })).toHaveFocus(),
    );
  });

  it("focuses the heading again when the already-loaded panel reopens", async () => {
    const user = userEvent.setup();
    render(<FloatingTutorLauncher />);
    const pill = await readyPill();

    await user.click(pill);
    await screen.findByRole("heading", { name: /tutor/i });
    await user.click(screen.getByRole("button", { name: /close tutor/i }));
    await waitFor(() => expect(pill).toHaveFocus());

    await user.click(pill);
    const heading = await screen.findByRole("heading", { name: /tutor/i });
    await waitFor(() => expect(heading).toHaveFocus());
  });

  it("closes on Escape", async () => {
    const user = userEvent.setup();
    render(<FloatingTutorLauncher />);
    await user.click(await readyPill());
    await screen.findByRole("log");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("log")).not.toBeInTheDocument());
  });

  it("toggles shut when the pill is pressed again", async () => {
    const user = userEvent.setup();
    render(<FloatingTutorLauncher />);
    const pill = await readyPill();
    await user.click(pill);
    await screen.findByRole("log");
    await user.click(pill);
    await waitFor(() => expect(screen.queryByRole("log")).not.toBeInTheDocument());
  });

  it("uses the global surface when no page has published context", async () => {
    render(<FloatingTutorLauncher />);
    await userEvent.setup().click(await readyPill());
    // The global empty state names the domain rather than a specific module.
    expect(await screen.findByText(/cross-border payments/i)).toBeVisible();
  });

  it("picks up the context the current page published", async () => {
    publishTutorContext(
      buildLessonContext({ moduleId: "lab-1", moduleTitle: "Identifiers: BICs & IBANs" }),
    );
    render(<FloatingTutorLauncher />);
    await userEvent.setup().click(await readyPill());
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
    await user.click(await readyPill());
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
    expect(screen.getByRole("status")).toBeVisible();
  });

  it("keeps the unavailable notice compact without losing its full explanation", async () => {
    server.use(
      http.get("/api/tutor/availability", () => HttpResponse.json({ available: false })),
    );
    render(<FloatingTutorLauncher />);
    const pill = await screen.findByRole("button", { name: /tutor/i });
    const status = await screen.findByRole("status");

    expect(status).toHaveTextContent("Tutor unavailable");
    expect(screen.getByText(
      "The tutor is not available in this deployment. Everything else in Relay works as usual.",
      { selector: ".tutor-fab__reason-description" },
    )).toBeInTheDocument();
    expect(pill).toHaveAccessibleDescription(/not available in this deployment/i);
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

  it("does not open while availability is still being checked", async () => {
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(http.get("/api/tutor/availability", async () => {
      await pending;
      return HttpResponse.json({ available: true });
    }));

    render(<FloatingTutorLauncher />);
    const pill = screen.getByRole("button", { name: /tutor/i });
    expect(pill).toBeDisabled();
    await userEvent.setup().click(pill);
    expect(screen.queryByRole("log")).not.toBeInTheDocument();

    release();
    await waitFor(() => expect(pill).toBeEnabled());
  });

  it("distinguishes a failed availability probe from a disabled deployment", async () => {
    server.use(http.get("/api/tutor/availability", () => HttpResponse.error()));
    render(<FloatingTutorLauncher />);
    const pill = await screen.findByRole("button", { name: /tutor/i });

    await waitFor(() => expect(pill).toBeDisabled());
    expect(screen.getByRole("status")).toHaveTextContent(/could not be confirmed/i);
    expect(screen.getByRole("status")).not.toHaveTextContent(/not available in this deployment/i);
  });
});

// ── The unavailable notice on narrow screens ────────────────────────────────

/*
 * jsdom does no layout, so whether text is clipped cannot be asked of a
 * rendered node. The notice was clipped by three declarations in the
 * stylesheet, which is what these tests read. The real geometry (wrapped
 * height, clearance above the mobile nav) was measured in a browser at 280,
 * 320, 360 and 390px; the arithmetic below pins the numbers that measurement
 * depends on.
 */
const HERE = dirname(fileURLToPath(import.meta.url));
const LAUNCHER_CSS = readFileSync(resolve(HERE, "FloatingTutorLauncher.css"), "utf8");
const TOKENS_CSS = readFileSync(resolve(HERE, "../../design-system/tokens.css"), "utf8");
const APP_SHELL_CSS = readFileSync(resolve(HERE, "../../app-shell/AppShell.css"), "utf8");

const PROBE_FAILED_MESSAGE = "Tutor availability could not be confirmed. Refresh to try again.";

/** The declarations of the rule whose selector is exactly `selector`. */
function ruleBody(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`(?:^|[}/;])\\s*${escaped}\\s*\\{([^}]*)\\}`, "m"));
  if (!match) throw new Error(`FloatingTutorLauncher.css: no rule for ${selector}`);
  return match[1];
}

/** Resolve `Npx`, a bare number, or `var(--token)` against tokens.css. */
function resolveNumber(expression: string): number {
  const trimmed = expression.trim();
  const variable = trimmed.match(/^var\((--[\w-]+)\)$/);
  if (variable) {
    const declaration = TOKENS_CSS.match(new RegExp(`${variable[1]}:\\s*([^;]+);`));
    if (!declaration) throw new Error(`tokens.css: ${variable[1]} is not declared`);
    return resolveNumber(declaration[1]);
  }
  const value = Number.parseFloat(trimmed);
  if (Number.isNaN(value)) throw new Error(`cannot resolve "${expression}" to a number`);
  return value;
}

function declared(rule: string, property: string): string {
  const match = rule.match(new RegExp(`(?:^|[;\\s])${property}:\\s*([^;]+);`));
  if (!match) throw new Error(`no ${property} declaration in: ${rule}`);
  return match[1].trim();
}

describe("FloatingTutorLauncher — the notice shows its full text", () => {
  it("lets the visible notice wrap instead of clipping it to an ellipsis", () => {
    const rule = ruleBody(LAUNCHER_CSS, ".tutor-fab__reason");
    expect(rule).not.toMatch(/white-space:\s*nowrap/);
    expect(rule).not.toMatch(/text-overflow:\s*ellipsis/);
    // overflow:hidden existed only to make the ellipsis work; left on, it would
    // silently clip any line that cannot break.
    expect(rule).not.toMatch(/overflow:\s*hidden/);
  });

  it("keeps the 320px cap and the viewport cap that make it wrap rather than grow", () => {
    const rule = ruleBody(LAUNCHER_CSS, ".tutor-fab__reason");
    expect(declared(rule, "max-width")).toBe("min(320px, calc(100vw - (2 * var(--space-4))))");
  });

  it("keeps the screen-reader copy visually hidden, so wrapping the notice cannot show it twice", () => {
    const rule = ruleBody(LAUNCHER_CSS, ".tutor-fab__reason-description");
    expect(rule).toMatch(/clip:\s*rect\(0 0 0 0\)/);
    expect(rule).toMatch(/white-space:\s*nowrap/);
  });

  it("carries the full failed-probe message in the accessible description exactly once", async () => {
    // The visible notice IS the description here, so assistive technology is
    // not read the same sentence twice by a hidden duplicate.
    server.use(http.get("/api/tutor/availability", () => HttpResponse.error()));
    const { container } = render(<FloatingTutorLauncher />);
    const pill = await screen.findByRole("button", { name: /tutor/i });

    await waitFor(() => expect(pill).toHaveAccessibleDescription(PROBE_FAILED_MESSAGE));
    expect(pill).toHaveAccessibleName("Tutor");
    expect(screen.getByRole("status")).toHaveTextContent(PROBE_FAILED_MESSAGE);
    expect(screen.getAllByText(PROBE_FAILED_MESSAGE)).toHaveLength(1);
    expect(container.querySelector(".tutor-fab__reason-description")).toBeNull();
  });
});

describe("FloatingTutorLauncher — room under the notice on narrow screens", () => {
  it("reserves the shared fixed-layer space under page content below 1024px", () => {
    const start = APP_SHELL_CSS.indexOf("@media (max-width: 1023px)");
    expect(start).toBeGreaterThan(-1);
    const mobile = APP_SHELL_CSS.slice(start);
    expect(ruleBody(mobile, ".app-shell__main")).toMatch(
      /padding-bottom:\s*var\(--mobile-fixed-reserve\)/,
    );
    // The reserve is the mobile nav, the cluster floor, and the gap the
    // cluster sits above the nav — the same offset the cluster is placed at.
    const reserve = TOKENS_CSS.match(/--mobile-fixed-reserve:\s*calc\(([\s\S]*?)\);/)?.[1] ?? "";
    expect(reserve).toContain("var(--mobile-fixed-footer-height)");
    expect(reserve).toContain("var(--floating-cluster-min-height)");
    expect(reserve).toContain("var(--space-3)");
  });

  it("sizes the cluster floor to the pill plus a notice wrapped onto two lines", () => {
    /*
     * Wrapping grows the cluster. Measured in a browser: the one-line clipped
     * notice made it 88px tall; the wrapped notice makes it 106px, and it stays
     * two lines at every width from 280px to the 320px cap. The floor in
     * tokens.css must cover that, or the last page content scrolls to sit
     * under the notice — the exact overlap this change must not introduce.
     */
    const cluster = ruleBody(LAUNCHER_CSS, ".tutor-fab-cluster");
    const pill = ruleBody(LAUNCHER_CSS, ".tutor-fab");
    const reason = ruleBody(LAUNCHER_CSS, ".tutor-fab__reason");

    const borders = 2 * 1; // 1px border, top and bottom
    const lineHeight =
      resolveNumber(declared(reason, "font-size")) * resolveNumber(declared(reason, "line-height"));
    // `padding: <vertical> <horizontal>` — the first value is top and bottom.
    const verticalPadding = 2 * resolveNumber(declared(reason, "padding").match(/^var\([^)]+\)|^\S+/)![0]);
    const twoLineNotice = 2 * lineHeight + verticalPadding + borders;
    const clusterHeight =
      resolveNumber(declared(pill, "min-height")) + resolveNumber(declared(cluster, "gap")) + twoLineNotice;

    expect(clusterHeight).toBe(106);
    expect(resolveNumber("var(--floating-cluster-min-height)")).toBeGreaterThanOrEqual(clusterHeight);
  });
});
