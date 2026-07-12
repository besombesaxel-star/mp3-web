type Rgb = [number, number, number];

function clampByte(value: number) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function hslToRgb(h: number, s: number, l: number): Rgb {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = h / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));

  let r1 = 0;
  let g1 = 0;
  let b1 = 0;

  if (hp >= 0 && hp < 1) [r1, g1, b1] = [c, x, 0];
  else if (hp >= 1 && hp < 2) [r1, g1, b1] = [x, c, 0];
  else if (hp >= 2 && hp < 3) [r1, g1, b1] = [0, c, x];
  else if (hp >= 3 && hp < 4) [r1, g1, b1] = [0, x, c];
  else if (hp >= 4 && hp < 5) [r1, g1, b1] = [x, 0, c];
  else [r1, g1, b1] = [c, 0, x];

  const m = l - c / 2;
  return [clampByte((r1 + m) * 255), clampByte((g1 + m) * 255), clampByte((b1 + m) * 255)];
}

function rgbToHex([r, g, b]: Rgb): string {
  return `#${[r, g, b].map((v) => clampByte(v).toString(16).padStart(2, "0")).join("")}`;
}

function rgba([r, g, b]: Rgb, alpha: number): string {
  return `rgba(${clampByte(r)}, ${clampByte(g)}, ${clampByte(b)}, ${Math.max(0, Math.min(1, alpha))})`;
}

function normalizeHue(hue: number): number {
  return ((hue % 360) + 360) % 360;
}

/**
 * Derives a full "Steel"-style theme (accent + ambient background ramp) from a
 * single hue, following the same relationships as the 5 built-in presets
 * (see html[data-mp3-theme] blocks in globals.css): accent is a mid-tone,
 * accent-strong is lighter/more saturated, surfaces are a near-black ladder
 * tinted with the hue.
 */
export function computeCustomThemeRgbPalette(hue: number) {
  const h = normalizeHue(hue);
  return {
    base: hslToRgb(h, 0.3, 0.03),
    primary: hslToRgb(h, 0.3, 0.56),
    secondary: hslToRgb(h, 0.36, 0.26),
    tertiary: hslToRgb(h, 0.4, 0.7),
  };
}

export function computeCustomThemeVars(hue: number) {
  const h = normalizeHue(hue);
  const accentRgb = hslToRgb(h, 0.3, 0.56);
  const accentStrongRgb = hslToRgb(h, 0.4, 0.7);
  const baseRgb = hslToRgb(h, 0.3, 0.03);
  const glowBRgb = hslToRgb(h, 0.36, 0.26);

  const surface1Rgb = hslToRgb(h, 0.25, 0.1);
  const surface2Rgb = hslToRgb(h, 0.26, 0.08);
  const surface3Rgb = hslToRgb(h, 0.28, 0.06);
  const surface4Rgb = hslToRgb(h, 0.25, 0.12);
  const surface5Rgb = hslToRgb(h, 0.3, 0.04);

  return {
    background: rgbToHex(baseRgb),
    bgBase: rgbToHex(baseRgb),
    glowA: rgba(accentRgb, 0.16),
    glowB: rgba(glowBRgb, 0.24),
    surface1: rgbToHex(surface1Rgb),
    surface2: rgbToHex(surface2Rgb),
    surface3: rgbToHex(surface3Rgb),
    surface4: rgbToHex(surface4Rgb),
    surface5: rgbToHex(surface5Rgb),
    accent: rgbToHex(accentRgb),
    accentStrong: rgbToHex(accentStrongRgb),
    accentSoft: rgba(accentRgb, 0.16),
    border: rgba(accentStrongRgb, 0.12),
    scrollbarThumb: rgba(accentStrongRgb, 0.3),
    scrollbarThumbHover: rgba(accentStrongRgb, 0.42),
  };
}

const CUSTOM_THEME_CSS_VARS: Record<keyof ReturnType<typeof computeCustomThemeVars>, string> = {
  background: "--background",
  bgBase: "--mp3-bg-base",
  glowA: "--mp3-glow-a",
  glowB: "--mp3-glow-b",
  surface1: "--mp3-surface-1",
  surface2: "--mp3-surface-2",
  surface3: "--mp3-surface-3",
  surface4: "--mp3-surface-4",
  surface5: "--mp3-surface-5",
  accent: "--mp3-accent",
  accentStrong: "--mp3-accent-strong",
  accentSoft: "--mp3-accent-soft",
  border: "--mp3-border",
  scrollbarThumb: "--scrollbar-thumb",
  scrollbarThumbHover: "--scrollbar-thumb-hover",
};

export function applyCustomThemeToDom(hue: number) {
  if (typeof document === "undefined") return;
  const vars = computeCustomThemeVars(hue);
  const root = document.documentElement.style;
  for (const key of Object.keys(vars) as (keyof typeof vars)[]) {
    root.setProperty(CUSTOM_THEME_CSS_VARS[key], vars[key]);
  }
}

export function clearCustomThemeFromDom() {
  if (typeof document === "undefined") return;
  const root = document.documentElement.style;
  for (const cssVar of Object.values(CUSTOM_THEME_CSS_VARS)) {
    root.removeProperty(cssVar);
  }
}
