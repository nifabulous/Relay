/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/app/",
  plugins: [react()],
  build: {
    outDir: "../app/static/relay",
    emptyOutDir: true,
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
    // jsdom workers contend for CPU under the full-suite parallel run; they
    // pass comfortably in isolation. Give them headroom so the suite is not
    // flaky. See fix/frontend-test-flake.
    testTimeout: 15000,
    hookTimeout: 15000,
    exclude: ["node_modules", "dist", "e2e", "playwright-report", "test-results"],
  },
});
