/**
 * Hero globe: a dot-matrix Earth drawn from the Atlas's map topology, turned
 * by pointer drag in any direction, touring corridors one after another.
 *
 * - Touch: the stage is touch-action: pan-y, so vertical swipes scroll the
 *   page; horizontal swipes rotate longitude only.
 * - Pause tour / Play tour (WCAG 2.2.2): paused stays paused for the page view.
 *   Focusing a legend button also pauses it.
 * - Without motion: no drift and no tour; every corridor is drawn, drag still
 *   works, and frames are drawn only while something changes.
 * - Colours come from CSS custom properties and are re-read on relay:theme.
 * - No 2D context: the stage collapses and the legend remains the corridor list.
 */
import {
  angleDiff,
  arc,
  camera,
  clampLat,
  easeInOutCubic,
  project,
  RAD,
  surface,
  tourPosition,
  TOUR,
  TOUR_STEP,
  trailAlpha,
  type Camera,
  type SpherePoint,
} from "./globe-math";
import { motionAllowed } from "./motion";

interface CorridorData {
  code: string;
  from: [number, number];
  to: [number, number];
  fromLabel: string;
  toLabel: string;
}

interface Palette {
  dot: string;
  dotMin: number;
  dotMax: number;
  graticule: string;
  limb: string;
  plate: string;
  plateLine: string;
  ink: string;
  packet: string;
  node: string;
  series: string[];
}

const DEPTH_BUCKETS = 7;
const RESUME_AFTER_IDLE_S = 3.5;
const INERTIA = 0.93;
const LABEL_MERGE_PX = 150;
const MAX_DPR = 2;
const LABEL_FONT = '500 11px "Geist Mono", ui-monospace, monospace';

function readPalette(root: HTMLElement): Palette {
  const css = getComputedStyle(root);
  const value = (name: string) => css.getPropertyValue(name).trim();
  return {
    dot: value("--gDot"),
    dotMin: Number.parseFloat(value("--gDotMin")),
    dotMax: Number.parseFloat(value("--gDotMax")),
    graticule: value("--gGrat"),
    limb: value("--gLimb"),
    plate: value("--gPlate"),
    plateLine: value("--gPlateLine"),
    ink: value("--gInk"),
    packet: value("--gPacket"),
    node: value("--gNode"),
    series: [1, 2, 3, 4, 5, 6, 7, 8].map((i) => value(`--c${i}`)),
  };
}

function graticule(): SpherePoint[][] {
  const lines: SpherePoint[][] = [];
  for (let lon = -180; lon < 180; lon += 30) {
    const line: SpherePoint[] = [];
    for (let lat = -84; lat <= 84; lat += 3) line.push(surface(lat, lon));
    lines.push(line);
  }
  for (let lat = -60; lat <= 60; lat += 30) {
    const line: SpherePoint[] = [];
    for (let lon = -180; lon <= 180; lon += 3) line.push(surface(lat, lon));
    lines.push(line);
  }
  return lines;
}

