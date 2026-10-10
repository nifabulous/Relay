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
});
