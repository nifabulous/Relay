/**
 * Whether the page may animate. The pre-paint script in landing.html decides
 * once, before first paint, from prefers-reduced-motion and the stored
 * reducedMotion preference, and records it as html.motion. Every enhancer asks
 * here instead of re-deriving it.
 */
export function motionAllowed(root: HTMLElement = document.documentElement): boolean {
  return root.classList.contains("motion");
}
