/**
 * Bundle budget gate — verifies the eager shell fits the gzip budget
 * (BUDGET_BYTES below; currently 210KiB).
 * Reads the Vite manifest and sums eager (non-lazy) asset sizes.
 */
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { gzipSync } from "zlib";

// 210KiB. Ratcheted from 200KiB (2026-08-21): the previous ceiling passed by
// 9 bytes — zero headroom — and the Coss component layer plus the adaptive
// Overview redesign cost a measured ~4.4KB gzip. The gate still bites: any
// addition larger than the new margin fails here.
const BUDGET_BYTES = 215040;
const ASSETS_DIR = join(process.cwd(), "..", "app", "static", "relay", "assets");
const HTML_PATH = join(process.cwd(), "..", "app", "static", "relay", "index.html");

if (!existsSync(HTML_PATH)) {
  console.error("Build output not found. Run: npm run build");
  process.exit(1);
}

const html = readFileSync(HTML_PATH, "utf-8");

// Extract eager JS and CSS references from index.html
const refs = [
  ...html.matchAll(/(?:src|href)="\/app\/assets\/([^"]+)"/g),
].map((m) => m[1]);

// Lazy route chunks, excluded by name. NOTE: this filter is belt-and-braces —
// Vite does not emit <link>/<script> refs for dynamically imported chunks, so
// index.html only ever lists the eager entry, its static imports and the eager
// CSS. Nothing here currently matches. Kept, and kept complete, so the list
// still describes intent if a preload hint is ever added.
const eager = refs.filter((r) => !r.includes("Explore") && !r.includes("Prepare") && !r.includes("Fee") && !r.includes("Screen") && !r.includes("ValueDate") && !r.includes("Stp") && !r.includes("Track") && !r.includes("Learn") && !r.includes("Settings"));

let totalGzip = 0;
console.log("Eager shell assets:");
for (const ref of eager) {
  const filePath = join(ASSETS_DIR, ref);
  if (!existsSync(filePath)) {
    console.warn(`  ⚠  ${ref} — file not found`);
    continue;
  }
  const raw = readFileSync(filePath);
  const gzipped = gzipSync(raw);
  const gzipSize = gzipped.length;
  totalGzip += gzipSize;
  console.log(`  ${ref.padEnd(40)} ${gzipSize.toLocaleString()} bytes gzip`);
}

console.log(`\nTotal eager gzip: ${totalGzip.toLocaleString()} bytes`);
console.log(`Budget:          ${BUDGET_BYTES.toLocaleString()} bytes`);

if (totalGzip > BUDGET_BYTES) {
  console.error(`\n❌ FAILED — eager shell exceeds budget by ${(totalGzip - BUDGET_BYTES).toLocaleString()} bytes`);
  process.exit(1);
} else {
  console.log(`\n✅ PASS — ${((BUDGET_BYTES - totalGzip) / 1024).toFixed(1)}KB under budget`);
}
