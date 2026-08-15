import { Suspense, lazy, useCallback, useEffect, useRef, useState } from "react";
import type { TutorContext, TutorMode } from "../../api/schemas";
import { Button } from "../../design-system/Button";
import "./TutorLauncher.css";

/**
 * The entry point to the tutor on any surface.
 *
 * **The panel is lazy-loaded.** An unopened launcher costs a route one button,
 * so lesson, tracking, and scheme pages do not carry the tutor UI in their
 * initial bundle for the majority of visits where nobody opens it.
 *
 * **Non-modal, deliberately.** No focus trap, no scroll lock, no overlay. A
 * learner reads the lesson and asks about it at the same time; trapping focus
 * would make the page behind unusable for exactly the person most likely to
 * need both. Focus still *moves* to the panel on open — otherwise a keyboard
 * user has to hunt forward through the document to reach what they just opened
 * — and returns to the launcher on close, so their place is never lost.
 *
 * `Escape` closes it. That is a convenience rather than the modal contract:
 * there is nothing behind to dismiss.
 */

const TutorPanel = lazy(() =>
  import("./TutorPanel").then((module) => ({ default: module.TutorPanel })),
);

export interface TutorLauncherProps {
  context: TutorContext;
  label: string;
  initialMode?: TutorMode;
  compact?: boolean;
}

export function TutorLauncher({
  context,
  label,
  initialMode = "chat",
  compact = false,
}: TutorLauncherProps) {
  const [open, setOpen] = useState(false);
  const [restoreFocus, setRestoreFocus] = useState(false);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const headingId = "tutor-panel-heading";

  const close = useCallback(() => {
    setOpen(false);
    // Focus cannot be restored here. While the panel is open the launcher
    // button is unmounted, so React has already set the ref to null — calling
    // `.focus()` now is a silent no-op and a keyboard user lands at the top of
    // the document instead of where they were. The flag defers it to the effect
    // below, which runs after the button is back in the tree.
    setRestoreFocus(true);
  }, []);

  useEffect(() => {
    if (open || !restoreFocus) return;
    launcherRef.current?.focus();
    setRestoreFocus(false);
  }, [open, restoreFocus]);

  useEffect(() => {
    if (!open) return undefined;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") close();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, close]);

  if (!open) {
    return (
      <Button
        ref={launcherRef}
        variant="secondary"
        onClick={() => setOpen(true)}
        className="tutor-launcher__button"
      >
        {label}
      </Button>
    );
  }

  return (
    <div className="tutor-launcher">
      <Suspense
        fallback={
          <p className="tutor-launcher__loading" role="status">
            Opening the tutor…
          </p>
        }
      >
        {/* The panel focuses its own heading on mount. The launcher cannot do
            it from here: through Suspense the heading does not exist on the
            tick `open` flips, and chasing it with requestAnimationFrame worked
            in jsdom while doing nothing at all in a hidden or backgrounded tab,
            where rAF is not serviced. */}
        <TutorPanel
          context={context}
          initialMode={initialMode}
          compact={compact}
          headingId={headingId}
          autoFocusHeading
        />
      </Suspense>
      <Button variant="secondary" onClick={close} className="tutor-launcher__close">
        Close tutor
      </Button>
    </div>
  );
}

export default TutorLauncher;
