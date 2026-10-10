import { describe, expect, it } from "vitest";
import { cubeY } from "./anatomy";
import { scrollProgress } from "./progress";

describe("scroll progress", () => {
  it("runs from 0 to 1 as the element crosses the viewport, clamped", () => {
    expect(scrollProgress({ top: 900, height: 500 }, 1000, 0.8, 1)).toBe(0);
    expect(scrollProgress({ top: 550, height: 500 }, 1000, 0.8, 1)).toBeCloseTo(0.5);
    expect(scrollProgress({ top: -2000, height: 500 }, 1000, 0.8, 1)).toBe(1);
  });

  it("treats a collapsed element as finished", () => {
    expect(scrollProgress({ top: 0, height: 0 }, 1000, 0.8, 1)).toBe(1);
  });

  it("drops the anatomy cube from above the first plate to the last", () => {
    expect(cubeY(0, 130, 112, 5)).toBe(40);
    expect(cubeY(1, 130, 112, 5)).toBe(130 + 4 * 112);
  });
});
