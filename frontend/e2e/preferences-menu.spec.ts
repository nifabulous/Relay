import { expect, test } from "@playwright/test";

test.describe("Preferences menu", () => {
  test("exposes the real menu semantics and restores focus", async ({ page }) => {
    await page.goto("/app");

    const trigger = page.getByRole("button", { name: /preferences/i });
    await trigger.click();

    const menu = page.getByRole("menu", { name: /preferences/i });
    const system = page.getByRole("menuitemradio", { name: /system/i });
    const light = page.getByRole("menuitemradio", { name: "Light", exact: true });

    await expect(menu).toBeVisible();
    await expect(menu).toHaveAttribute("id", "app-shell-preferences-menu");
    await expect(system).toBeFocused();

    await page.keyboard.press("ArrowDown");
    await expect(light).toBeFocused();
    await page.keyboard.press("ArrowUp");
    await expect(system).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    await expect(trigger).toBeFocused();

    await page.getByRole("button", { name: /preferences/i }).click();
    await page.getByRole("link", { name: "Overview", exact: true }).click();
    await expect(page.getByRole("menu", { name: /preferences/i })).toBeHidden();
    await expect(page).toHaveURL(/\/app\/?$/);

    await page.getByRole("button", { name: /preferences/i }).click();
    await page.getByRole("menuitem", { name: "All settings", exact: true }).click();
    await expect(page.getByRole("menu", { name: /preferences/i })).toBeHidden();
    await expect(page).toHaveURL(/\/settings\/?$/);
  });

  // jsdom pins the declared placement (data-side/data-align); only a real
  // browser can prove the resolved geometry. Runs at every project width —
  // 390px included — because a popup that fits at 1440 can still clip at 390.
  test("keeps the portalled menu inside the viewport, below and end-aligned to the trigger", async ({
    page,
  }) => {
    await page.goto("/app");
    await page.getByRole("button", { name: /preferences/i }).click();

    const menu = page.getByRole("menu", { name: /preferences/i });
    await expect(menu).toBeVisible();

    const geometry = await menu.evaluate((menu) => {
      // Both rects come from one measurement pass in the same coordinate
      // space. A missing trigger is a setup failure, not a zero coordinate
      // to silently compare against.
      const trigger = document.querySelector(".app-shell__prefs-trigger");
      if (!trigger) throw new Error("Preferences trigger not found in the DOM");
      const menuRect = menu.getBoundingClientRect();
      const triggerRect = trigger.getBoundingClientRect();
      return {
        menu: {
          left: menuRect.left,
          right: menuRect.right,
          top: menuRect.top,
          bottom: menuRect.bottom,
        },
        triggerRight: triggerRect.right,
        triggerBottom: triggerRect.bottom,
        viewport: { width: window.innerWidth, height: window.innerHeight },
        scrollWidth: document.documentElement.scrollWidth,
      };
    });

    // Fully on-screen — the portalled popup escapes the header's stacking
    // context, so clipping or off-screen drift would otherwise go unnoticed.
    expect(geometry.menu.left).toBeGreaterThanOrEqual(0);
    expect(geometry.menu.right).toBeLessThanOrEqual(geometry.viewport.width);
    expect(geometry.menu.top).toBeGreaterThanOrEqual(0);
    expect(geometry.menu.bottom).toBeLessThanOrEqual(geometry.viewport.height);

    // side="bottom" at the configured 8px offset: the popup hangs just below
    // the trigger. The ±1px tolerance absorbs subpixel layout rounding, not a
    // real placement change — overlap, zero offset, or arbitrary drift fails.
    const bottomGap = geometry.menu.top - geometry.triggerBottom;
    expect(Math.abs(bottomGap - 8)).toBeLessThanOrEqual(1);

    // align="end": the popup's right edge lines up with the trigger's, so it
    // grows leftward into the page instead of off its right edge.
    expect(Math.abs(geometry.menu.right - geometry.triggerRight)).toBeLessThanOrEqual(1);

    // An off-screen popup would announce itself as horizontal overflow.
    expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.viewport.width);
  });
});
