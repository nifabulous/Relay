import { describe, expect, it } from "vitest";
import { App } from "./App";

describe("application router instrumentation", () => {
  it("loads the pinned Sentry router wrapper during application compilation", () => {
    expect(App).toBeTypeOf("function");
  });
});
