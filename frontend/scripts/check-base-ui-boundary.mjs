/**
 * Relay-owned behavior wrappers are the only allowed import boundary for Base UI.
 * Feature code should depend on those wrappers, not on the library directly.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const roots = ["src/features", "src/app-shell"];
const violations = [];

function visit(path) {
  const entry = statSync(path);
  if (entry.isDirectory()) {
    for (const child of readdirSync(path)) visit(join(path, child));
    return;
  }

  if (!/\.(?:ts|tsx)$/.test(path)) return;
  const source = readFileSync(path, "utf8");
  if (source.includes("@base-ui/react")) violations.push(relative(process.cwd(), path));
}

for (const root of roots) visit(root);

if (violations.length > 0) {
  console.error("Base UI boundary violation: feature code must import Relay-owned wrappers.");
  for (const violation of violations) console.error(`  ${violation}`);
  process.exit(1);
}

console.log("Base UI boundary: PASS");
