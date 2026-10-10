/**
 * Build the landing page: facts export, globe points, the separate Vite build,
 * then the artifact checks. Any failure exits non-zero, so a deploy with the
 * flag on fails closed.
 *
 * The /app build output (app/static/relay) is hashed before and after; the
 * landing build must leave it byte-identical.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const FRONTEND = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPO = resolve(FRONTEND, "..");
const APP_OUTPUT = join(REPO, "app", "static", "relay");

export function hashTree(dir) {
  if (!existsSync(dir)) return "absent";
  const hash = createHash("sha256");
  const walk = (current) => {
    for (const name of readdirSync(current).sort()) {
      const path = join(current, name);
      if (statSync(path).isDirectory()) walk(path);
      else hash.update(relative(dir, path)).update("\0").update(readFileSync(path)).update("\0");
    }
  };
  walk(dir);
  return hash.digest("hex");
}

/** A Python that can import the app: RELAY_PYTHON, the repo's .venv, then python3/python. */
export function findPython() {
  const commonRoot = (() => {
    try {
      const common = execFileSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd: REPO, encoding: "utf8" }).trim();
      return dirname(common);
    } catch {
      return REPO;
    }
  })();
  const candidates = [
    process.env.RELAY_PYTHON,
    join(REPO, ".venv", "bin", "python"),
    join(commonRoot, ".venv", "bin", "python"),
    "python3",
    "python",
  ].filter(Boolean);
  for (const candidate of candidates) {
    const probe = spawnSync(candidate, ["-c", "import sqlalchemy, schwifty"], { cwd: REPO, stdio: "ignore" });
    if (probe.status === 0) return candidate;
  }
  throw new Error("No Python with the app's dependencies found. Set RELAY_PYTHON or create .venv.");
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, stdio: "inherit" });
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}`);
}

export function buildLanding() {
  const before = hashTree(APP_OUTPUT);
  run(findPython(), ["scripts/export_landing_facts.py"], REPO);
  run(process.execPath, ["scripts/build-globe-points.mjs"], FRONTEND);
  run(process.execPath, [join(FRONTEND, "node_modules", "vite", "bin", "vite.js"), "build", "--config", "vite.landing.config.ts"], FRONTEND);
  run(process.execPath, ["scripts/check-landing-build.mjs"], FRONTEND);
  const after = hashTree(APP_OUTPUT);
  if (before !== after) throw new Error("The landing build changed app/static/relay; it must not touch the /app output.");
  console.log("landing build: PASS (/app output unchanged)");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    buildLanding();
  } catch (error) {
    console.error(`landing build failed: ${error.message}`);
    process.exit(1);
  }
}
