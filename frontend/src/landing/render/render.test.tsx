/// <reference types="node" />
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { learnSummary } from "./content";
import { DEMO } from "./demo";
import fixture from "./facts.fixture.json";
import { parseLandingFacts } from "./facts";
import { formatAmount, formatCount, formatHours } from "./format";
import { renderLanding } from "./render";

const facts = parseLandingFacts(fixture);
const html = renderLanding(fixture);
const doc = new DOMParser().parseFromString(`<!doctype html><body>${html}</body>`, "text/html");
/** Visible text, one text node at a time, so adjacent elements never run together. */
function visibleText(root: Element): string {
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const parts: string[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.parentElement?.closest("script")) continue;
    parts.push(node.textContent ?? "");
  }
  return parts.join(" ").replace(/\s+/g, " ");
}
const text = visibleText(doc.body);

/** Paths declared in the SPA router, read from its source. */
const APP_ROUTES = [...readFileSync(resolve(__dirname, "../../app-shell/App.tsx"), "utf8").matchAll(/path="([^"]+)"/g)].map(
  (m) => `/app/${m[1]}`,
);

function routeExists(href: string): boolean {
  if (href === "/app" || href === "/" || href === "/docs" || href.startsWith("#")) return true;
  return APP_ROUTES.some((route) => new RegExp(`^${route.replace(/:[^/]+/g, "[^/]+")}$`).test(href));
}

describe("rendered landing page", () => {
  it("states every count from the facts", () => {
    const counts = [
      facts.directory.banks, facts.directory.countries, facts.ssi.rows, facts.ssi.settleableRows,
      facts.ssi.beneficiaryBanks, facts.ssi.correspondents, facts.atlas.beneficiaryCountries,
      facts.corridorRules.corridors, facts.rails.currencyCount, facts.rails.domesticSchemeCount,
      facts.rails.totalRailCount, facts.tools.verdicts, facts.tools.watchlistEntries,
      facts.tools.holidayCalendars, facts.tools.stpRules,
    ];
    for (const count of counts) expect(text).toContain(formatCount(count));
    for (const currency of facts.rails.currencies) {
      for (const scheme of currency.schemes) expect(text).toContain(scheme.name);
    }
    for (const corridor of facts.corridors) expect(text).toContain(`${corridor.origin.city} → ${corridor.destination.city}`);
  });

  it("states no number that the facts, the demonstration values or the curriculum do not supply", () => {
    const learn = learnSummary();
    const allowed = new Set<string>();
    const add = (value: unknown) => {
      if (typeof value === "number") {
        allowed.add(String(value));
        allowed.add(formatCount(value));
        allowed.add(formatAmount(value));
      } else if (typeof value === "string") {
        for (const run of value.match(/\d[\d,.]*/g) ?? []) allowed.add(run.replace(/[.,]$/, ""));
      } else if (Array.isArray(value)) value.forEach(add);
      else if (value && typeof value === "object") Object.values(value).forEach(add);
    };
    add(facts);
    add(DEMO);
    add(learn);
    add([formatHours(learn.minutes.min), formatHours(learn.minutes.max)]);
    add(DEMO.iban.sortCode.match(/.{2}/g));
    // Layout numbers: section indices, plate figure numbers, hop numbers,
    // calendar days of the demonstration week, and the MT103 field tags.
    const layout = ["01", "02", "03", "04", "05", "06", "0", "1", "2", "3", "4", "5", "0.1", "0.2", "0.3", "0.4", "0.5",
      "29", "30", "20", "23", "32", "50", "59", "71", "121", "261001", "25000,00", "0.42", "0.64", "0.45", "008", "002", "103", "20022"];
    layout.forEach((n) => allowed.add(n));
    const runs = (text.match(/\d[\d,.]*/g) ?? []).map((run) => run.replace(/[.,]$/, ""));
    const unexplained = [...new Set(runs.filter((run) => !allowed.has(run)))];
    expect(unexplained).toEqual([]);
  });

  it("states the simulation in the hero, sections 01, 02, 04 and 06, and the footer", () => {
    for (const selector of ["#hero", "#route", "#anatomy", "#data", "#tools", "footer"]) {
      const scope = doc.querySelector(selector);
      expect(scope, selector).not.toBeNull();
      expect(scope!.querySelector("[data-simulation]")?.textContent, selector).toMatch(/simulation/i);
    }
  });

  it("links only to routes that exist, and has no sign-in", () => {
    const hrefs = [...doc.querySelectorAll("a[href]")].map((a) => a.getAttribute("href")!);
    expect(hrefs.length).toBeGreaterThan(30);
    expect(hrefs.filter((href) => !routeExists(href))).toEqual([]);
    expect(text).not.toMatch(/sign in/i);
  });

  it("shows only ACCT- placeholder account numbers and no contiguous IBAN", () => {
    expect(text.match(/ACCT-\d+/g)?.length).toBeGreaterThan(0);
    expect(text).not.toMatch(/\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/);
  });

  it("gives every rail tab a labelled panel", () => {
    const tabs = [...doc.querySelectorAll('[role="tab"]')];
    expect(tabs).toHaveLength(facts.rails.currencies.length + 1);
    for (const tab of tabs) {
      const panel = doc.getElementById(tab.getAttribute("aria-controls")!);
      expect(panel?.getAttribute("aria-labelledby")).toBe(tab.id);
    }
  });

  it("renders the globe's corridor data for the client, escaped", () => {
    const data = doc.getElementById("globe-data")!.textContent!;
    expect(JSON.parse(data)).toHaveLength(facts.corridors.length);
    expect(data).not.toContain("</");
  });
});
