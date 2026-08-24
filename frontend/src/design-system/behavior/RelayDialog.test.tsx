import { useRef, useState, type ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RelayDialog } from "./RelayDialog";

const TITLE_ID = "relay-dialog-title";

function TestHarness({ onOpenChange }: { onOpenChange?: (open: boolean) => void }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    onOpenChange?.(nextOpen);
  };

  const trigger: ReactElement = (
    <button ref={triggerRef} type="button">
      Open surface
    </button>
  );
  const closeControl: ReactElement = (
    <button type="button">Close surface</button>
  );

  return (
    <>
      <button type="button">Page control</button>
      <RelayDialog
        open={open}
        onOpenChange={handleOpenChange}
        trigger={trigger}
        closeControl={closeControl}
        finalFocus={triggerRef}
        popupId="relay-dialog-popup"
        titleId={TITLE_ID}
      >
        <h2 id={TITLE_ID}>Example surface</h2>
        <button type="button">Inside control</button>
      </RelayDialog>
    </>
  );
}

function LoadingHarness() {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const trigger: ReactElement = (
    <button ref={triggerRef} type="button">
      Open tutor
    </button>
  );
  const closeControl: ReactElement = (
    <button type="button">Close tutor</button>
  );

  return (
    <RelayDialog
      open={open}
      onOpenChange={setOpen}
      trigger={trigger}
      closeControl={closeControl}
      finalFocus={triggerRef}
      titleId="lazy-tutor-title"
      ariaLabel="Tutor"
    >
      <p role="status">Opening the tutor…</p>
    </RelayDialog>
  );
}

describe("RelayDialog", () => {
  it("opens and closes through controlled state and its explicit close control", async () => {
    const user = userEvent.setup();
    render(<TestHarness />);

    await user.click(screen.getByRole("button", { name: /open surface/i }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /close surface/i }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("closes on Escape and restores focus to the supplied final target", async () => {
    const user = userEvent.setup();
    render(<TestHarness />);

    const trigger = screen.getByRole("button", { name: /open surface/i });
    await user.click(trigger);
    await screen.findByRole("dialog");
    await user.keyboard("{Escape}");

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(trigger).toHaveFocus();
    });
  });

  it("keeps the popup open and the page operable during outside interaction", async () => {
    const user = userEvent.setup();
    render(<TestHarness />);

    await user.click(screen.getByRole("button", { name: /open surface/i }));
    const dialog = await screen.findByRole("dialog");
    await user.click(screen.getByRole("button", { name: /page control/i }));

    expect(screen.getByRole("button", { name: /page control/i })).toHaveFocus();
    expect(dialog).toBeInTheDocument();
  });

  it("labels the popup from the existing title and focuses the popup fallback", async () => {
    const user = userEvent.setup();
    render(<TestHarness />);

    await user.click(screen.getByRole("button", { name: /open surface/i }));
    const dialog = await screen.findByRole("dialog", { name: /example surface/i });

    expect(dialog).toHaveAttribute("id", "relay-dialog-popup");
    await waitFor(() => expect(dialog).toHaveFocus());
  });

  it("reports each controlled transition once", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<TestHarness onOpenChange={onOpenChange} />);

    await user.click(screen.getByRole("button", { name: /open surface/i }));
    expect(onOpenChange).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenLastCalledWith(true);

    await user.keyboard("{Escape}");
    expect(onOpenChange).toHaveBeenCalledTimes(2);
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
  });

  it("keeps the popup named while its lazy title is still loading", async () => {
    const user = userEvent.setup();
    render(<LoadingHarness />);

    await user.click(screen.getByRole("button", { name: /open tutor/i }));
    expect(await screen.findByRole("dialog")).toHaveAccessibleName("Tutor");
  });
});
