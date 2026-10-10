/**
 * The landing page build. A separate Vite run from vite.config.ts on purpose:
 * one build with two HTML entries makes Vite emit a shared preload chunk that
 * both pages load, which would change the /app output. This config never
 * touches app/static, and the /app config is not edited.
 *
 * Sections are React components rendered to static markup here, at build time,
 * through runnerImport. No React runtime ships to the landing page.
 */
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig, runnerImport, type Plugin } from "vite";

const ROOT = fileURLToPath(new URL(".", import.meta.url));
export const LANDING_OUT_DIR = fileURLToPath(new URL("../app/landing_dist", import.meta.url));
export const LANDING_FACTS_PATH = fileURLToPath(new URL("./src/landing/generated/facts.json", import.meta.url));
const BODY_MARKER = "<!--landing-body-->";
const PRELOAD_MARKER = "<!--landing-preloads-->";
/** Heading and body weights: the two faces above the fold. */
const PRELOADED_FONTS = [/geist-latin-500-normal-[\w-]+\.woff2$/, /geist-latin-400-normal-[\w-]+\.woff2$/];

export function landingStaticRender(factsPath = LANDING_FACTS_PATH): Plugin {
  return {
    name: "relay-landing-static-render",
    transformIndexHtml: {
      order: "pre",
      async handler(html) {
        if (!html.includes(BODY_MARKER)) throw new Error(`landing.html has no ${BODY_MARKER} marker`);
        if (!existsSync(factsPath)) {
          throw new Error(`Landing facts not found at ${factsPath}. Run: npm run build:landing`);
        }
        const facts: unknown = JSON.parse(readFileSync(factsPath, "utf8"));
        const { module } = await runnerImport<{ renderLanding: (facts: unknown) => string }>(
          "/src/landing/render/render.tsx",
          { configFile: false, root: ROOT, mode: "production", logLevel: "error" },
        );
        return html.replace(BODY_MARKER, module.renderLanding(facts));
      },
    },
  };
}

export function landingFontPreloads(): Plugin {
  return {
    name: "relay-landing-font-preloads",
    transformIndexHtml: {
      order: "post",
      handler(html, ctx) {
        const files = Object.keys(ctx.bundle ?? {});
        const links = PRELOADED_FONTS.map((pattern) => files.find((file) => pattern.test(file)))
          .filter((file): file is string => Boolean(file))
          .map((file) => `<link rel="preload" as="font" type="font/woff2" href="/landing/${file}" crossorigin />`);
        return html.replace(PRELOAD_MARKER, links.join("\n    "));
      },
    },
  };
}

export default defineConfig({
  root: ROOT,
  base: "/landing/",
  publicDir: false,
  plugins: [landingStaticRender(), landingFontPreloads()],
  build: {
    outDir: LANDING_OUT_DIR,
    emptyOutDir: true,
    sourcemap: false,
    modulePreload: { polyfill: false },
    rolldownOptions: {
      input: fileURLToPath(new URL("./landing.html", import.meta.url)),
    },
  },
});
