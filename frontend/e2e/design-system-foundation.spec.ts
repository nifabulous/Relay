import { expect, test } from "@playwright/test";

type Rgb = { r: number; g: number; b: number };

function parseRgb(value: string): Rgb {
  const channels = value.match(/[\d.]+/g)?.map(Number);
  if (!channels || channels.length < 3) throw new Error(`Expected a resolved RGB color, got ${value}`);
  return { r: channels[0], g: channels[1], b: channels[2] };
}

function relativeLuminance({ r, g, b }: Rgb): number {
  const linearize = (channel: number) => {
    const normalized = channel / 255;
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

function contrastRatio(foreground: string, background: string): number {
  const foregroundLuminance = relativeLuminance(parseRgb(foreground));
  const backgroundLuminance = relativeLuminance(parseRgb(background));
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

type ResolvedPair = { foreground: string; background: string };
type ResolvedPalette = {
  background: ResolvedPair;
  primary: ResolvedPair;
  destructive: ResolvedPair;
  warning: ResolvedPair;
  success: ResolvedPair;
  border: ResolvedPair;
  ring: ResolvedPair;
};

async function resolvePalette(page: import("@playwright/test").Page): Promise<Record<string, ResolvedPalette>> {
  return page.evaluate(() => {
    const root = document.documentElement;
    const host = document.createElement("div");
    host.style.cssText = "position:fixed;left:-10000px;top:-10000px;visibility:hidden";
    document.body.append(host);

    const readPair = (foregroundToken: string, backgroundToken: string): ResolvedPair => {
      const probe = document.createElement("span");
      probe.style.color = `var(${foregroundToken})`;
      probe.style.backgroundColor = `var(${backgroundToken})`;
      host.append(probe);
      const computed = getComputedStyle(probe);
      return { foreground: computed.color, background: computed.backgroundColor };
    };

    const palettes: Record<string, ResolvedPalette> = {};
    for (const theme of ["light", "dark"]) {
      root.setAttribute("data-theme", theme);
      palettes[theme] = {
        background: readPair("--foreground", "--background"),
        primary: readPair("--primary-foreground", "--primary"),
        destructive: readPair("--destructive-foreground", "--destructive"),
        warning: readPair("--warning-foreground", "--warning"),
        success: readPair("--success-foreground", "--success"),
        border: readPair("--border", "--card"),
        ring: readPair("--ring", "--card"),
      };
    }

    root.removeAttribute("data-theme");
    host.remove();
    return palettes;
  });
}

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

test("resolves Coss semantic aliases with readable light and dark contrast", async ({ page }) => {
  await page.goto("/app");

  const palettes = await resolvePalette(page);
  for (const theme of ["light", "dark"]) {
    const palette = palettes[theme];
    for (const [name, pair] of Object.entries(palette)) {
      const ratio = contrastRatio(pair.foreground, pair.background);
      const minimum = name === "border" ? 1.15 : 3;
      expect(ratio, `${theme} ${name} contrast`).toBeGreaterThanOrEqual(minimum);
    }

    for (const name of ["background", "primary", "destructive", "warning", "success"]) {
      const pair = palette[name as keyof ResolvedPalette];
      const ratio = contrastRatio(pair.foreground, pair.background);
      expect(ratio, `${theme} ${name} text contrast`).toBeGreaterThanOrEqual(4.5);
    }
  }
});

test("uses the shared Relay Button treatment without losing router navigation", async ({ page }) => {
  await page.goto("/app");

  const action = page.locator(".overview__cta");
  await expect(action).toHaveAttribute("href", "/app/explore?intro=1");

  const styles = await action.evaluate((element) => {
    const computed = getComputedStyle(element);
    return {
      borderRadius: computed.borderRadius,
      minHeight: computed.minHeight,
      borderWidth: computed.borderTopWidth,
      fontFamily: computed.fontFamily,
    };
  });

  expect(styles.borderRadius).toBe("8px");
  expect(styles.minHeight).toBe("48px");
  expect(styles.borderWidth).toBe("1px");
  expect(styles.fontFamily).toContain("Instrument Sans");

  await action.click();
  await expect(page).toHaveURL(/\/app\/explore\?intro=1$/);
});

test("gives the active Overview and Explore links a distinct hover state", async ({ page }) => {
  test.skip((await page.viewportSize())?.width! < 1024, "desktop rail hover assertion");
  await page.goto("/app");
  const expectedHoverBackground = await page.evaluate(() => {
    const probe = document.createElement("span");
    probe.style.backgroundColor = "var(--color-action-border)";
    document.body.append(probe);
    const value = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return value;
  });

  for (const route of ["/app", "/app/explore"]) {
    await page.goto(route);
    const activeLink = page.locator('.app-shell__nav-link--active');
    await expect(activeLink).toHaveCount(1);
    await activeLink.hover();
    await expect
      .poll(() => activeLink.evaluate((element) => getComputedStyle(element).backgroundColor))
      .toBe(expectedHoverBackground);
  }
});

test("uses the Coss menu treatment for the real Preferences popup", async ({ page }) => {
  await page.goto("/app");
  await page.getByRole("button", { name: /preferences/i }).click();

  const menu = page.getByRole("menu", { name: /preferences/i });
  const styles = await menu.evaluate((element) => {
    const computed = getComputedStyle(element);
    return {
      borderRadius: computed.borderRadius,
      padding: computed.padding,
      borderWidth: computed.borderTopWidth,
    };
  });

  expect(styles.borderRadius).toBe("8px");
  expect(styles.padding).toBe("4px");
  expect(styles.borderWidth).toBe("1px");
});

test("uses an opaque tokenized surface for the tutor dialog", async ({ page }) => {
  await page.route("**/api/tutor/availability", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ available: true }),
    }),
  );
  await page.goto("/app");

  await page.getByRole("button", { name: /^Tutor$/i }).click();
  const dialog = page.getByRole("dialog", { name: "Tutor" });
  const styles = await dialog.evaluate((element) => {
    const computed = getComputedStyle(element);
    return {
      background: computed.backgroundColor,
      borderColor: computed.borderTopColor,
      boxShadow: computed.boxShadow,
    };
  });

  expect(styles.background).toBe("rgb(255, 255, 255)");
  expect(styles.borderColor).toBe("rgb(102, 112, 133)");
  expect(styles.boxShadow).not.toBe("none");
});

