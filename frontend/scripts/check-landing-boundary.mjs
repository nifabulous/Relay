/**
 * Landing import boundary.
 *
 * - src/landing/client/** ships to the browser. It may import only other
 *   client files, the generated globe point set as a URL, and the Geist
 *   @fontsource stylesheets. Nothing from the app, so no app code or runtime
 *   reaches the landing bundle.
 * - src/landing/render/** runs at build time. It may import other render
 *   files, react, react-dom/server, zod, and the pure data modules listed in
 *   RENDER_DATA_MODULES, which may themselves import only each other (type
 *   imports aside).
 * - Neither side may use dynamic import(), import.meta.glob or require().
 *
 * Usage: node scripts/check-landing-boundary.mjs [frontendRoot]
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const RENDER_DATA_MODULES = [
  "src/features/learn/curriculum.ts",
  "src/features/learn/practice/questionBank.ts",
  "src/features/learn/practice/selectDaily.ts",
  "src/features/learn/cases/caseCatalog.ts",
  "src/features/learn/cases/caseTypes.ts",
];
const RENDER_PACKAGES = new Set(["react", "react-dom/server", "zod"]);
const CLIENT_GENERATED = "src/landing/generated/globe-points.json?url";
const CLIENT_PACKAGE = /^@fontsource\/geist(-mono)?\/latin-\d00\.css$/;

const IMPORT = /^\s*(?:import|export)\s+(type\s+)?(?:[^"';]*?\sfrom\s+)?["']([^"']+)["']/gm;
// Forms that load code outside a static import, each reported under its own label.
const DYNAMIC_FORMS = [
  [/\bimport\s*\(/, "dynamic import()"],
  [/\bimport\.meta\.glob\b/, "import.meta.glob"],
  [/\brequire\s*\(/, "require()"],
];

function walk(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return walk(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

function resolveRelative(root, file, specifier) {
  const [path, query] = specifier.split("?");
  const base = resolve(dirname(file), path);
  const found = [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts")].find((p) => existsSync(p) && statSync(p).isFile());
  const rel = relative(root, found ?? base).split("\\").join("/");
  return query ? `${rel}?${query}` : rel;
}

function imports(file) {
  const source = readFileSync(file, "utf8");
  return { dynamic: DYNAMIC_FORMS.filter(([pattern]) => pattern.test(source)).map(([, label]) => label), list: [...source.matchAll(IMPORT)].map((m) => ({ typeOnly: Boolean(m[1]), specifier: m[2] })) };
}

export function checkBoundary(root) {
  const violations = [];
  const relFile = (file) => relative(root, file).split("\\").join("/");

  for (const file of walk(join(root, "src/landing/client"))) {
    const { dynamic, list } = imports(file);
    for (const form of dynamic) violations.push(`${relFile(file)}: ${form}`);
    for (const { specifier } of list) {
      if (CLIENT_PACKAGE.test(specifier)) continue;
      if (!specifier.startsWith(".")) {
        violations.push(`${relFile(file)}: imports package "${specifier}"`);
        continue;
      }
      const target = resolveRelative(root, file, specifier);
      if (target === CLIENT_GENERATED) continue;
      if (!target.startsWith("src/landing/client/")) violations.push(`${relFile(file)}: imports ${target}`);
    }
  }

  for (const file of walk(join(root, "src/landing/render"))) {
    const { dynamic, list } = imports(file);
    for (const form of dynamic) violations.push(`${relFile(file)}: ${form}`);
    for (const { specifier } of list) {
      if (!specifier.startsWith(".")) {
        if (!RENDER_PACKAGES.has(specifier)) violations.push(`${relFile(file)}: imports package "${specifier}"`);
        continue;
      }
      const target = resolveRelative(root, file, specifier);
      if (target.startsWith("src/landing/render/") || RENDER_DATA_MODULES.includes(target)) continue;
      violations.push(`${relFile(file)}: imports ${target}`);
    }
  }

  for (const module of RENDER_DATA_MODULES) {
    const file = join(root, module);
    if (!existsSync(file)) {
      violations.push(`${module}: listed in RENDER_DATA_MODULES but missing`);
      continue;
    }
    const { dynamic, list } = imports(file);
    for (const form of dynamic) violations.push(`${module}: ${form}`);
    for (const { typeOnly, specifier } of list) {
      if (typeOnly) continue;
      const target = specifier.startsWith(".") ? resolveRelative(root, file, specifier) : specifier;
      if (!RENDER_DATA_MODULES.includes(target)) violations.push(`${module}: imports ${target}, which the build-time renderer cannot vouch for`);
    }
  }
  return violations;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = resolve(process.argv[2] ?? process.cwd());
  const violations = checkBoundary(root);
  if (violations.length > 0) {
    console.error("Landing boundary violation:");
    for (const violation of violations) console.error(`  ${violation}`);
    process.exit(1);
  }
  console.log("Landing boundary: PASS");
}
