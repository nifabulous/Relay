import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { checkBoundary, RENDER_DATA_MODULES } from "./check-landing-boundary.mjs";

const FRONTEND = resolve(__dirname, "..");

/** A throwaway frontend tree with the allowlisted data modules present. */
function tree(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "landing-boundary-"));
  for (const module of RENDER_DATA_MODULES) files[module] ??= "export const ok = 1;\n";
  for (const [path, source] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), source);
  }
  return root;
}

describe("check-landing-boundary", () => {
  it("passes on the real tree", () => {
    expect(checkBoundary(FRONTEND)).toEqual([]);
  });

  it("rejects a client import of app code", () => {
    const root = tree({
      "src/landing/client/main.ts": 'import { loadPreferences } from "../../lib/persistence/storage";\n',
      "src/lib/persistence/storage.ts": "export const loadPreferences = () => 1;\n",
    });
    expect(checkBoundary(root)).toEqual(["src/landing/client/main.ts: imports src/lib/persistence/storage.ts"]);
  });

  it("rejects a client glob import and a CommonJS require", () => {
    const root = tree({
      "src/landing/client/a.ts": 'const modules = import.meta.glob("../render/*.ts");\nconst fs = require("node:fs");\n',
    });
    expect(checkBoundary(root)).toEqual([
      "src/landing/client/a.ts: import.meta.glob",
      "src/landing/client/a.ts: require()",
    ]);
  });

  it("rejects a client package import and a dynamic import", () => {
    const root = tree({ "src/landing/client/a.ts": 'import * as Sentry from "@sentry/react";\nvoid import("./b");\n' });
    expect(checkBoundary(root)).toEqual([
      "src/landing/client/a.ts: dynamic import()",
      'src/landing/client/a.ts: imports package "@sentry/react"',
    ]);
  });

  it("rejects a render import outside the data allowlist", () => {
    const root = tree({
      "src/landing/render/x.tsx": 'import { LAB_REGISTRY } from "../../features/learn/labRegistry";\n',
      "src/features/learn/labRegistry.tsx": "export const LAB_REGISTRY = {};\n",
    });
    expect(checkBoundary(root)).toEqual(["src/landing/render/x.tsx: imports src/features/learn/labRegistry.tsx"]);
  });

  it("rejects an allowlisted data module that starts importing app code", () => {
    const root = tree({
      "src/features/learn/curriculum.ts": 'import "./Lab.css";\nexport const CURRICULUM = [];\n',
      "src/features/learn/Lab.css": "",
    });
    expect(checkBoundary(root)).toEqual([
      "src/features/learn/curriculum.ts: imports src/features/learn/Lab.css, which the build-time renderer cannot vouch for",
    ]);
  });
});
