import { describe, expect, it } from "vitest";
import { computeCustomThemeRgbPalette, computeCustomThemeVars } from "@/lib/customTheme";

describe("computeCustomThemeRgbPalette", () => {
  it("returns rgb byte triplets for base/primary/secondary/tertiary", () => {
    const palette = computeCustomThemeRgbPalette(210);
    for (const rgb of Object.values(palette)) {
      expect(rgb).toHaveLength(3);
      for (const channel of rgb) {
        expect(channel).toBeGreaterThanOrEqual(0);
        expect(channel).toBeLessThanOrEqual(255);
        expect(Number.isInteger(channel)).toBe(true);
      }
    }
  });

  it("normalizes hues outside [0, 360) to the same result", () => {
    expect(computeCustomThemeRgbPalette(30)).toEqual(computeCustomThemeRgbPalette(390));
    expect(computeCustomThemeRgbPalette(30)).toEqual(computeCustomThemeRgbPalette(-330));
  });

  it("is deterministic", () => {
    expect(computeCustomThemeRgbPalette(120)).toEqual(computeCustomThemeRgbPalette(120));
  });
});

describe("computeCustomThemeVars", () => {
  const vars = computeCustomThemeVars(262);

  it("produces hex colors for solid surfaces/accents", () => {
    const hexKeys: (keyof typeof vars)[] = [
      "background",
      "bgBase",
      "surface1",
      "surface2",
      "surface3",
      "surface4",
      "surface5",
      "accent",
      "accentStrong",
    ];
    for (const key of hexKeys) {
      expect(vars[key]).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("produces rgba() strings for translucent tokens", () => {
    const rgbaKeys: (keyof typeof vars)[] = [
      "glowA",
      "glowB",
      "accentSoft",
      "border",
      "scrollbarThumb",
      "scrollbarThumbHover",
    ];
    for (const key of rgbaKeys) {
      expect(vars[key]).toMatch(/^rgba\(\d+, \d+, \d+, [\d.]+\)$/);
    }
  });

  it("normalizes hue the same way as the rgb palette", () => {
    expect(computeCustomThemeVars(30)).toEqual(computeCustomThemeVars(390));
  });
});