export function initGlobe(pointsUrl: string, doc: Document = document, win: Window = window): void {
  const stage = doc.getElementById("globe-stage");
  const canvas = doc.getElementById("globe") as HTMLCanvasElement | null;
  const dataNode = doc.getElementById("globe-data");
  if (!stage || !canvas || !dataNode) return;
  const context = canvas.getContext("2d");
  if (!context) {
    stage.classList.add("off");
    return;
  }
  const ctx: CanvasRenderingContext2D = context;
  const wrap = canvas.parentElement as HTMLElement;
  const root = doc.documentElement;
  const motion = motionAllowed(root);
  const corridors = JSON.parse(dataNode.textContent ?? "[]") as CorridorData[];
  const arcs = corridors.map((corridor) => ({ ...corridor, ...arc(corridor.from, corridor.to, 72) }));
  const lines = graticule();
  const legend = Array.from(doc.querySelectorAll<HTMLButtonElement>("[data-corridor]"));
  const tourToggle = doc.getElementById("tour-toggle") as HTMLButtonElement | null;
  if (arcs.length === 0) return;

  let palette = readPalette(root);
  let sinLat = new Float32Array(0);
  let cosLat = new Float32Array(0);
  let lons = new Float32Array(0);

  let size = 0;
  let radius = 0;
  let centre = 0;
  const resize = () => {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(win.devicePixelRatio || 1, MAX_DPR);
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    size = rect.width;
    radius = size * 0.47;
    centre = size / 2;
    kick();
  };

  let viewLon = 10;
  let viewLat = 18;
  let cam: Camera = camera(viewLon, viewLat);
  let tourClock = 0;
  let last = performance.now();
  let idle = 99;
  let dragging = false;
  let vx = 0;
  let vy = 0;
  let lastX = 0;
  let lastY = 0;
  let paused = false;
  let running = true;
  let looping = false;
  let shown = -1;

  const stroke = (points: SpherePoint[], to: number, surfaceOnly: boolean) => {
    let pen = false;
    ctx.beginPath();
    for (let i = 0; i <= to && i < points.length; i++) {
      const p = project(points[i], cam, radius, centre, centre);
      const visible = surfaceOnly ? p[2] > 0 : p[2] > 0 || p[3] > 1;
      if (visible) {
        if (pen) ctx.lineTo(p[0], p[1]);
        else ctx.moveTo(p[0], p[1]);
        pen = true;
      } else pen = false;
    }
    ctx.stroke();
  };

  const roundRect = (x: number, y: number, w: number, h: number, r: number) => {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  };

  const marker = (at: [number, number], colour: string, label: string, code: string, alpha: number) => {
    const p = project(surface(at[0], at[1]), cam, radius, centre, centre);
    if (p[2] <= 0.08) return;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = palette.node;
    ctx.strokeStyle = colour;
    ctx.lineWidth = 1.6;
    ctx.fillRect(p[0] - 4, p[1] - 4, 8, 8);
    ctx.strokeRect(p[0] - 4, p[1] - 4, 8, 8);
    if (label) {
      ctx.font = LABEL_FONT;
      const textWidth = ctx.measureText(label).width;
      const codeWidth = code ? ctx.measureText(code).width + 22 : 0;
      let x = p[0] + 10;
      const y = p[1] - 9;
      if (x + textWidth + codeWidth + 16 > size) x = p[0] - 10 - textWidth - codeWidth - 12;
      ctx.fillStyle = palette.plate;
      ctx.strokeStyle = palette.plateLine;
      ctx.lineWidth = 1;
      roundRect(x - 4, y - 11, textWidth + codeWidth + 12, 18, 5);
      ctx.fill();
      ctx.stroke();
      // Identity rides on the swatch; text stays ink, never the series colour.
      if (code) {
        ctx.fillStyle = colour;
        ctx.fillRect(x + 1, y - 6, 8, 8);
        ctx.fillStyle = palette.ink;
        ctx.fillText(code, x + 13, y + 2);
      }
      ctx.fillStyle = palette.ink;
      ctx.fillText(label, x + codeWidth + 2, y + 2);
    }
    ctx.globalAlpha = 1;
  };

  const frame = (now: number) => {
    const dt = Math.min(0.05, Math.max(0, now - last) / 1000);
    last = now;
    const touring = motion && !paused && !dragging && idle > RESUME_AFTER_IDLE_S;
    if (!dragging) {
      idle += dt;
      vx *= INERTIA;
      vy *= INERTIA;
      viewLon += vx;
      viewLat = clampLat(viewLat + vy);
    }
    if (touring) tourClock += dt;
    const { index: active, phase, cycle } = tourPosition(tourClock, arcs.length);
    const current = arcs[active];
    if (touring && phase < TOUR.move) {
      const e = easeInOutCubic(phase / TOUR.move) * 0.12;
      viewLon += angleDiff(viewLon, current.mid[1]) * e;
      viewLat += (Math.max(-40, Math.min(55, current.mid[0])) - viewLat) * e;
    }
    if (motion && !touring && !dragging && !paused && idle > 0.2) viewLon += dt * 3;
    cam = camera(viewLon, viewLat);

    ctx.clearRect(0, 0, size, size);
    ctx.strokeStyle = palette.limb;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(centre, centre, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = palette.graticule;
    for (const line of lines) stroke(line, line.length, true);

    const buckets = Array.from({ length: DEPTH_BUCKETS }, () => new Path2D());
    for (let i = 0; i < lons.length; i++) {
      const l = (lons[i] - cam.lon) * RAD;
      const cosL = Math.cos(l);
      const z = cam.sinLat * sinLat[i] + cam.cosLat * cosLat[i] * cosL;
      if (z <= 0) continue;
      const x = cosLat[i] * Math.sin(l);
      const y = cam.cosLat * sinLat[i] - cam.sinLat * cosLat[i] * cosL;
      const r = 0.65 + 0.8 * z;
      buckets[Math.min(DEPTH_BUCKETS - 1, (z * DEPTH_BUCKETS) | 0)].rect(centre + radius * x - r, centre - radius * y - r, r * 2, r * 2);
    }
    buckets.forEach((path, b) => {
      ctx.fillStyle = `rgba(${palette.dot},${palette.dotMin + (palette.dotMax - palette.dotMin) * (b / (DEPTH_BUCKETS - 1))})`;
      ctx.fill(path);
    });

    arcs.forEach((a, j) => {
      const age = motion ? (active - j + arcs.length) % arcs.length : 0;
      const done = !motion || cycle >= arcs.length || j < active || (j === active && phase >= TOUR.move + TOUR.draw);
      let upto = a.points.length - 1;
      if (motion && j === active) {
        upto = phase < TOUR.move ? -1 : Math.floor(Math.min(1, (phase - TOUR.move) / TOUR.draw) * (a.points.length - 1));
      } else if (!done) return;
      const alpha = j === active ? 1 : trailAlpha(age);
      const colour = palette.series[j % palette.series.length];
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = colour;
      ctx.lineWidth = j === active ? 2.6 : 1.6;
      stroke(a.points, upto, false);
      ctx.globalAlpha = 1;
      if (j === active && upto >= 0) {
        const head = project(a.points[upto], cam, radius, centre, centre);
        if (head[2] > 0 || head[3] > 1) {
          ctx.fillStyle = colour;
          ctx.globalAlpha = 0.18;
          ctx.beginPath();
          ctx.arc(head[0], head[1], 10, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
          ctx.fillStyle = palette.packet;
          ctx.fillRect(head[0] - 4, head[1] - 4, 8, 8);
        }
      }
      const labelled = j === active && upto >= 0;
      let fromLabel = a.fromLabel;
      let toLabel = a.toLabel;
      if (labelled) {
        const pf = project(surface(a.from[0], a.from[1]), cam, radius, centre, centre);
        const pt = project(surface(a.to[0], a.to[1]), cam, radius, centre, centre);
        if (Math.hypot(pf[0] - pt[0], pf[1] - pt[1]) < LABEL_MERGE_PX) {
          toLabel = `${a.fromLabel} → ${a.toLabel}`;
          fromLabel = "";
        }
      }
      marker(a.from, colour, labelled ? fromLabel : "", "", alpha);
      marker(a.to, colour, labelled ? toLabel : "", labelled ? a.code : "", alpha);
    });

    if (active !== shown) {
      shown = active;
      legend.forEach((cell, i) => cell.classList.toggle("on", i === active));
    }
    const settling = Math.abs(vx) + Math.abs(vy) > 0.01;
    if (running && (motion || dragging || settling)) win.requestAnimationFrame(frame);
    else looping = false;
  };

  function kick() {
    if (looping) return;
    looping = true;
    last = performance.now();
    win.requestAnimationFrame(frame);
  }

  const setPaused = (value: boolean) => {
    paused = value;
    if (!tourToggle) return;
    tourToggle.textContent = paused ? "Play tour" : "Pause tour";
    tourToggle.setAttribute("aria-pressed", String(paused));
  };
  if (tourToggle && motion) {
    tourToggle.hidden = false;
    tourToggle.addEventListener("click", () => {
      setPaused(!paused);
      if (!paused) idle = 99;
      kick();
    });
  }

  const goTo = (index: number) => {
    const cycleBase = Math.floor(tourClock / (arcs.length * TOUR_STEP));
    const still = paused || !motion;
    tourClock = cycleBase * arcs.length * TOUR_STEP + index * TOUR_STEP + (still ? TOUR.move + TOUR.draw : 0);
    idle = 99;
    dragging = false;
    vx = 0;
    vy = 0;
    if (still) {
      viewLon = arcs[index].mid[1];
      viewLat = Math.max(-40, Math.min(55, arcs[index].mid[0]));
    }
    kick();
  };
  legend.forEach((cell, index) => {
    cell.addEventListener("focus", () => {
      if (motion && !paused) setPaused(true);
    });
    cell.addEventListener("click", () => goTo(index));
  });

  wrap.addEventListener("pointerdown", (event) => {
    dragging = true;
    idle = 0;
    lastX = event.clientX;
    lastY = event.clientY;
    vx = 0;
    vy = 0;
    if (event.pointerType !== "touch") wrap.setPointerCapture(event.pointerId);
    kick();
  });
  wrap.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    const dx = event.clientX - lastX;
    const dy = event.clientY - lastY;
    lastX = event.clientX;
    lastY = event.clientY;
    const k = 160 / radius;
    vx = -dx * k;
    // Touch rotates longitude only; vertical swipes belong to the page.
    vy = event.pointerType === "touch" ? 0 : dy * k;
    viewLon += vx;
    viewLat = clampLat(viewLat + vy);
    kick();
  });
  const release = () => {
    dragging = false;
    if (!motion) {
      vx = 0;
      vy = 0;
    }
  };
  wrap.addEventListener("pointerup", release);
  wrap.addEventListener("pointercancel", release);
  // The browser cancels the pointer when a pan-y swipe scrolls the page.
  wrap.addEventListener("lostpointercapture", release);

  const repaint = () => {
    palette = readPalette(root);
    kick();
  };
  doc.addEventListener("relay:theme", repaint);
  win.matchMedia?.("(prefers-color-scheme: dark)").addEventListener("change", repaint);

  if (typeof ResizeObserver !== "undefined") new ResizeObserver(resize).observe(canvas);
  else win.addEventListener("resize", resize);
  if (typeof IntersectionObserver !== "undefined") {
    new IntersectionObserver((entries) => {
      running = entries.some((entry) => entry.isIntersecting);
      if (running) kick();
    }).observe(wrap);
  }

  resize();
  // Land points are a separate fetched asset; without them the globe still
  // shows its graticule and arcs.
  fetch(pointsUrl)
    .then((response) => (response.ok ? (response.json() as Promise<number[]>) : []))
    .then((points) => {
      const count = Math.floor(points.length / 2);
      sinLat = new Float32Array(count);
      cosLat = new Float32Array(count);
      lons = new Float32Array(count);
      for (let i = 0; i < count; i++) {
        const lat = points[2 * i] * RAD;
        sinLat[i] = Math.sin(lat);
        cosLat[i] = Math.cos(lat);
        lons[i] = points[2 * i + 1];
      }
      kick();
    })
    .catch(() => undefined);
}
