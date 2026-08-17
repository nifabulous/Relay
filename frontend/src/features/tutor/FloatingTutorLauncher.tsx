import { Suspense, lazy, useCallback, useEffect, useRef, useState } from "react";
import { apiRequest } from "../../api/client";
import { TutorAvailabilitySchema } from "../../api/schemas";
import { useTutorSurfaceContext } from "./tutorSurfaceStore";
import "./FloatingTutorLauncher.css";

/**
 * The tutor's single entry point: a pill fixed to the bottom-right, on every route.
 *
 * It replaces the three in-page launchers rather than joining them. Those put
 * the tutor on a lesson page, a scheme tab, and a tracking result — so on every
 * page a learner naturally opens first there was nothing, and two of the three
 * were gated behind state the learner had to create before the tutor appeared
 * at all. One affordance, always in the same place, is easier to find than
 * three that move.
 *
 * Context comes from `tutorSurfaceStore`: a lesson page publishes its module, a
 * scheme tab its currency, and everything else falls back to
 * `surface: "global"`. So the pill is contextual where context exists and still
 * works where it does not.
 *
 * **Geometry.** Below 1024px a fixed bottom nav occupies the last 64px plus the
 * safe-area inset, so the pill clears both. At 1024px and up the rail is on the
 * left and the bottom-right corner is free. `z-index: 150` sits above page
 * content and below the top bar's menu, which is the one thing that must stay
 * on top of it.
 */

const TutorPanel = lazy(() =>
  import("./TutorPanel").then((module) => ({ default: module.TutorPanel })),
);

const HEADING_ID = "tutor-panel-heading";

export interface FloatingTutorLauncherProps {
  onOpenChange?: (open: boolean) => void;
}

function TutorIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3 2 8l10 5 10-5-10-5z" />
      <path d="M6 10.5V16c0 1.7 2.7 3 6 3s6-1.3 6-3v-5.5" />
    </svg>
  );
}

export function FloatingTutorLauncher({ onOpenChange }: FloatingTutorLauncherProps) {
  const context = useTutorSurfaceContext();
  const [open, setOpen] = useState(false);
  /*
   * DT2. Three states, not two: unknown while the probe is in flight, then
   * available or not. Rendering the pill only when available makes an absent
   * control the signal, and an absent control teaches nothing — a learner who
   * saw the tutor elsewhere concludes Relay is broken rather than that this
   * deployment runs without it.
   *
   * The probe hits GET /api/tutor/availability, which is deliberately outside
   * the rate limit and the daily ceiling. Asking on the metered POST would have
   * spent a learner's quota, and the deployment's budget, on ordinary browsing.
   */
  const [available, setAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiRequest("/api/tutor/availability", undefined, TutorAvailabilitySchema)
      .then((body) => {
        if (!cancelled) setAvailable(body.available === true);
      })
      // A probe that fails is not evidence the tutor is off, but it is evidence
      // we cannot promise it works. Disable rather than offer a control that
      // will fail on click.
      .catch(() => {
        if (!cancelled) setAvailable(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  const [restoreFocus, setRestoreFocus] = useState(false);
  const launcherRef = useRef<HTMLButtonElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    onOpenChange?.(false);
    // Focus cannot be restored here: the pill is still mounted, but deferring
    // to the effect below keeps this identical to the in-page launcher's
    // behaviour and survives the pill being conditionally rendered later.
    setRestoreFocus(true);
  }, [onOpenChange]);

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

  return (
    <>
      <button
        type="button"
        ref={launcherRef}
        className="tutor-fab"
        disabled={available === false}
        aria-describedby={available === false ? "tutor-fab-unavailable" : undefined}
        aria-expanded={open}
        aria-controls={open ? "tutor-floating-panel" : undefined}
        onClick={() => {
          if (open) {
            close();
            return;
          }
          setOpen(true);
          onOpenChange?.(true);
        }}
      >
        <TutorIcon />
        <span className="tutor-fab__label">Tutor</span>
      </button>
      {available === false && (
        /* Rendered in the document, not a title attribute. A tooltip needs
           hover, which touch devices do not have — so a tooltip-only
           explanation is invisible on exactly the viewport where this pill is
           most prominent. Visually hidden but reachable by screen reader and
           announced as the button's description. */
        <span id="tutor-fab-unavailable" className="tutor-fab__reason">
          The tutor is not available in this deployment. Everything else in Relay
          works as usual.
        </span>
      )}

      {open && (
        <div className="tutor-floating-panel" id="tutor-floating-panel">
          <Suspense
            fallback={
              <p className="tutor-floating-panel__loading" role="status">
                Opening the tutor…
              </p>
            }
          >
            {/* The panel focuses its own heading on mount — through Suspense it
                does not exist on the tick `open` flips, and chasing it from out
                here with requestAnimationFrame does nothing in a backgrounded
                tab, where rAF is not serviced. */}
            <TutorPanel context={context} headingId={HEADING_ID} autoFocusHeading compact />
          </Suspense>
          <button type="button" className="tutor-floating-panel__close" onClick={close}>
            Close tutor
          </button>
        </div>
      )}
    </>
  );
}

export default FloatingTutorLauncher;
