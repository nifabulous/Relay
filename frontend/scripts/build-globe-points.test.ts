import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { buildGlobePoints, TOPOLOGY_PATH } from "./build-globe-points.mjs";

const POINTS_BUDGET_GZIP_BYTES = 20 * 1024;

describe("globe point set", () => {
  const topology = JSON.parse(readFileSync(TOPOLOGY_PATH, "utf8"));
  const points: number[] = buildGlobePoints(topology);
  const json = JSON.stringify(points);

  it("is a flat list of [lat, lon] pairs at one decimal place", () => {
    expect(points.length % 2).toBe(0);
    for (let i = 0; i < points.length; i += 2) {
      const [lat, lon] = [points[i], points[i + 1]];
      expect(lat).toBeGreaterThanOrEqual(-90);
      expect(lat).toBeLessThanOrEqual(90);
      expect(lon).toBeGreaterThanOrEqual(-180);
      expect(lon).toBeLessThanOrEqual(180);
      expect(Math.round(lat * 10) / 10).toBe(lat);
      expect(Math.round(lon * 10) / 10).toBe(lon);
    }
  });

  it("covers land, not the oceans or Antarctica", () => {
    const pairs = points.length / 2;
    expect(pairs).toBeGreaterThan(5000);
    expect(pairs).toBeLessThan(7000);
    for (let i = 0; i < points.length; i += 2) expect(points[i]).toBeGreaterThan(-60);
  });

  it("is deterministic", () => {
    const again = JSON.stringify(buildGlobePoints(topology));
    const hash = (s: string) => createHash("sha256").update(s).digest("hex");
    expect(hash(again)).toBe(hash(json));
  });

  it("fits the 20KB gzip budget", () => {
    expect(gzipSync(json).length).toBeLessThanOrEqual(POINTS_BUDGET_GZIP_BYTES);
  });
});
