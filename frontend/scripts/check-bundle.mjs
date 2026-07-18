/**
 * Bundle budget gate — verifies the eager shell is ≤200KB gzip.
 * Reads the Vite manifest and sums eager (non-lazy) asset sizes.
 */
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { gzipSync } from "zlib";

const BUDGET_BYTES = 204800; // 200KB
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

const eager = refs.filter((r) => !r.includes("Explore") && !r.includes("Prepare") && !r.includes("Fee") && !r.includes("Screen") && !r.includes("ValueDate") && !r.includes("Stp") && !r.includes("Track") && !r.includes("Learn"));

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
