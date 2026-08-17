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
type TutorAvailabilityState = "checking" | "available" | "unavailable" | "probe-error";

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
   * DT2. Four states: checking, available, unavailable, and probe-error.
   * Rendering the pill in every state makes an absent control impossible to
   * misread, while keeping it disabled until the probe confirms it can work.
   *
   * The probe hits GET /api/tutor/availability, which is deliberately outside
   * the rate limit and the daily ceiling. Asking on the metered POST would have
   * spent a learner's quota, and the deployment's budget, on ordinary browsing.
   */
  const [availability, setAvailability] = useState<TutorAvailabilityState>("checking");

  useEffect(() => {
    let cancelled = false;
    apiRequest("/api/tutor/availability", undefined, TutorAvailabilitySchema)
      .then((body) => {
        if (!cancelled) {
          setAvailability(body.available === true ? "available" : "unavailable");
        }
      })
      .catch(() => {
        if (!cancelled) setAvailability("probe-error");
      });
    return () => {
      cancelled = true;
    };
  }, []);
  const canOpen = availability === "available";
  const unavailableMessage =
    availability === "probe-error"
      ? "Tutor availability could not be confirmed. Refresh to try again."
      : "The tutor is not available in this deployment. Everything else in Relay works as usual.";
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

  useEffect(() => {
    if (canOpen || !open) return;
    close();
  }, [canOpen, close, open]);

  return (
    <>
      <div className="tutor-fab-cluster">
        <button
          type="button"
          ref={launcherRef}
          className="tutor-fab"
          disabled={!canOpen}
          aria-describedby={
            !canOpen && availability !== "checking" ? "tutor-fab-unavailable" : undefined
          }
          aria-expanded={open}
          aria-controls={open ? "tutor-floating-panel" : undefined}
          onClick={() => {
            if (open) {
              close();
              return;
            }
            if (canOpen) {
              setOpen(true);
              onOpenChange?.(true);
            }
          }}
        >
          <TutorIcon />
          <span className="tutor-fab__label">Tutor</span>
        </button>
        {availability !== "available" && availability !== "checking" && (
          <span id="tutor-fab-unavailable" className="tutor-fab__reason" role="status">
            {unavailableMessage}
          </span>
        )}
      </div>

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
