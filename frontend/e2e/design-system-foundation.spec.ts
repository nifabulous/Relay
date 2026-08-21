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
