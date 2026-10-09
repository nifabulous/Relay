/**
 * The legacy /learn router (app/static/js/learn.js) gates each core lab on the
 * one before it. Load the real file — and the real LearnUtils it is loaded
 * after in app/static/learn.html — into jsdom and drive navigate() directly.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const UTILS_SOURCE = readFileSync(resolve(REPO_ROOT, "app/static/js/learn-utils.js"), "utf8");
const LEARN_SOURCE = readFileSync(resolve(REPO_ROOT, "app/static/js/learn.js"), "utf8");

type LegacyLab = (main: HTMLElement, helpers: Record<string, unknown>) => void;

interface LegacyWindow {
  LearnUtils?: unknown;
  LearnLabs: Record<string, LegacyLab>;
  LearnHelpers?: { navigate: (hash: string) => void };
  addEventListener: () => void;
  scrollTo: () => void;
}

function loadRouter(labs: Record<string, LegacyLab> = {}) {
  const main = document.createElement("main");
  main.id = "lab-main";
  document.body.appendChild(main);

  const legacyWindow: LegacyWindow = { LearnLabs: labs, addEventListener: () => {}, scrollTo: () => {} };
  new Function("window", UTILS_SOURCE)(legacyWindow);
  new Function("window", "LearnUtils", "LearnLabs", LEARN_SOURCE)(legacyWindow, legacyWindow.LearnUtils, labs);
  return { main, navigate: legacyWindow.LearnHelpers!.navigate };
}

afterEach(() => {
  document.body.innerHTML = "";
  localStorage.clear();
});

describe("legacy /learn router (app/static/js/learn.js)", () => {
  // The lock screen called an esc() that learn.js never defined, so opening a
  // locked lab threw a ReferenceError and left the page blank.
  it("shows the lock screen for a core lab whose prerequisite is incomplete", () => {
    const lab2 = vi.fn();
    const { main, navigate } = loadRouter({ "2": lab2 });

    expect(() => navigate("#lab-2")).not.toThrow();

    expect(main.textContent).toContain("Complete Lab 1: BICs & IBANs first to unlock this lab.");
    expect(main.querySelector('a[href="#lab-1"]')?.textContent).toBe("Go to Lab 1: BICs & IBANs →");
    expect(lab2).not.toHaveBeenCalled();
  });

  it("locks the capstone until Lab 7 is complete", () => {
    localStorage.setItem("swift-lab-progress", JSON.stringify(["1", "2", "3", "4", "5", "6"]));
    const { main, navigate } = loadRouter();

    navigate("#lab-capstone");

    expect(main.textContent).toContain("Complete Lab 7: Payment Schemes first to unlock this lab.");
    expect(main.querySelector('a[href="#lab-7"]')).not.toBeNull();
  });

  it("opens a core lab once its prerequisite is complete", () => {
    localStorage.setItem("swift-lab-progress", JSON.stringify(["1"]));
    const lab2 = vi.fn();
    const { main, navigate } = loadRouter({ "2": lab2 });

    navigate("#lab-2");

    expect(lab2).toHaveBeenCalledWith(main, expect.objectContaining({ markComplete: expect.any(Function) }));
    expect(main.textContent).not.toContain("to unlock this lab");
  });
});
