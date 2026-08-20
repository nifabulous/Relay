import { useRef, type ReactElement, type ReactNode, type RefObject } from "react";
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
