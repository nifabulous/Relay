import {
  useRef,
  type KeyboardEventHandler,
  type ReactElement,
  type ReactNode,
  type RefObject,
} from "react";
import { Popover } from "@base-ui/react/popover";

export type RelayPopoverSide = "top" | "right" | "bottom" | "left";
export type RelayPopoverAlign = "start" | "center" | "end";

export interface RelayPopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenChangeComplete?: (open: boolean) => void;
  trigger: ReactElement;
  children: ReactNode;
  popupId?: string;
  titleId?: string;
  ariaLabel?: string;
  popupRole?: "dialog" | "menu";
  className?: string;
  positionerClassName?: string;
  side?: RelayPopoverSide;
  align?: RelayPopoverAlign;
  sideOffset?: number;
  initialFocus?: boolean | RefObject<HTMLElement | null>;
  finalFocus?: RefObject<HTMLElement | null>;
  popupRef?: RefObject<HTMLDivElement | null>;
  onPopupKeyDown?: KeyboardEventHandler<HTMLDivElement>;
}

export function RelayPopover({
  open,
  onOpenChange,
  onOpenChangeComplete,
  trigger,
  children,
  popupId,
  titleId,
  ariaLabel,
  popupRole,
  className,
  positionerClassName,
  side,
  align,
  sideOffset,
  initialFocus,
  finalFocus,
  popupRef: externalPopupRef,
  onPopupKeyDown,
}: RelayPopoverProps) {
  const popupRef = useRef<HTMLDivElement>(null);
  const focusTarget = initialFocus !== undefined ? initialFocus : externalPopupRef ?? popupRef;

  function setPopupRef(node: HTMLDivElement | null) {
    popupRef.current = node;
    if (externalPopupRef) {
      externalPopupRef.current = node;
    }
  }

  const popupProps = {
    ...(popupId ? { id: popupId } : {}),
    ...(className ? { className } : {}),
    ...(popupRole ? { role: popupRole } : {}),
    ...(titleId ? { "aria-labelledby": titleId } : {}),
    ...(ariaLabel ? { "aria-label": ariaLabel } : {}),
  };

  return (
    <Popover.Root
      open={open}
      onOpenChange={onOpenChange}
      onOpenChangeComplete={onOpenChangeComplete}
      modal={false}
    >
      <Popover.Trigger render={trigger} />
      <Popover.Portal>
        <Popover.Positioner
          className={positionerClassName}
          side={side}
          align={align}
          sideOffset={sideOffset}
        >
          <Popover.Popup
            ref={setPopupRef}
            {...popupProps}
            initialFocus={focusTarget}
            finalFocus={finalFocus}
            onKeyDown={onPopupKeyDown}
          >
            {children}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