test("preserves the dark-theme tutor surface elevation treatment", async ({ page }) => {
  await page.route("**/api/tutor/availability", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ available: true }),
    }),
  );
  await page.goto("/app");
  await page.getByRole("button", { name: /preferences/i }).click();
  await page.getByRole("menuitemradio", { name: "Dark", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: /^Tutor$/i }).click();
  await expect(page.getByRole("dialog", { name: "Tutor" })).toBeVisible();
  await expect
    .poll(() =>
      page.locator(".tutor-fab").evaluate((element) => getComputedStyle(element).backgroundColor),
    )
    .toBe("rgb(30, 38, 53)");

  const styles = await page.locator(".tutor-fab, .tutor-floating-panel").evaluateAll((elements) =>
    elements.map((element) => {
      const computed = getComputedStyle(element);
      return {
        background: computed.backgroundColor,
        borderColor: computed.borderTopColor,
        boxShadow: computed.boxShadow,
      };
    }),
  );
  for (const style of styles) {
    expect(style.background).toBe("rgb(30, 38, 53)");
    expect(style.borderColor).toBe("rgb(110, 130, 173)");
    expect(style.boxShadow).toBe("none");
  }
});

test("keeps the primary Relay workspaces inside the viewport in both themes", async ({ page }) => {
  for (const route of ["/app", "/app/explore", "/app/operate", "/app/learn", "/app/settings"]) {
    await page.goto(route);

    const themeBackgrounds = await page.evaluate((currentRoute) => {
      const root = document.documentElement;
      const backgrounds: Record<string, string> = {};
      for (const theme of ["light", "dark"]) {
        root.setAttribute("data-theme", theme);
        backgrounds[theme] = getComputedStyle(root).getPropertyValue("--color-canvas").trim();
        expectViewportWidth();
      }
      root.removeAttribute("data-theme");
      return backgrounds;

      function expectViewportWidth() {
        if (document.documentElement.scrollWidth > window.innerWidth) {
          throw new Error(
            `${currentRoute} overflows at ${window.innerWidth}px: ${document.documentElement.scrollWidth}px`,
          );
        }
      }
    }, route);

    expect(themeBackgrounds.light).not.toBe(themeBackgrounds.dark);
  }
});
