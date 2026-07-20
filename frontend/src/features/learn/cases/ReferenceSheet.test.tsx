import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef, useState } from "react";
import { ReferenceSheet } from "./ReferenceSheet";
import type { CaseFact } from "./caseTypes";

// ─── Fixtures ────────────────────────────────────────────────────────────────
// Synthetic fact carrying a full SourceClaim (mirrors the shape in caseCatalog
// but with obviously-test values). The ReferenceSheet is purely presentational
// over `fact.claim`, so a hand-built fact exercises every field.

function factFixture(overrides: Partial<CaseFact> = {}): CaseFact {
  return {
    id: "price-sensitivity",
    label: "Fee sensitivity",
    value: "Customer is fee-conscious.",
    state: "gathered",
    requestable: true,
    claim: {
      source: "Relay operations bulletin (simulation)",
      owner: "Relay Learn",
      verifiedAt: "2026-02-01",
      reviewBy: "2026-08-01",
      jurisdiction: "CA→US",
      currency: "USD",
      scope: "operator-guidance",
    },
    ...overrides,
  };
}

function renderSheet(open: boolean, fact: CaseFact = factFixture()) {
  const returnFocusRef = createRef<HTMLButtonElement>();
  const onClose = vi.fn();
  const utils = render(
    <div>
      {/* The opener button whose focus should be restored on close. */}
      <button type="button" ref={returnFocusRef}>
        Open reference
      </button>
      {/* A draft-state element OUTSIDE the sheet — closing the sheet must not
          disturb it. */}
      <textarea data-testid="draft-notes" defaultValue="my draft notes" />
      <ReferenceSheet fact={fact} open={open} onClose={onClose} returnFocusRef={returnFocusRef} />
    </div>,
  );
  return { ...utils, onClose, returnFocusRef, opener: screen.getByRole("button", { name: "Open reference" }) };
}

describe("ReferenceSheet", () => {
  it("does not render the dialog when closed", () => {
    renderSheet(false);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders as a dialog when open", () => {
    renderSheet(true);
    expect(screen.getByRole("dialog")).toBeVisible();
  });

  it("labels the dialog with the fact label + Reference in a heading", () => {
    renderSheet(true, factFixture({ label: "Fee sensitivity" }));
    const heading = screen.getByRole("heading", { name: /Fee sensitivity reference/i });
    expect(heading).toBeVisible();
    // The dialog itself should be labelled by that heading (aria-labelledby).
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-labelledby", heading.id);
    expect(dialog).toHaveAttribute("aria-modal", "true");
  });

  it("shows the full source claim: source, owner, verifiedAt, reviewBy, jurisdiction, currency, scope", () => {
    renderSheet(true);
    const dialog = screen.getByRole("dialog");
    const text = dialog.textContent ?? "";
    expect(text).toContain("Relay operations bulletin (simulation)");
    expect(text).toContain("Relay Learn");
    expect(text).toContain("2026-02-01");
    expect(text).toContain("2026-08-01");
    expect(text).toContain("CA→US");
    expect(text).toContain("USD");
    // scope is rendered as a human label, not the raw enum — assert at least
    // the scope is represented.
    expect(text).toMatch(/operator guidance|operator-guidance/i);
  });

  it("shows the fact value inside the sheet", () => {
    renderSheet(true, factFixture({ value: "Customer is fee-conscious; willing to pay more." }));
    expect(screen.getByText(/Customer is fee-conscious/)).toBeVisible();
  });

  it("closes on Escape and calls onClose", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const returnFocusRef = createRef<HTMLButtonElement>();

    function Harness() {
      const [open, setOpen] = useState(true);
      return (
        <ReferenceSheet
          fact={factFixture()}
          open={open}
          onClose={() => {
            setOpen(false);
            onClose();
          }}
          returnFocusRef={returnFocusRef}
        />
      );
    }
    render(<Harness />);
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
    // The dialog unmounts because the harness toggled open=false.
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("restores focus to the opener button after closing", async () => {
    const user = userEvent.setup();
    const returnFocusRef = createRef<HTMLButtonElement>();
    const onClose = vi.fn();

    function Harness() {
      const [open, setOpen] = useState(true);
      return (
        <div>
          <button type="button" ref={returnFocusRef}>
            Open reference
          </button>
          <ReferenceSheet
            fact={factFixture()}
            open={open}
            onClose={() => {
              setOpen(false);
              onClose();
            }}
            returnFocusRef={returnFocusRef}
          />
        </div>
      );
    }
    render(<Harness />);
    const opener = screen.getByRole("button", { name: "Open reference" });
    // Close via Escape — the harness toggles open=false, triggering the
    // focus-restore effect.
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
    expect(opener).toHaveFocus();
  });

  it("focuses the close button (or first focusable) when opened", async () => {
    renderSheet(true);
    // The dialog should contain a close button that is focusable; the sheet
    // should move focus into the dialog on open.
    const closeBtn = screen.getByRole("button", { name: /close/i });
    expect(closeBtn).toBeInTheDocument();
    // jsdom does not scroll/auto-focus perfectly, but a programmatically
    // focused element inside the dialog should be the close button.
    expect(closeBtn).toHaveFocus();
  });

  it("preserves the external draft when the sheet is closed (pure overlay)", async () => {
    const user = userEvent.setup();
    const returnFocusRef = createRef<HTMLButtonElement>();
    const onClose = vi.fn();

    function Harness() {
      const [open, setOpen] = useState(true);
      return (
        <div>
          <button type="button" ref={returnFocusRef}>
            Open reference
          </button>
          <textarea data-testid="draft-notes" defaultValue="my draft notes" />
          <ReferenceSheet
            fact={factFixture()}
            open={open}
            onClose={() => {
              setOpen(false);
              onClose();
            }}
            returnFocusRef={returnFocusRef}
          />
        </div>
      );
    }
    render(<Harness />);
    // Edit the draft while the sheet is open.
    const draft = screen.getByTestId("draft-notes") as HTMLTextAreaElement;
    await user.clear(draft);
    await user.type(draft, "revised reasoning");
    expect(draft).toHaveValue("revised reasoning");
    // Close the sheet via Escape — the harness toggles open=false.
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
    // Draft value survives the close.
    expect(screen.getByTestId("draft-notes")).toHaveValue("revised reasoning");
  });

  it("keeps Tab focus cycling within the dialog (focus trap)", async () => {
    const user = userEvent.setup();
    renderSheet(true);
    const dialog = screen.getByRole("dialog");
    // All focusable elements should live inside the dialog.
    const focusable = dialog.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    expect(focusable.length).toBeGreaterThan(0);
    // Tab from the last focusable element should wrap back inside the dialog,
    // never escaping to the opener or the external draft.
    const last = focusable[focusable.length - 1];
    last.focus();
    expect(last).toHaveFocus();
    await user.tab();
    // After Tab, focus must still be inside the dialog.
    const active = document.activeElement as HTMLElement | null;
    expect(active).not.toBeNull();
    expect(dialog).toContainElement(active);
  });
});
