import { act, cleanup, fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { preserveDialogOutsideFocus } from "./preserveDialogOutsideFocus";

describe("preserveDialogOutsideFocus", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("restores the pressed control once and leaves later dialog focus alone", () => {
    document.body.innerHTML = `
      <button id="outside">Page control</button>
      <div id="popup">
        <button id="first-inside">First inside control</button>
        <button id="second-inside">Second inside control</button>
      </div>
    `;
    const outside = document.querySelector<HTMLElement>("#outside")!;
    const firstInside = document.querySelector<HTMLElement>("#first-inside")!;
    const secondInside = document.querySelector<HTMLElement>("#second-inside")!;
    const cleanup = preserveDialogOutsideFocus(
      { current: document.querySelector<HTMLElement>("#popup") },
      "popup",
    );

    fireEvent.pointerDown(outside);
    firstInside.focus();
    act(() => {
      vi.advanceTimersByTime(0);
    });

    expect(document.activeElement).toBe(outside);
    secondInside.focus();
    act(() => {
      vi.advanceTimersByTime(0);
    });
    expect(document.activeElement).toBe(secondInside);

    cleanup();
  });

  it("leaves dialog focus in place when the pressed control is disconnected", () => {
    document.body.innerHTML = `
      <button id="outside">Leaving page</button>
      <div id="popup">
        <button id="inside">Inside control</button>
      </div>
    `;
    const outside = document.querySelector<HTMLElement>("#outside")!;
    const inside = document.querySelector<HTMLElement>("#inside")!;
    const cleanup = preserveDialogOutsideFocus(
      { current: document.querySelector<HTMLElement>("#popup") },
      "popup",
    );

    fireEvent.pointerDown(outside);
    outside.remove();
    inside.focus();
    act(() => {
      vi.advanceTimersByTime(0);
    });

    expect(document.activeElement).toBe(inside);

    cleanup();
  });
});
