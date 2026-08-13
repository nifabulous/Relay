import "@testing-library/jest-dom/vitest";
import { afterAll, afterEach, beforeAll } from "vitest";
import { server } from "./server";
import { resetAnalyticsSink } from "../lib/analytics/analytics";

// MSW lifecycle — start intercepting before tests, reset handlers between, stop after
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  server.resetHandlers();
  // The analytics sink is a module-level singleton; tear it down globally so
  // any test file that renders an instrumented component stays isolated.
  resetAnalyticsSink();
});
afterAll(() => server.close());
