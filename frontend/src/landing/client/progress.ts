/** Scroll progress of an element through the viewport, from 0 to 1. */
export function scrollProgress(
  rect: { top: number; height: number },
  viewportHeight: number,
  startAt: number,
  span: number,
): number {
  if (rect.height <= 0) return 1;
  const value = (viewportHeight * startAt - rect.top) / (rect.height * span);
  return Math.max(0, Math.min(1, value));
}
