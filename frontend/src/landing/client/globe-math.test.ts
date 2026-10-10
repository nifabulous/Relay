import { describe, expect, it } from "vitest";
import { angleDiff, arc, camera, clampLat, project, surface, tourPosition, TOUR_STEP, trailAlpha } from "./globe-math";

describe("globe geometry", () => {
  it("projects the camera centre to the middle of the disc, facing the viewer", () => {
    const [x, y, z] = project(surface(18, 10), camera(10, 18), 100, 200, 200);
    expect(x).toBeCloseTo(200);
    expect(y).toBeCloseTo(200);
    expect(z).toBeCloseTo(1);
  });

  it("puts the antipode behind the globe", () => {
    const [, , z] = project(surface(-18, -170), camera(10, 18), 100, 200, 200);
    expect(z).toBeLessThan(0);
  });

  it("draws arcs from start to end, lifted in the middle", () => {
    const { points, mid } = arc([6.45, 3.39], [51.51, -0.13], 72);
    expect(points).toHaveLength(73);
    expect(points[0][3]).toBeCloseTo(1);
    expect(points[72][3]).toBeCloseTo(1);
    expect(points[36][3]).toBeGreaterThan(1.1);
    expect(mid[0]).toBeGreaterThan(6.45);
    expect(mid[0]).toBeLessThan(51.51);
  });

  it("turns the short way round", () => {
    expect(angleDiff(170, -170)).toBe(20);
    expect(angleDiff(-170, 170)).toBe(-20);
    expect(angleDiff(10, 10)).toBe(0);
  });

  it("clamps latitude to ±75°", () => {
    expect(clampLat(90)).toBe(75);
    expect(clampLat(-80)).toBe(-75);
    expect(clampLat(12)).toBe(12);
  });

  it("steps through corridors in order and loops", () => {
    expect(tourPosition(0, 8).index).toBe(0);
    expect(tourPosition(TOUR_STEP * 3 + 0.5, 8)).toMatchObject({ index: 3, cycle: 3 });
    expect(tourPosition(TOUR_STEP * 9, 8).index).toBe(1);
  });

  it("fades trails with age to a floor", () => {
    expect(trailAlpha(0)).toBeCloseTo(0.7);
    expect(trailAlpha(20)).toBe(0.16);
  });
});
