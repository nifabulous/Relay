/**
 * Landing artifact gate: budgets, no source maps, no references to the /app
 * bundle or to secrets. Run after `vite build --config vite.landing.config.ts`.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const DIST = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "app", "landing_dist");
export const BUDGETS = {
  javascript: 25 * 1024,
  globePoints: 20 * 1024,
  fonts: 75 * 1024,
};

export function checkLandingBuild(dist = DIST) {
  const failures = [];
  const html = join(dist, "landing.html");
  const assets = join(dist, "assets");
  if (!existsSync(html) || !existsSync(assets)) return [`landing build not found in ${dist}`];
  const files = readdirSync(assets);
  const gzip = (name) => gzipSync(readFileSync(join(assets, name))).length;
  const sum = (names) => names.reduce((total, name) => total + gzip(name), 0);

  const js = sum(files.filter((f) => f.endsWith(".js")));
  const points = sum(files.filter((f) => /^globe-points-.+\.json$/.test(f)));
  const fonts = files.filter((f) => f.endsWith(".woff2")).reduce((t, f) => t + readFileSync(join(assets, f)).length, 0);
  if (js > BUDGETS.javascript) failures.push(`JavaScript ${js} B gzip exceeds ${BUDGETS.javascript}`);
  if (points === 0) failures.push("globe point set missing");
  if (points > BUDGETS.globePoints) failures.push(`globe points ${points} B gzip exceed ${BUDGETS.globePoints}`);
  if (fonts > BUDGETS.fonts) failures.push(`woff2 fonts ${fonts} B exceed ${BUDGETS.fonts}`);
  if (files.some((f) => f.endsWith(".map"))) failures.push("source maps present");

  const page = readFileSync(html, "utf8");
  if (page.includes("<!--landing-")) failures.push("an unreplaced <!--landing-...--> marker remains");
  if (/\/app\/assets\/|\/static\//.test(page)) failures.push("landing.html references the /app bundle or /static");
  const texts = [["landing.html", page], ...files.filter((f) => /\.(js|css)$/.test(f)).map((f) => [f, readFileSync(join(assets, f), "utf8")])];
  for (const [name, text] of texts) {
    if (/SENTRY_AUTH_TOKEN|sntrys_/.test(text)) failures.push(`${name} mentions a Sentry token`);
  }
  console.log(`landing JS ${js} B gzip · globe points ${points} B gzip · fonts ${fonts} B woff2`);
  return failures;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const failures = checkLandingBuild();
  if (failures.length > 0) {
    for (const failure of failures) console.error(`❌ ${failure}`);
    process.exit(1);
  }
  console.log("✅ landing build checks: PASS");
}
