import { afterEach, describe, expect, it, vi } from "vitest";
import { countUp, initCounters } from "./counters";
import { IBAN_STEP_MS, initIbanDemo } from "./iban-demo";
import { initRailTabs } from "./rails-tabs";

afterEach(() => {
  document.body.innerHTML = "";
  document.documentElement.className = "";
  vi.useRealTimers();
});

function mountTabs(): HTMLButtonElement[] {
  const codes = ["gbp", "cad", "usd", "swift"];
  document.body.innerHTML = `
    <div role="tablist" id="rail-tabs">${codes
      .map((c, i) => `<button role="tab" id="rail-tab-${c}" aria-controls="rail-panel-${c}" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}">${c}</button>`)
      .join("")}</div>
    <div id="rail-panels">${codes.map((c) => `<div role="tabpanel" id="rail-panel-${c}" aria-labelledby="rail-tab-${c}">${c}</div>`).join("")}</div>`;
  initRailTabs(document);
  return Array.from(document.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
}

function panelVisible(code: string): boolean {
  return !document.getElementById(`rail-panel-${code}`)!.hidden;
}

describe("rail tabs", () => {
  it("shows only the selected panel once enhanced", () => {
    mountTabs();
    expect(document.getElementById("rail-panels")!.classList.contains("ready")).toBe(true);
    expect(["gbp", "cad", "usd", "swift"].map(panelVisible)).toEqual([true, false, false, false]);
  });

  it("moves with arrow keys, wrapping at both ends, and jumps with Home and End", () => {
    const tabs = mountTabs();
    const press = (tab: HTMLElement, key: string) => tab.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
    press(tabs[0], "ArrowLeft");
    expect(document.activeElement).toBe(tabs[3]);
    expect(panelVisible("swift")).toBe(true);
    press(tabs[3], "ArrowRight");
    expect(document.activeElement).toBe(tabs[0]);
    press(tabs[0], "End");
    expect(tabs[3].getAttribute("aria-selected")).toBe("true");
    expect(tabs[3].tabIndex).toBe(0);
    expect(tabs[0].tabIndex).toBe(-1);
    press(tabs[3], "Home");
    expect(panelVisible("gbp")).toBe(true);
  });

  it("selects on click", () => {
    const tabs = mountTabs();
    tabs[2].click();
    expect(panelVisible("usd")).toBe(true);
    expect(panelVisible("gbp")).toBe(false);
  });
});

describe("counters", () => {
  it("keeps the final value readable while an aria-hidden overlay animates", () => {
    document.body.innerHTML = `<b id="n">12,196</b>`;
    const element = document.getElementById("n")!;
    const frames: FrameRequestCallback[] = [];
    let now = 0;
    countUp(element, (cb) => frames.push(cb), () => now);
    expect(element.querySelector(".sr")!.textContent).toBe("12,196");
    expect(element.querySelector('[aria-hidden="true"]')!.textContent).toBe("0");
    now = 1100;
    frames.shift()!(now);
    expect(element.textContent).toBe("12,196");
    expect(element.children).toHaveLength(0);
  });

  it("leaves zero and non-numbers alone", () => {
    document.body.innerHTML = `<b id="z">0.00</b>`;
    const element = document.getElementById("z")!;
    countUp(element, () => 0, () => 0);
    expect(element.innerHTML).toBe("0.00");
  });

  it("does nothing without motion", () => {
    document.body.innerHTML = `<b data-count="">761</b>`;
    const observe = vi.fn();
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        observe = observe;
        unobserve() {}
      },
    );
    initCounters(document);
    expect(observe).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe("IBAN demo", () => {
  function mountIban() {
    document.body.innerHTML = `
      <div id="iban-demo"><span>GB82</span><span>WEST</span></div>
      <div id="iban-checks"><div>a</div><div>b</div></div>
      <button id="iban-replay" hidden>Replay</button>`;
  }

  it("plays once when visible, then offers Replay", () => {
    vi.useFakeTimers();
    mountIban();
    document.documentElement.classList.add("motion");
    let onIntersect: IntersectionObserverCallback = () => undefined;
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(callback: IntersectionObserverCallback) {
          onIntersect = callback;
        }
        observe() {}
        disconnect() {}
      },
    );
    initIbanDemo(document);
    onIntersect([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
    const replay = document.getElementById("iban-replay")!;
    expect(replay.hidden).toBe(true);
    vi.advanceTimersByTime(IBAN_STEP_MS * 2);
    expect(document.querySelectorAll("#iban-demo .on")).toHaveLength(2);
    expect(document.querySelectorAll("#iban-checks .on")).toHaveLength(0);
    vi.advanceTimersByTime(IBAN_STEP_MS * 2);
    expect(document.querySelectorAll("#iban-checks .on")).toHaveLength(2);
    expect(replay.hidden).toBe(false);
    replay.click();
    expect(replay.hidden).toBe(true);
    expect(document.querySelectorAll("#iban-demo .on")).toHaveLength(0);
    vi.unstubAllGlobals();
  });

  it("does nothing without motion, leaving the CSS final state", () => {
    mountIban();
    initIbanDemo(document);
    expect(document.querySelectorAll(".on")).toHaveLength(0);
    expect(document.getElementById("iban-replay")!.hidden).toBe(true);
  });
});
