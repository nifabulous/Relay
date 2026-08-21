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
  });

  test("keeps the portalled menu inside the 390px viewport", async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name !== "case-mobile-390",
      "This geometry contract is owned by the 390px Playwright project",
    );

    await page.goto("/app");
    await page.getByRole("button", { name: /preferences/i }).click();

    const menu = page.getByRole("menu", { name: /preferences/i });
    await expect(menu).toBeVisible();

    const box = await menu.boundingBox();
    const viewport = await page.evaluate(() => ({
      innerWidth: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));

    expect(box).not.toBeNull();
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.innerWidth);
    expect(viewport.scrollWidth).toBeLessThanOrEqual(viewport.innerWidth);
  });
});
