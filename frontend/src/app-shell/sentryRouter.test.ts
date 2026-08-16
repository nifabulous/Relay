import { describe, expect, it } from "vitest";
import { withSentryReactRouterV7Routing } from "@sentry/react";
import { Routes } from "react-router-dom";
import { App } from "./App";

describe("application router instrumentation", () => {
  it("loads and calls the pinned Sentry React Router 7 wrapper", () => {
    expect(App).toBeTypeOf("function");
    expect(withSentryReactRouterV7Routing).toBeTypeOf("function");
    expect(withSentryReactRouterV7Routing(Routes)).toBeTypeOf("function");
  });
});
