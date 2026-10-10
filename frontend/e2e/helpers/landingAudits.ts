/**
 * In-page audits for the landing page. Each function is self-contained so
 * Playwright can serialise it into page.evaluate().
 */

/**
 * Containment: every bordered box contains its in-flow descendants (±1px),
 * no box is wider than its content allows unless it scrolls on purpose,
 * route tags stay on the stage, and the page never scrolls sideways.
 */
export function containmentAudit(): string[] {
  const issues: string[] = [];
  const sideways = document.documentElement.scrollWidth - window.innerWidth;
  if (sideways > 1) issues.push(`page scrolls sideways by ${sideways}px`);
  const selector = [
    ".grid>*", ".mods>a", ".schemes>div", ".legend>button", ".tabs button", ".panel>div", ".anat>div",
    ".ledger div", ".vroute li", ".checks div", ".rows div", ".cal span", ".head", ".btn", ".chip",
    ".stat", ".tool", ".themes button", ".vop .pair div", ".iban span", ".prov", ".res", ".menu-panel a",
  ].join(",");
  for (const box of Array.from(document.querySelectorAll<HTMLElement>(selector))) {
    if (!box.offsetParent) continue;
    const outer = box.getBoundingClientRect();
    if (outer.width === 0) continue;
    for (const child of Array.from(box.querySelectorAll<HTMLElement>("*"))) {
      const style = getComputedStyle(child);
      if (style.position === "absolute" || style.position === "fixed" || child.closest("svg,canvas,.cells,.mt")) continue;
      const inner = child.getBoundingClientRect();
      if (inner.width === 0 || inner.height === 0) continue;
      if (inner.left < outer.left - 1 || inner.right > outer.right + 1 || inner.top < outer.top - 1 || inner.bottom > outer.bottom + 1) {
        issues.push(`${box.className || box.tagName} > ${child.tagName.toLowerCase()} "${(child.textContent ?? "").trim().slice(0, 40)}" overflows its box`);
        break;
      }
    }
    if (box.scrollWidth > box.clientWidth + 1 && getComputedStyle(box).overflowX !== "auto") {
      issues.push(`${box.className || box.tagName} content is wider than its box (${box.scrollWidth} > ${box.clientWidth})`);
    }
  }
  const stage = document.getElementById("route-stage");
  if (stage?.offsetParent) {
    const bounds = stage.getBoundingClientRect();
    for (const tag of Array.from(stage.querySelectorAll<HTMLElement>(".tag"))) {
      const rect = tag.getBoundingClientRect();
      if (rect.width !== 260) issues.push(`route tag is ${rect.width}px wide, not 260px`);
      if (rect.left < bounds.left - 1 || rect.right > bounds.right + 1 || rect.bottom > bounds.bottom + 1) {
        issues.push(`route tag "${(tag.textContent ?? "").trim().slice(0, 30)}" leaves the stage`);
      }
    }
  }
  return Array.from(new Set(issues));
}

/**
 * Rendered text contrast. The text colour is composited with every ancestor's
 * opacity over the composited backgrounds, then held to WCAG 2.2 AA: 4.5:1, or
 * 3:1 for text of 24px or larger, or 18.66px and bold.
 */
export function contrastAudit(): string[] {
  type Rgba = [number, number, number, number];
  const parse = (value: string): Rgba | null => {
    const m = value.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?/);
    return m ? [Number(m[1]), Number(m[2]), Number(m[3]), m[4] === undefined ? 1 : Number(m[4])] : null;
  };
  const over = (top: Rgba, bottom: Rgba): Rgba => [0, 1, 2].map((i) => top[i] * top[3] + bottom[i] * (1 - top[3])).concat(1) as Rgba;
  const channel = (v: number) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  const luminance = (c: Rgba) => 0.2126 * channel(c[0]) + 0.7152 * channel(c[1]) + 0.0722 * channel(c[2]);
  const background = (element: Element): Rgba => {
    const layers: Rgba[] = [];
    for (let node: Element | null = element; node; node = node.parentElement) {
      const colour = parse(getComputedStyle(node).backgroundColor);
      if (colour && colour[3] > 0) {
        layers.push(colour);
        if (colour[3] >= 1) break;
      }
    }
    let base = parse(getComputedStyle(document.body).backgroundColor) ?? [255, 255, 255, 1];
    for (let i = layers.length - 1; i >= 0; i--) base = over(layers[i], base);
    return base;
  };
  const failures: string[] = [];
  for (const element of Array.from(document.querySelectorAll<HTMLElement>("body *"))) {
    if (!element.offsetParent || element.closest("svg,canvas,[aria-hidden=true]")) continue;
    const ownText = Array.from(element.childNodes).some((n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? "").trim());
    if (!ownText) continue;
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 || rect.bottom < 0 || rect.top > window.innerHeight) continue;
    const style = getComputedStyle(element);
    let opacity = 1;
    for (let node: Element | null = element; node; node = node.parentElement) opacity *= Number(getComputedStyle(node).opacity);
    let fg = parse(style.color);
    if (!fg) continue;
    const bg = background(element);
    fg = [fg[0], fg[1], fg[2], fg[3] * opacity];
    if (fg[3] < 1) fg = over(fg, bg);
    const [l1, l2] = [luminance(fg), luminance(bg)];
    const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    const size = Number.parseFloat(style.fontSize);
    const large = size >= 24 || (size >= 18.66 && Number(style.fontWeight) >= 700);
    if (ratio < (large ? 3 : 4.5)) {
      failures.push(`${ratio.toFixed(2)}:1 at ${size}px "${(element.textContent ?? "").trim().slice(0, 36)}"`);
    }
  }
  return failures;
}
