"use client";

import { useEffect, useState } from "react";
import { applyCustomThemeToDom, clearCustomThemeFromDom } from "@/lib/customTheme";

export type FontSizeMode = "sm" | "md" | "lg" | "xl";
export type ColorTheme = "steel" | "emerald" | "amber" | "rose" | "violet" | "custom";

export type PlayerAppearance = {
  fontSize: FontSizeMode;
  setFontSize: (value: FontSizeMode) => void;
  highContrast: boolean;
  /** Raw setter, kept for hydrating from persisted prefs on load — the public usePlayer() API only exposes toggleHighContrast. */
  setHighContrast: (value: boolean) => void;
  toggleHighContrast: () => void;
  colorTheme: ColorTheme;
  setColorTheme: (value: ColorTheme) => void;
  customThemeHue: number;
  setCustomThemeHue: (value: number) => void;
  fallingPetals: boolean;
  /** Raw setter, kept for hydrating from persisted prefs on load — the public usePlayer() API only exposes toggleFallingPetals. */
  setFallingPetals: (value: boolean) => void;
  toggleFallingPetals: () => void;
  /**
   * User's explicit in-app opt-in, independent from the OS-level
   * `prefers-reduced-motion` media query (which globals.css always honors on
   * its own, with no way to override it back to full motion from here).
   * This only ever adds *more* reduction, for people who want it without
   * changing their OS setting.
   */
  reducedMotion: boolean;
  /** Raw setter, kept for hydrating from persisted prefs on load — the public usePlayer() API only exposes toggleReducedMotion. */
  setReducedMotion: (value: boolean) => void;
  toggleReducedMotion: () => void;
};

/**
 * Owns the profile-agnostic visual preferences (font size, contrast, color
 * theme, falling-petals background effect) and their DOM side effects.
 * Persistence stays centralized in PlayerContext's single PlayerPrefs
 * read/write effect (mp3:prefs:v1) so there's only ever one writer for that
 * key — PlayerProvider destructures this hook's values into its own state
 * loading/saving instead of duplicating localStorage access here.
 */
export function usePlayerAppearance(): PlayerAppearance {
  const [fontSize, setFontSize] = useState<FontSizeMode>("md");
  const [highContrast, setHighContrast] = useState(false);
  const [colorTheme, setColorTheme] = useState<ColorTheme>("steel");
  const [customThemeHue, setCustomThemeHue] = useState(218);
  const [fallingPetals, setFallingPetals] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.dataset.mp3FontSize = fontSize;
  }, [fontSize]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.dataset.mp3Contrast = highContrast ? "high" : "normal";
  }, [highContrast]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.dataset.mp3Theme = colorTheme;
    if (colorTheme === "custom") {
      applyCustomThemeToDom(customThemeHue);
    } else {
      clearCustomThemeFromDom();
    }
  }, [colorTheme, customThemeHue]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    if (reducedMotion) {
      document.documentElement.dataset.mp3Motion = "reduced";
    } else {
      delete document.documentElement.dataset.mp3Motion;
    }
  }, [reducedMotion]);

  function toggleHighContrast() {
    setHighContrast((value) => !value);
  }

  function toggleFallingPetals() {
    setFallingPetals((value) => !value);
  }

  function toggleReducedMotion() {
    setReducedMotion((value) => !value);
  }

  return {
    fontSize,
    setFontSize,
    highContrast,
    setHighContrast,
    toggleHighContrast,
    colorTheme,
    setColorTheme,
    customThemeHue,
    setCustomThemeHue,
    fallingPetals,
    setFallingPetals,
    toggleFallingPetals,
    reducedMotion,
    setReducedMotion,
    toggleReducedMotion,
  };
}
