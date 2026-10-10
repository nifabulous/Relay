/**
 * The example IBAN lights group by group, then its checks, once, when it
 * scrolls into view; then a Replay button appears. Without motion the page
 * already shows the final state (landing.css), so nothing runs.
 */
import { motionAllowed } from "./motion";

export const IBAN_STEP_MS = 420;

export function initIbanDemo(doc: Document = document): void {
  const groups = doc.getElementById("iban-demo");
  const checks = doc.getElementById("iban-checks");
  const replay = doc.getElementById("iban-replay");
  if (!groups || !checks || !replay || !motionAllowed(doc.documentElement)) return;
  const spans = Array.from(groups.children);
  const rows = Array.from(checks.children);
  const total = spans.length + rows.length;
  let step = 0;
  let timer: ReturnType<typeof setInterval> | undefined;

  const paint = () => {
    spans.forEach((span, index) => span.classList.toggle("on", step > index));
    rows.forEach((row, index) => row.classList.toggle("on", step > spans.length + index));
  };
  const play = () => {
    clearInterval(timer);
    replay.hidden = true;
    step = 0;
    paint();
    timer = setInterval(() => {
      step += 1;
      paint();
      if (step >= total) {
        clearInterval(timer);
        replay.hidden = false;
      }
    }, IBAN_STEP_MS);
  };

  replay.addEventListener("click", play);
  paint();
  if (typeof IntersectionObserver === "undefined") {
    play();
    return;
  }
  const observer = new IntersectionObserver((entries) => {
    if (entries.some((entry) => entry.isIntersecting)) {
      observer.disconnect();
      play();
    }
  });
  observer.observe(groups);
}
