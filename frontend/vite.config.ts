/// <reference types="vitest" />
import { readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { sentryVitePlugin } from "@sentry/vite-plugin";

const PUBLIC_OUTPUT_DIR = "../app/static/relay";

async function listSourceMaps(directory: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return [];
    throw error;
  }

  const nestedFiles = await Promise.all(
    entries.map((entry) => {
      const entryPath = resolve(directory, entry.name);
      if (entry.isDirectory()) return listSourceMaps(entryPath);
      return entry.name.endsWith(".map") ? Promise.resolve([entryPath]) : Promise.resolve([]);
    }),
  );

  return nestedFiles.flat();
}

function assertNoPublicSourceMaps() {
  return {
    name: "relay-assert-no-public-source-maps",
    apply: "build" as const,
    async writeBundle() {
      const mapFiles = await listSourceMaps(resolve(process.cwd(), PUBLIC_OUTPUT_DIR));
      if (mapFiles.length > 0) {
        throw new Error(`Public source maps remain after the Sentry upload step: ${mapFiles.join(", ")}`);
      }
    },
  };
}

export default defineConfig(({ mode }) => {
  // Vercel supplies these as build-time secrets. Loading all prefixes here
  // keeps SENTRY_AUTH_TOKEN out of the browser bundle while allowing the
  // plugin to upload source maps during the build.
  const env = loadEnv(mode, process.cwd(), "");
  const canUploadSourceMaps = Boolean(
    env.SENTRY_AUTH_TOKEN?.trim() && env.SENTRY_ORG?.trim() && env.SENTRY_PROJECT?.trim(),
  );

  return {
    base: "/app/",
    plugins: [
      react(),
      ...(canUploadSourceMaps
        ? sentryVitePlugin({
            org: env.SENTRY_ORG,
            project: env.SENTRY_PROJECT,
            authToken: env.SENTRY_AUTH_TOKEN,
            telemetry: false,
            // A source-map upload failure must fail the deployment rather
            // than publish a build that cannot be debugged safely.
            errorHandler: (error) => {
              throw error;
            },
            sourcemaps: {
              filesToDeleteAfterUpload: [`${PUBLIC_OUTPUT_DIR}/**/*.map`],
            },
          })
        : []),
      assertNoPublicSourceMaps(),
    ],
    build: {
      outDir: PUBLIC_OUTPUT_DIR,
      emptyOutDir: true,
      // Maps are uploaded privately, then removed from the public output.
      sourcemap: canUploadSourceMaps ? "hidden" : false,
    },
    server: {
      proxy: {
        "/api": "http://127.0.0.1:8000",
      },
    },
    test: {
      globals: true,
      environment: "jsdom",
      setupFiles: ["src/test/setup.ts"],
      restoreMocks: true,
      // Keep the full suite below the host's eight logical cores. Running one
      // jsdom worker per core starves lazy imports and userEvent timers enough
      // to make otherwise-fast tests miss their async deadlines.
      maxWorkers: 4,
      // Async UI tests (waitFor/userEvent) can exceed the 5s default when many
      // jsdom workers contend for CPU under the full-suite parallel run;
      // they pass comfortably in isolation. Give them headroom so the suite
      // is not flaky. See fix/frontend-test-flake.
      testTimeout: 15000,
      hookTimeout: 15000,
      exclude: ["node_modules", "dist", "e2e", "playwright-report", "test-results"],
    },
  };
});
