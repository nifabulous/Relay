import { describe, it, expect } from "vitest";

/**
 * WCAG 2.2 AA contrast verification for semantic color tokens.
 *
 * DESIGN.md: "All text and interactive boundaries meet WCAG 2.2 AA contrast."
 *
 * We read the raw token values and compute the contrast ratio between
 * each semantic foreground and its tinted background surface.
 */

// Relative luminance per WCAG 2.x
function srgbToLin(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function luminance(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return 0.2126 * srgbToLin(r) + 0.7152 * srgbToLin(g) + 0.0722 * srgbToLin(b);
}

function contrastRatio(fg: string, bg: string): number {
  const l1 = luminance(fg);
  const l2 = luminance(bg);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

// Token values — these must match tokens.css
const TOKENS = {
  success: "#0e5c44",        // darkened from #16825d
  successBg: "#e8f6ef",
  warning: "#9a5a0c",        // darkened from #c87b16
  warningBg: "#fdf4e6",
  danger: "#9e2b34",         // darkened from #c8424d
  dangerBg: "#fcecef",
  inkMuted: "#586273",       // darkened from DESIGN.md for WCAG AA
  surface3: "#e6eaf2",
  inkStrong: "#16233d",
  surface: "#ffffff",
  // Action palette — used by the `preferred` StatusChip modifier
  // (--color-action / --color-action-surface in tokens.css). A future token
  // tweak could silently drop this below AA, so it is guarded here alongside
  // the other semantic pairs.
  action: "#3157d5",
  actionSurface: "#eef2fc",
} as const;

describe("WCAG 2.2 AA contrast for semantic tokens", () => {
  it("success text on success-bg meets 4.5:1", () => {
    expect(contrastRatio(TOKENS.success, TOKENS.successBg)).toBeGreaterThanOrEqual(4.5);
  });

  it("warning text on warning-bg meets 4.5:1", () => {
    expect(contrastRatio(TOKENS.warning, TOKENS.warningBg)).toBeGreaterThanOrEqual(4.5);
  });

  it("danger text on danger-bg meets 4.5:1", () => {
    expect(contrastRatio(TOKENS.danger, TOKENS.dangerBg)).toBeGreaterThanOrEqual(4.5);
  });

  it("ink-muted on surface-3 meets 4.5:1", () => {
    expect(contrastRatio(TOKENS.inkMuted, TOKENS.surface3)).toBeGreaterThanOrEqual(4.5);
  });

  it("ink-strong on surface meets 7:1 (AAA)", () => {
    expect(contrastRatio(TOKENS.inkStrong, TOKENS.surface)).toBeGreaterThanOrEqual(7);
  });

  it("action text on action-surface meets 4.5:1 (preferred StatusChip)", () => {
    // Regression guard for the `--action` modifier used by the `preferred`
    // StatusChip. The action blue on its tinted surface is the chip's
    // foreground/background pair; ~5.43:1 today, AA requires 4.5:1.
    expect(contrastRatio(TOKENS.action, TOKENS.actionSurface)).toBeGreaterThanOrEqual(4.5);
  });
});
