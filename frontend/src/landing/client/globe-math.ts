/** Pure geometry and timing for the hero globe. No DOM; unit tested in globe-math.test.ts. */
export const RAD = Math.PI / 180;

/** [sin(lat), cos(lat), lon in degrees, radial scale]. Scale 1 is the surface. */
export type SpherePoint = [number, number, number, number];

export interface Camera {
  lon: number;
  sinLat: number;
  cosLat: number;
}

export function camera(lon: number, lat: number): Camera {
  return { lon, sinLat: Math.sin(lat * RAD), cosLat: Math.cos(lat * RAD) };
}

/**
 * Orthographic projection. Returns screen x, y, the depth z (> 0 faces the
 * viewer) and the squared distance from the centre in globe radii, which tells
 * a lifted arc point apart from one hidden behind the limb.
 */
export function project(p: SpherePoint, cam: Camera, radius: number, cx: number, cy: number): [number, number, number, number] {
  const [sinLat, cosLat, lon, k] = p;
  const l = (lon - cam.lon) * RAD;
  const cosL = Math.cos(l);
  const x = cosLat * Math.sin(l);
  const y = cam.cosLat * sinLat - cam.sinLat * cosLat * cosL;
  const z = cam.sinLat * sinLat + cam.cosLat * cosLat * cosL;
  return [cx + radius * x * k, cy - radius * y * k, z, (x * x + y * y) * k * k];
}

export function surface(lat: number, lon: number): SpherePoint {
  return [Math.sin(lat * RAD), Math.cos(lat * RAD), lon, 1];
}

function unit(lat: number, lon: number): [number, number, number] {
  return [Math.cos(lat * RAD) * Math.cos(lon * RAD), Math.cos(lat * RAD) * Math.sin(lon * RAD), Math.sin(lat * RAD)];
}

/** A great-circle arc from `from` to `to`, lifted off the surface in proportion to its length. */
export function arc(from: [number, number], to: [number, number], segments: number): { points: SpherePoint[]; mid: [number, number] } {
  const a = unit(from[0], from[1]);
  const b = unit(to[0], to[1]);
  const angle = Math.acos(Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
  const s = Math.sin(angle) || 1e-6;
  const lift = 0.12 + 0.26 * angle;
  const points: SpherePoint[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const k1 = Math.sin((1 - t) * angle) / s;
    const k2 = Math.sin(t * angle) / s;
    const v = [a[0] * k1 + b[0] * k2, a[1] * k1 + b[1] * k2, a[2] * k1 + b[2] * k2];
    const lat = Math.asin(Math.max(-1, Math.min(1, v[2]))) / RAD;
    const lon = Math.atan2(v[1], v[0]) / RAD;
    points.push([Math.sin(lat * RAD), Math.cos(lat * RAD), lon, 1 + lift * Math.sin(Math.PI * t)]);
  }
  const m = [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const norm = Math.hypot(m[0], m[1], m[2]);
  return { points, mid: [Math.asin(m[2] / norm) / RAD, Math.atan2(m[1], m[0]) / RAD] };
}

/** Signed shortest turn from longitude a to b, in degrees within [-180, 180). */
export function angleDiff(a: number, b: number): number {
  return ((((b - a + 540) % 360) + 360) % 360) - 180;
}

export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export const LAT_LIMIT = 75;
export function clampLat(lat: number): number {
  return Math.max(-LAT_LIMIT, Math.min(LAT_LIMIT, lat));
}

/** Tour timing per corridor, in seconds. */
export const TOUR = { move: 1.3, draw: 1.7, hold: 1.1 } as const;
export const TOUR_STEP = TOUR.move + TOUR.draw + TOUR.hold;

export function tourPosition(clock: number, corridors: number): { index: number; phase: number; cycle: number } {
  const step = Math.floor(clock / TOUR_STEP);
  return { index: step % corridors, phase: clock % TOUR_STEP, cycle: step };
}

/** Finished arcs fade with age, never below 0.16. */
export function trailAlpha(age: number): number {
  return Math.max(0.16, 0.7 - age * 0.09);
}
