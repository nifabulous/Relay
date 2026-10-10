/**
 * Stat values count up once, on first view, over 1.1s with an ease-out. The
 * real value stays in the accessibility tree; only an aria-hidden overlay
 * animates, and the final text is restored when the count ends.
 */
import { motionAllowed } from "./motion";

const DURATION_MS = 1100;

export function countUp(
  element: HTMLElement,
  raf: (callback: FrameRequestCallback) => number = (callback) => requestAnimationFrame(callback),
  clock: () => number = () => performance.now(),
): void {
  const text = element.textContent ?? "";
  const decimals = (text.split(".")[1] ?? "").length;
  const target = Number(text.replace(/,/g, ""));
  if (!Number.isFinite(target) || target === 0) return;

  const doc = element.ownerDocument;
  const accessible = doc.createElement("span");
  accessible.className = "sr";
  accessible.textContent = text;
  const overlay = doc.createElement("span");
  overlay.setAttribute("aria-hidden", "true");
  element.replaceChildren(accessible, overlay);

  const start = clock();
  const tick = () => {
    const k = Math.min(1, (clock() - start) / DURATION_MS);
    const value = target * (1 - Math.pow(1 - k, 3));
    overlay.textContent = value.toLocaleString("en-GB", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
    if (k < 1) raf(tick);
    else element.textContent = text;
  };
  tick();
}

export function initCounters(doc: Document = document): void {
  if (!motionAllowed(doc.documentElement) || typeof IntersectionObserver === "undefined") return;
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        observer.unobserve(entry.target);
        countUp(entry.target as HTMLElement);
      }
    },
    { threshold: 0.6 },
  );
  doc.querySelectorAll<HTMLElement>("[data-count]").forEach((element) => observer.observe(element));
}
