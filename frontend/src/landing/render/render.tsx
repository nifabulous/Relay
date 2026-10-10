/**
 * Build-time entry: vite.landing.config.ts loads this through Vite's
 * runnerImport and inlines the markup into landing.html. No React runtime
 * ships to the browser.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { DEMO } from "./demo";
import { parseLandingFacts } from "./facts";
import { LandingPage } from "./LandingPage";

export function renderLanding(rawFacts: unknown): string {
  const facts = parseLandingFacts(rawFacts);
  return renderToStaticMarkup(<LandingPage facts={facts} demo={DEMO} />);
}
