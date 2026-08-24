import type { RefObject } from "react";

const INTERACTIVE_SELECTOR =
  "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])";

export function preserveDialogOutsideFocus(
  popupRef: RefObject<HTMLElement | null>,
  popupId?: string,
) {
  let outsideTarget: HTMLElement | null = null;
  const isTrigger = (target: Element) =>
    Boolean(popupId) && target.getAttribute("aria-controls") === popupId;

  const handlePointerDownCapture = (event: PointerEvent) => {
    const { target } = event;
    if (!(target instanceof Element)) return;
    outsideTarget =
      popupRef.current?.contains(target) || isTrigger(target)
        ? null
        : target.closest<HTMLElement>(INTERACTIVE_SELECTOR);
  };

  const handleFocusInCapture = (event: FocusEvent) => {
    const focused = event.target;
    if (!outsideTarget || !(focused instanceof Element)) return;
    if (!popupRef.current?.contains(focused)) return;
    const restoreTarget = outsideTarget;
    window.setTimeout(() => {
      if (
        document.activeElement === focused &&
        restoreTarget.isConnected
      ) {
        restoreTarget.focus();
      }
    }, 0);
  };

  document.addEventListener("pointerdown", handlePointerDownCapture, true);
  document.addEventListener("focusin", handleFocusInCapture, true);
  return () => {
    outsideTarget = null;
    document.removeEventListener("pointerdown", handlePointerDownCapture, true);
    document.removeEventListener("focusin", handleFocusInCapture, true);
  };
}
