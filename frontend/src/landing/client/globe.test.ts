import { afterEach, describe, expect, it, vi } from "vitest";
import { initGlobe } from "./globe";

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("globe", () => {
  it("collapses the stage and keeps the legend when there is no 2D context", () => {
    document.body.innerHTML = `
      <div id="globe-stage"><div class="globe-wrap"><canvas id="globe"></canvas></div>
        <script type="application/json" id="globe-data">[{"code":"GBP","from":[6.45,3.39],"to":[51.51,-0.13],"fromLabel":"LAGOS","toLabel":"LONDON"}]</script>
        <button id="tour-toggle" hidden>Pause tour</button></div>
      <div id="legend"><button data-corridor="0">GBP</button></div>`;
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    initGlobe("/points.json");
    expect(document.getElementById("globe-stage")!.classList.contains("off")).toBe(true);
    expect(document.querySelector("[data-corridor]")).not.toBeNull();
    expect(document.getElementById("tour-toggle")!.hidden).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("does nothing when its elements are missing", () => {
    expect(() => initGlobe("/points.json")).not.toThrow();
  });

  describe("with motion allowed", () => {
    const POINTS = [6.45, 3.39, 51.51, -0.13];
    const CORRIDORS = `[{"code":"GBP","from":[6.45,3.39],"to":[51.51,-0.13],"fromLabel":"LAGOS","toLabel":"LONDON"},
      {"code":"USD","from":[43.65,-79.38],"to":[40.71,-74.01],"fromLabel":"TORONTO","toLabel":"NEW YORK"}]`;
    let originalPath2D: unknown;
    let frames: FrameRequestCallback[] = [];
    /** Runs the most recently requested animation frame once, as the browser would. */
    const runFrame = () => frames.at(-1)!(performance.now() + 100);

    function mount() {
      document.documentElement.classList.add("motion");
      document.body.innerHTML = `
        <div id="globe-stage"><div class="globe-wrap"><canvas id="globe"></canvas></div>
          <script type="application/json" id="globe-data">${CORRIDORS}</script>
          <button id="tour-toggle" hidden>Pause tour</button></div>
        <div id="legend"><button data-corridor="0">GBP</button><button data-corridor="1">USD</button></div>`;
      // A context that accepts every drawing call; the test reads the DOM, not pixels.
      const ctx = new Proxy({}, {
        get: (_target, key) => (key === "measureText" ? () => ({ width: 0 }) : () => undefined),
        set: () => true,
      });
      vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
      vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true, json: async () => POINTS } as unknown as Response);
      frames = [];
      vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
        frames.push(callback);
        return frames.length;
      });
      originalPath2D = (globalThis as { Path2D?: unknown }).Path2D;
      (globalThis as { Path2D?: unknown }).Path2D = class {
        rect() {}
        moveTo() {}
        lineTo() {}
      };
    }

    afterEach(() => {
      document.documentElement.classList.remove("motion");
      (globalThis as { Path2D?: unknown }).Path2D = originalPath2D;
    });

    it("focusing a legend button pauses the tour, then clicking it shows its corridor", async () => {
      mount();
      initGlobe("/points.json");
      await vi.waitFor(() => expect(document.getElementById("tour-toggle")!.hidden).toBe(false));
      const toggle = document.getElementById("tour-toggle")!;
      expect(toggle.textContent).toBe("Pause tour");

      const cell = document.querySelector('[data-corridor="1"]') as HTMLButtonElement;
      cell.focus();
      expect(toggle.textContent).toBe("Play tour");
      expect(toggle.getAttribute("aria-pressed")).toBe("true");

      cell.click();
      runFrame();
      expect(cell.classList.contains("on")).toBe(true);
      expect(document.querySelector('[data-corridor="0"]')!.classList.contains("on")).toBe(false);
    });

    it("the toggle resumes a paused tour", async () => {
      mount();
      initGlobe("/points.json");
      await vi.waitFor(() => expect(document.getElementById("tour-toggle")!.hidden).toBe(false));
      const toggle = document.getElementById("tour-toggle")!;

      toggle.click();
      expect(toggle.textContent).toBe("Play tour");
      toggle.click();
      expect(toggle.textContent).toBe("Pause tour");
      expect(toggle.getAttribute("aria-pressed")).toBe("false");
    });
  });
});
