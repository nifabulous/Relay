/// <reference types="node" />
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, it, expect } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => readFileSync(resolve(here, "..", rel), "utf8");

// Phase 2 Task 6: the three route screens take the landing scope on the
// screen root itself, not only on the route wrapper inside it.
const ROOTS: Array<[string, string, RegExp]> = [
  ["Prepare", "features/operate/prepare/PreparePaymentPage.tsx", /<div className="surface-landing prepare-payment">/],
  ["Tracking", "features/operate/tracking/TrackingPage.tsx", /<div className="surface-landing tracking-page">/],
  ["Atlas", "features/explore/AtlasPage.tsx", /<div className="surface-landing explore atlas" data-view=/],
];

describe("landing scope on screen roots", () => {
  it.each(ROOTS)("%s root carries surface-landing", (_name, file, pattern) => {
    expect(read(file)).toMatch(pattern);
  });
});
