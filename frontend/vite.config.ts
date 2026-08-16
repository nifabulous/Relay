/// <reference types="vitest" />
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { sentryVitePlugin } from "@sentry/vite-plugin";

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
        ? [
            ...sentryVitePlugin({
              org: env.SENTRY_ORG,
              project: env.SENTRY_PROJECT,
              authToken: env.SENTRY_AUTH_TOKEN,
              telemetry: false,
              sourcemaps: {
                filesToDeleteAfterUpload: ["../app/static/relay/**/*.map"],
              },
            }),
          ]
        : []),
    ],
    build: {
      outDir: "../app/static/relay",
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
