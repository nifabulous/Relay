import { describe, expect, it, vi } from "vitest";
import { appBaseRedirectTarget } from "./appBaseRedirect";

describe("appBaseRedirectTarget", () => {
  it("redirects only the bare app path", () => {
    expect(appBaseRedirectTarget("/app")).toBe("/app/");
    expect(appBaseRedirectTarget("/app/")).toBeNull();
    expect(appBaseRedirectTarget("/app/explore")).toBeNull();
  });

  it("preserves the query string without creating a trailing-slash loop", () => {
    expect(appBaseRedirectTarget("/app", "?returnTo=%2Fapp%2Fexplore&tab=usd")).toBe(
      "/app/?returnTo=%2Fapp%2Fexplore&tab=usd",
    );
    expect(appBaseRedirectTarget("/app/", "?returnTo=%2Fapp%2Fexplore")).toBeNull();
  });
});

describe("appBaseRedirectPlugin", () => {
  it("redirects the bare path and passes through the normalized path", async () => {
    const { appBaseRedirectPlugin } = await import("./appBaseRedirect");
    const use = vi.fn();
    appBaseRedirectPlugin().configureServer?.({ middlewares: { use } } as never);
    const middleware = use.mock.calls[0]?.[0] as (
      req: { url?: string },
      res: { statusCode: number; setHeader: (name: string, value: string) => void; end: () => void },
      next: () => void,
    ) => void;
    const setHeader = vi.fn();
    const end = vi.fn();
    const next = vi.fn();

    middleware({ url: "/app?returnTo=%2Fapp%2Fexplore" }, { statusCode: 200, setHeader, end }, next);

    expect(setHeader).toHaveBeenCalledWith("Location", "/app/?returnTo=%2Fapp%2Fexplore");
    expect(end).toHaveBeenCalledOnce();
    expect(next).not.toHaveBeenCalled();

    middleware({ url: "/app/" }, { statusCode: 200, setHeader, end }, next);

    expect(next).toHaveBeenCalledOnce();
  });
});
