/**
 * Section 02. A cube drops through five isometric plates as the section
 * scrolls; each plate and its ledger row activate as the cube reaches it.
 */
import { motionAllowed } from "./motion";
import { scrollProgress } from "./progress";

const CUBE_START_Y = 40;

export function cubeY(progress: number, firstPlateY: number, gap: number, plates: number): number {
  return CUBE_START_Y + progress * (firstPlateY + (plates - 1) * gap - CUBE_START_Y);
}

export function initAnatomy(doc: Document = document, win: Window = window): void {
  if (!motionAllowed(doc.documentElement)) return;
  const section = doc.getElementById("anatomy");
  const svg = doc.getElementById("anatomy-svg");
  const cube = doc.getElementById("anatomy-cube");
  if (!section || !svg || !cube) return;
  const y0 = Number(svg.dataset.y0);
  const gap = Number(svg.dataset.gap);
  const plates = Array.from(svg.querySelectorAll(".plate"));
  const rows = Array.from(doc.querySelectorAll("#ledger > div"));

  const update = () => {
    const p = scrollProgress(section.getBoundingClientRect(), win.innerHeight, 0.72, 0.8);
    const y = cubeY(p, y0, gap, plates.length);
    cube.setAttribute("transform", `translate(0 ${y})`);
    plates.forEach((plate, i) => plate.classList.toggle("on", y >= y0 + i * gap - 4));
    rows.forEach((row, i) => row.classList.toggle("on", y >= y0 + i * gap - 4));
  };
  win.addEventListener("scroll", update, { passive: true });
  update();
}
