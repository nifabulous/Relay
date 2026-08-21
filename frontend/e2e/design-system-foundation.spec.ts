import { expect, test } from "@playwright/test";

test("preserves Relay base styles without Tailwind Preflight", async ({ page }) => {
  await page.goto("/app");

  await page.evaluate(() => {
    const probe = document.createElement("div");
    probe.id = "relay-foundation-probe";
    probe.style.position = "fixed";
    probe.style.left = "-10000px";
    probe.innerHTML =
      '<h1>Probe</h1><ul><li>Item</li></ul><button id="relay-foundation-probe-before" type="button">Before</button><button id="relay-foundation-probe-button" type="button">Probe</button><button id="relay-foundation-probe-after" type="button">After</button>';
    document.body.append(probe);
  });

  const styles = await page.evaluate(() => {
    const probe = document.querySelector<HTMLElement>("#relay-foundation-probe");
    if (!probe) throw new Error("Relay foundation probe was not mounted");
    const heading = probe.querySelector("h1");
    const list = probe.querySelector("ul");
    const button = probe.querySelector("button");
    return {
      headingFont: heading ? getComputedStyle(heading).fontFamily : "",
      headingSize: heading ? getComputedStyle(heading).fontSize : "",
      listStyle: list ? getComputedStyle(list).listStyleType : "",
      buttonBorderWidth: button
        ? getComputedStyle(button).borderTopWidth
        : "",
    };
  });

  expect(styles.headingFont).toContain("Instrument Sans");
  expect(styles.headingSize).toBe("36px");
  expect(styles.listStyle).not.toBe("none");
  expect(styles.buttonBorderWidth).not.toBe("0px");

  const probeButton = page.locator("#relay-foundation-probe-button");
  await probeButton.focus();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Shift+Tab");
  const focusStyles = await probeButton.evaluate((button) => {
    const style = getComputedStyle(button);
    return {
      matchesFocusVisible: button.matches(":focus-visible"),
      outlineWidth: style.outlineWidth,
      outlineStyle: style.outlineStyle,
      outlineOffset: style.outlineOffset,
    };
  });

  expect(focusStyles.matchesFocusVisible).toBe(true);
  expect(focusStyles.outlineWidth).toBe("2px");
  expect(focusStyles.outlineStyle).toBe("solid");
  expect(focusStyles.outlineOffset).toBe("2px");

  await page.evaluate(() => {
    document.querySelector("#relay-foundation-probe-button")?.parentElement?.remove();
  });
});
