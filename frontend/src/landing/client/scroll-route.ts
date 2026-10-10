/**
 * Section 01. Above 980px the payment runs along the stage's grid lines as the
 * section scrolls; below it, a vertical stepper fills. Each node and tag
 * activates as progress passes its data-at fraction. Without motion the page
 * shows the end state (landing.css) and nothing here runs.
 */
import { motionAllowed } from "./motion";
import { scrollProgress } from "./progress";

export function initScrollRoute(doc: Document = document, win: Window = window): void {
  if (!motionAllowed(doc.documentElement)) return;
  const stage = doc.getElementById("route-stage");
  const path = doc.getElementById("route-path") as SVGPathElement | null;
  const packet = doc.getElementById("route-packet");
  const steps = doc.getElementById("route-steps");
  const list = steps?.querySelector("ol");
  if (!stage || !path || !packet || !steps || !list) return;
  const length = path.getTotalLength();
  const marks = Array.from(stage.querySelectorAll<HTMLElement | SVGElement>("[data-at]"));
  const items = Array.from(list.querySelectorAll<HTMLElement>("li[data-at]"));

  const update = () => {
    if (stage.offsetParent) {
      const p = scrollProgress(stage.getBoundingClientRect(), win.innerHeight, 0.8, 1.05);
      // pathLength="1", so the dash offset runs from 1 (hidden) to 0 (drawn).
      path.style.strokeDashoffset = String(1 - p);
      const point = path.getPointAtLength(length * p);
      packet.setAttribute("transform", `translate(${point.x} ${point.y})`);
      for (const mark of marks) mark.classList.toggle("on", p >= Number(mark.dataset.at) - 0.001);
    }
    if (steps.offsetParent) {
      const p = scrollProgress(steps.getBoundingClientRect(), win.innerHeight, 0.75, 1);
      list.style.setProperty("--p", String(p));
      for (const item of items) item.classList.toggle("on", p >= Number(item.dataset.at));
    }
  };
  win.addEventListener("scroll", update, { passive: true });
  win.addEventListener("resize", update);
  update();
}
