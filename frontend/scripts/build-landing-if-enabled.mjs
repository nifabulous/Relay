/**
 * Vercel build hook. With RELAY_LANDING_ENABLED off this reads the flag and
 * exits 0, doing nothing else, so the /app deploy is exactly today's. With it
 * on, the landing build runs and any failure fails the deploy.
 *
 * The true spellings match app/config.py _env_flag: 1, true, yes, on (any case,
 * surrounding whitespace ignored). Everything else is off.
 */
import { fileURLToPath } from "node:url";

export const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);

export function landingEnabled(env = process.env) {
  const raw = env.RELAY_LANDING_ENABLED;
  return raw !== undefined && TRUE_VALUES.has(raw.trim().toLowerCase());
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (!landingEnabled()) {
    console.log("RELAY_LANDING_ENABLED is off: skipping the landing build.");
  } else {
    const { buildLanding } = await import("./build-landing.mjs");
    try {
      buildLanding();
    } catch (error) {
      console.error(`landing build failed: ${error.message}`);
      process.exit(1);
    }
  }
}
