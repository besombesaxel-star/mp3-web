import { describe, expect, it } from "vitest";
import { PROFILE_THEME_TEMPLATES } from "@/lib/profileThemeTemplates";

describe("PROFILE_THEME_TEMPLATES", () => {
  it("has unique ids and labels", () => {
    const ids = PROFILE_THEME_TEMPLATES.map((t) => t.id);
    const labels = PROFILE_THEME_TEMPLATES.map((t) => t.label);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("keeps every field within the ranges accepted by the profile settings", () => {
    for (const template of PROFILE_THEME_TEMPLATES) {
      if (template.hue !== null) {
        expect(template.hue).toBeGreaterThanOrEqual(0);
        expect(template.hue).toBeLessThan(360);
      }
      expect(template.bannerBlur).toBeGreaterThanOrEqual(0);
      expect(template.bannerBlur).toBeLessThanOrEqual(20);
      expect(template.bannerDim).toBeGreaterThanOrEqual(0);
      expect(template.bannerDim).toBeLessThanOrEqual(100);
      expect(typeof template.showParticles).toBe("boolean");
    }
  });
});
