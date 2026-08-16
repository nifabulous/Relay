import { access, mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

type TestPlugin = {
  name?: string;
  writeBundle?: () => void | Promise<void>;
};

type SentryPluginOptions = {
  org?: string;
  project?: string;
  authToken?: string;
  release?: { name?: string; inject?: boolean };
  sourcemaps?: { filesToDeleteAfterUpload?: string[] };
};

const originalCwd = process.cwd();
let temporaryRoot: string | undefined;

afterEach(async () => {
  process.chdir(originalCwd);
  vi.unstubAllEnvs();
  vi.resetModules();
  if (temporaryRoot) await rm(temporaryRoot, { recursive: true, force: true });
  temporaryRoot = undefined;
});

describe("Vite Sentry source-map lifecycle", () => {
  it("deletes uploaded maps before the public-map assertion runs", async () => {
    const uploadedReleases: string[] = [];
    let pluginOptions: SentryPluginOptions | undefined;
    temporaryRoot = await mkdtemp(join(tmpdir(), "relay-vite-config-"));
    const frontendRoot = join(temporaryRoot, "frontend");
    const mapPath = join(temporaryRoot, "app", "static", "relay", "assets", "index.js.map");
    await mkdir(join(frontendRoot), { recursive: true });
    await mkdir(join(mapPath, ".."), { recursive: true });
    await writeFile(mapPath, "private source map");
    process.chdir(frontendRoot);

    vi.stubEnv("SENTRY_AUTH_TOKEN", "sntrys_test");
    vi.stubEnv("SENTRY_ORG", "relay");
    vi.stubEnv("SENTRY_PROJECT", "relay-frontend");
    vi.doMock("vite", async (importOriginal) => ({
      ...(await importOriginal<typeof import("vite")>()),
      loadEnv: () => ({
        SENTRY_AUTH_TOKEN: "sntrys_test",
        SENTRY_ORG: "relay",
        SENTRY_PROJECT: "relay-frontend",
        VERCEL_GIT_COMMIT_SHA: "abc123def456",
      }),
    }));
    vi.doMock("@sentry/vite-plugin", () => ({
      sentryVitePlugin: (options: SentryPluginOptions) => {
        pluginOptions = options;
        return [{
          name: "fake-sentry-vite-plugin",
          async writeBundle() {
            uploadedReleases.push(options.release?.name ?? "auto");
            await rm(mapPath);
          },
        }];
      },
    }));

    const { default: createConfig } = await import("./vite.config");
    const config = createConfig({ command: "build", mode: "test" });
    const plugins = (config.plugins ?? []) as unknown as TestPlugin[];
    const uploadPlugin = plugins.find((plugin) => plugin.name === "fake-sentry-vite-plugin");
    const assertionPlugin = plugins.find((plugin) => plugin.name === "relay-assert-no-public-source-maps");

    expect(uploadPlugin).toBeDefined();
    expect(assertionPlugin).toBeDefined();
    const uploadIndex = plugins.indexOf(uploadPlugin!);
    const assertionIndex = plugins.indexOf(assertionPlugin!);
    expect(uploadIndex).toBeLessThan(assertionIndex);
    for (const plugin of plugins.slice(uploadIndex, assertionIndex + 1)) {
      await plugin.writeBundle?.();
    }

    expect(uploadedReleases).toEqual(["abc123def456"]);
    expect(pluginOptions).toMatchObject({
      org: "relay",
      project: "relay-frontend",
      authToken: "sntrys_test",
      release: { name: "abc123def456" },
      sourcemaps: { filesToDeleteAfterUpload: ["../app/static/relay/**/*.map"] },
    });
    expect(config.define?.["import.meta.env.VITE_SENTRY_RELEASE"]).toBe(JSON.stringify("abc123def456"));
    await expect(access(mapPath)).rejects.toThrow();

    await writeFile(mapPath, "map that must be rejected");
    await expect(assertionPlugin?.writeBundle?.()).rejects.toThrow("Public source maps remain");
  });
});
