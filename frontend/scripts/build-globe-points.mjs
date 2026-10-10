/**
 * Build the landing globe's land points from the Atlas map topology.
 *
 * Samples an even Fibonacci point set over the sphere and keeps the points that
 * fall on land (Antarctica excluded), as a flat [lat, lon, lat, lon, ...] array
 * at one decimal place (0.1° is about 11km). The output is a fetched asset, so
 * the landing JavaScript budget does not carry it.
 *
 * Usage: node scripts/build-globe-points.mjs [out]
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { geoBounds, geoContains } from "d3-geo";
import { feature } from "topojson-client";

const HERE = dirname(fileURLToPath(import.meta.url));
export const TOPOLOGY_PATH = resolve(HERE, "../src/features/explore/atlas/assets/countries-50m.json");
export const DEFAULT_OUT = resolve(HERE, "../src/landing/generated/globe-points.json");
export const SAMPLE_COUNT = 22000;
const ANTARCTICA = "010";
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

/**
 * Land polygons with their bounding boxes. Testing a point against every
 * polygon's box first keeps the exact spherical test to one or two polygons.
 */
function landPolygons(topology) {
  const polygons = [];
  for (const country of feature(topology, topology.objects.countries).features) {
    if (country.id === ANTARCTICA || !country.geometry) continue;
    const { type, coordinates } = country.geometry;
    const parts = type === "Polygon" ? [coordinates] : type === "MultiPolygon" ? coordinates : [];
    for (const rings of parts) {
      const polygon = { type: "Polygon", coordinates: rings };
      const [[west, south], [east, north]] = geoBounds(polygon);
      polygons.push({ polygon, west, south, east, north });
    }
  }
  return polygons;
}

function onLand(polygons, lon, lat) {
  return polygons.some(
    (p) =>
      lat >= p.south &&
      lat <= p.north &&
      // A box that crosses the antimeridian has west > east.
      (p.west <= p.east ? lon >= p.west && lon <= p.east : lon >= p.west || lon <= p.east) &&
      geoContains(p.polygon, [lon, lat]),
  );
}

export function buildGlobePoints(topology, sampleCount = SAMPLE_COUNT) {
  const polygons = landPolygons(topology);
  const points = [];
  for (let i = 0; i < sampleCount; i++) {
    const y = 1 - (2 * (i + 0.5)) / sampleCount;
    const lat = (Math.asin(y) * 180) / Math.PI;
    let lon = ((GOLDEN_ANGLE * i * 180) / Math.PI) % 360;
    if (lon > 180) lon -= 360;
    if (onLand(polygons, lon, lat)) points.push(Number(lat.toFixed(1)), Number(lon.toFixed(1)));
  }
  return points;
}

export function writeGlobePoints(out = DEFAULT_OUT) {
  const topology = JSON.parse(readFileSync(TOPOLOGY_PATH, "utf8"));
  const points = buildGlobePoints(topology);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(points));
  return points.length / 2;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = process.argv[2] ? resolve(process.argv[2]) : DEFAULT_OUT;
  console.log(`globe points: ${writeGlobePoints(out)} written to ${out}`);
}
