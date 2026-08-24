import { useEffect, useRef, type ReactElement, type ReactNode, type RefObject } from "react";
import { Dialog } from "@base-ui/react/dialog";

export interface RelayDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: ReactElement;
  closeControl: ReactElement;
  titleId: string;
  popupId?: string;
  className?: string;
  ariaLabel?: string;
  finalFocus?: RefObject<HTMLElement | null>;
  children: ReactNode;
}

export function RelayDialog({
  open,
  onOpenChange,
  trigger,
  closeControl,
  titleId,
  popupId,
  className,
  ariaLabel,
  finalFocus,
  children,
}: RelayDialogProps) {
  const popupRef = useRef<HTMLDivElement>(null);

  // A non-modal dialog must leave the page operable. Base UI can move focus
  // back into the popup during an outside press, so restore the pressed page
  // control while the dialog deliberately remains open.
  useEffect(() => {
    if (!open) return;

    let cleanup: (() => void) | undefined;
    let disposed = false;
    import("./preserveDialogOutsideFocus").then(({ preserveDialogOutsideFocus }) => {
      if (!disposed) {
        cleanup = preserveDialogOutsideFocus(popupRef, popupId);
      }
    });
    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [open, popupId]);

  return (
    <Dialog.Root
      open={open}
      onOpenChange={onOpenChange}
      modal={false}
      disablePointerDismissal
    >
      <Dialog.Trigger render={trigger} />
      <Dialog.Portal>
        <Dialog.Popup
          ref={popupRef}
          id={popupId}
          className={className}
          aria-labelledby={titleId}
          aria-label={ariaLabel}
          initialFocus={popupRef}
          finalFocus={finalFocus}
        >
          {children}
          <Dialog.Close render={closeControl} />
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
