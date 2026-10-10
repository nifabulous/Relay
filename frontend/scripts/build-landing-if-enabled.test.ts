import { describe, expect, it } from "vitest";
import { landingEnabled } from "./build-landing-if-enabled.mjs";

describe("build-landing-if-enabled", () => {
  it("uses the same fail-closed spellings as app/config.py _env_flag", () => {
    for (const on of ["1", "true", "TRUE", " yes ", "on"]) expect(landingEnabled({ RELAY_LANDING_ENABLED: on })).toBe(true);
    for (const off of ["", "0", "false", "off", "no", "ture", "enabled"]) expect(landingEnabled({ RELAY_LANDING_ENABLED: off })).toBe(false);
    expect(landingEnabled({})).toBe(false);
  });
});
