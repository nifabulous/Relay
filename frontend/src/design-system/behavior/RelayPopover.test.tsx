import { useRef, useState, type ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RelayPopover } from "./RelayPopover";

const TITLE_ID = "relay-popover-title";

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

  return (
    <>
      <button type="button">Page control</button>
      <RelayPopover
        open={open}
        onOpenChange={handleOpenChange}
        trigger={trigger}
        finalFocus={triggerRef}
        popupId="relay-popover-popup"
        titleId={TITLE_ID}
        positionerClassName="relay-popover-positioner"
      >
        <h2 id={TITLE_ID}>Example surface</h2>
        <button type="button">Inside control</button>
      </RelayPopover>
    </>
  );
}

describe("RelayPopover", () => {
  it("opens as a controlled, labelled popup", async () => {
    const user = userEvent.setup();
    render(<TestHarness />);

    await user.click(screen.getByRole("button", { name: /open surface/i }));
    const popup = await screen.findByRole("dialog", { name: /example surface/i });

    expect(popup).toHaveAttribute("id", "relay-popover-popup");
    expect(popup.parentElement).toHaveClass("relay-popover-positioner");
  });

  it("closes on outside interaction without stealing focus from the page", async () => {
    const user = userEvent.setup();
    render(<TestHarness />);

    const trigger = screen.getByRole("button", { name: /open surface/i });
    await user.click(trigger);
    await screen.findByRole("dialog");
    const pageControl = screen.getByRole("button", { name: /page control/i });
    await user.click(pageControl);

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(pageControl).toHaveFocus();
    });
  });

  it("closes on Escape and reports each controlled transition once", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<TestHarness onOpenChange={onOpenChange} />);

    await user.click(screen.getByRole("button", { name: /open surface/i }));
    expect(onOpenChange).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenLastCalledWith(true);

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(onOpenChange).toHaveBeenCalledTimes(2);
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    expect(screen.getByRole("button", { name: /open surface/i })).toHaveFocus();
  });
});
