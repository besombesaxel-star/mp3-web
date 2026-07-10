"use client";

import { useEffect, useMemo, useState } from "react";
import { usePlayer } from "./PlayerContext";

type Rgb = [number, number, number];

type BackdropPalette = {
  base: Rgb;
  primary: Rgb;
  secondary: Rgb;
  tertiary: Rgb;
  imageOpacity: number;
};

/** Identite "Steel" : rampe bleu acier, sombre et epuree. */
const BASE_PALETTE: BackdropPalette = {
  base: [5, 7, 11],
  primary: [111, 139, 179],
  secondary: [67, 87, 128],
  tertiary: [150, 172, 209],
  imageOpacity: 0.2,
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function clampByte(value: number) {
  return clamp(Math.round(value), 0, 255);
}

function rgbToCss([r, g, b]: Rgb, alpha = 1) {
  return `rgba(${clampByte(r)}, ${clampByte(g)}, ${clampByte(b)}, ${clamp(alpha, 0, 1)})`;
}

function mixRgb(a: Rgb, b: Rgb, weight = 0.5): Rgb {
  const ratio = clamp(weight, 0, 1);
  const inv = 1 - ratio;
  return [
    clampByte(a[0] * inv + b[0] * ratio),
    clampByte(a[1] * inv + b[1] * ratio),
    clampByte(a[2] * inv + b[2] * ratio),
  ];
}

function colorDistance(a: Rgb, b: Rgb) {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function parseColorToRgb(color?: string | null): Rgb | null {
  if (!color) return null;
  const value = color.trim();

  const rgb = value.match(/^rgba?\(\s*(\d+)\s*[, ]\s*(\d+)\s*[, ]\s*(\d+)/i);
  if (rgb) {
    return [clampByte(Number(rgb[1])), clampByte(Number(rgb[2])), clampByte(Number(rgb[3]))];
  }

  const hex3 = value.match(/^#([0-9a-f]{3})$/i);
  if (hex3) {
    return [
      parseInt(hex3[1][0] + hex3[1][0], 16),
      parseInt(hex3[1][1] + hex3[1][1], 16),
      parseInt(hex3[1][2] + hex3[1][2], 16),
    ];
  }

  const hex6 = value.match(/^#([0-9a-f]{6})$/i);
  if (hex6) {
    const hex = hex6[1];
    return [
      parseInt(hex.slice(0, 2), 16),
      parseInt(hex.slice(2, 4), 16),
      parseInt(hex.slice(4, 6), 16),
    ];
  }

  return null;
}

function rgbToHsl([r, g, b]: Rgb): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;

  let h = 0;
  if (delta > 0) {
    if (max === rn) h = ((gn - bn) / delta) % 6;
    else if (max === gn) h = (bn - rn) / delta + 2;
    else h = (rn - gn) / delta + 4;
    h *= 60;
    if (h < 0) h += 360;
  }

  const l = (max + min) / 2;
  const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));
  return [h, s, l];
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
  return [
    clampByte((r1 + m) * 255),
    clampByte((g1 + m) * 255),
    clampByte((b1 + m) * 255),
  ];
}

function tuneColor(rgb: Rgb, minSaturation: number, minLightness: number, maxLightness: number): Rgb {
  const [h, rawS, rawL] = rgbToHsl(rgb);
  const saturation = Math.max(rawS, minSaturation);
  const lightness = clamp(rawL, minLightness, maxLightness);
  return hslToRgb(h, saturation, lightness);
}

function shiftHue(rgb: Rgb, shift: number, saturationBoost = 0.06, lightnessDelta = 0) {
  const [h, s, l] = rgbToHsl(rgb);
  return hslToRgb(
    (h + shift + 360) % 360,
    clamp(s + saturationBoost, 0.24, 0.96),
    clamp(l + lightnessDelta, 0.18, 0.76)
  );
}

function derivePaletteFromAccent(accent: string | undefined | null, themePalette: BackdropPalette) {
  const accentRgb = parseColorToRgb(accent);
  if (!accentRgb) return null;

  const primary = tuneColor(accentRgb, 0.42, 0.28, 0.54);
  const secondary = shiftHue(primary, 32, 0.08, 0.04);
  const tertiary = shiftHue(primary, -26, 0.04, -0.06);

  return {
    base: mixRgb(themePalette.base, primary, 0.18),
    primary,
    secondary,
    tertiary,
    imageOpacity: 0.2,
  } satisfies BackdropPalette;
}

async function loadImage(src: string) {
  return await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("image load failed"));
    image.src = src;
  });
}

async function extractPaletteFromCover(
  src: string,
  themePalette: BackdropPalette,
  accent?: string | null
): Promise<BackdropPalette> {
  const image = await loadImage(src);
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    throw new Error("canvas unavailable");
  }

  const maxSize = 40;
  const scale = Math.max(image.naturalWidth, image.naturalHeight) / maxSize || 1;
  canvas.width = Math.max(1, Math.round(image.naturalWidth / scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight / scale));

  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const { data } = context.getImageData(0, 0, canvas.width, canvas.height);

  const buckets = new Map<string, { weight: number; r: number; g: number; b: number; count: number }>();
  let totalR = 0;
  let totalG = 0;
  let totalB = 0;
  let totalWeight = 0;

  for (let index = 0; index < data.length; index += 4) {
    const alpha = data[index + 3];
    if (alpha < 140) continue;

    const r = data[index];
    const g = data[index + 1];
    const b = data[index + 2];
    const [, saturation, lightness] = rgbToHsl([r, g, b]);

    if (lightness < 0.04 || lightness > 0.96) continue;

    const weight =
      (0.35 + saturation * 1.65) *
      (0.55 + (1 - Math.abs(lightness - 0.48) * 1.25));

    const qr = Math.round(r / 28) * 28;
    const qg = Math.round(g / 28) * 28;
    const qb = Math.round(b / 28) * 28;
    const key = `${qr}:${qg}:${qb}`;
    const previous = buckets.get(key) ?? { weight: 0, r: 0, g: 0, b: 0, count: 0 };
    previous.weight += weight;
    previous.r += r * weight;
    previous.g += g * weight;
    previous.b += b * weight;
    previous.count += 1;
    buckets.set(key, previous);

    totalR += r * weight;
    totalG += g * weight;
    totalB += b * weight;
    totalWeight += weight;
  }

  if (buckets.size === 0 || totalWeight <= 0) {
    const accentPalette = derivePaletteFromAccent(accent, themePalette);
    return accentPalette ?? themePalette;
  }

  const candidates = [...buckets.values()]
    .map((bucket) => {
      const rgb: Rgb = [
        clampByte(bucket.r / bucket.weight),
        clampByte(bucket.g / bucket.weight),
        clampByte(bucket.b / bucket.weight),
      ];
      const [, saturation, lightness] = rgbToHsl(rgb);
      const lightnessScore = 1 - Math.abs(lightness - 0.46) * 1.4;
      const score = bucket.weight * (0.3 + saturation * 1.8) * clamp(lightnessScore, 0.18, 1.15);

      return {
        rgb,
        score,
      };
    })
    .sort((a, b) => b.score - a.score);

  const average: Rgb = [
    clampByte(totalR / totalWeight),
    clampByte(totalG / totalWeight),
    clampByte(totalB / totalWeight),
  ];

  const primarySource = candidates[0]?.rgb ?? average;
  let secondarySource =
    candidates.find((candidate) => colorDistance(candidate.rgb, primarySource) > 92)?.rgb ?? null;

  if (!secondarySource) {
    secondarySource = shiftHue(primarySource, 34, 0.08, 0.06);
  }

  const accentRgb = parseColorToRgb(accent);
  const primary = tuneColor(mixRgb(primarySource, accentRgb ?? primarySource, accentRgb ? 0.14 : 0), 0.42, 0.26, 0.56);
  const secondary = tuneColor(mixRgb(secondarySource, average, 0.18), 0.32, 0.24, 0.6);
  const tertiary = tuneColor(mixRgb(average, themePalette.tertiary, 0.28), 0.22, 0.18, 0.42);
  const base = mixRgb(themePalette.base, average, 0.12);

  return {
    base,
    primary,
    secondary,
    tertiary,
    imageOpacity: 0.2,
  };
}

export default function DynamicBackdrop() {
  const { track } = usePlayer();
  const [paletteCache] = useState(() => new Map<string, BackdropPalette>());
  const themePalette = BASE_PALETTE;
  const accent = track?.accent;
  const accentPalette = useMemo(() => derivePaletteFromAccent(accent, themePalette), [accent, themePalette]);
  const [resolvedPalette, setResolvedPalette] = useState<{ key: string; palette: BackdropPalette } | null>(null);
  const cover = track?.cover?.trim() ?? "";
  const cacheKey = cover ? `${accent ?? ""}|${cover}` : "";
  const cachedPalette = cacheKey ? paletteCache.get(cacheKey) ?? null : null;
  const palette = useMemo(() => {
    if (!cacheKey) {
      return accentPalette ?? themePalette;
    }

    if (resolvedPalette?.key === cacheKey) {
      return resolvedPalette.palette;
    }

    return cachedPalette ?? accentPalette ?? themePalette;
  }, [accentPalette, cacheKey, cachedPalette, resolvedPalette, themePalette]);

  useEffect(() => {
    const fallbackPalette = accentPalette ?? themePalette;

    if (!cover) {
      return;
    }

    if (paletteCache.has(cacheKey)) {
      return;
    }

    let disposed = false;

    void extractPaletteFromCover(cover, themePalette, accent)
      .then((nextPalette) => {
        if (disposed) return;
        paletteCache.set(cacheKey, nextPalette);
        setResolvedPalette({ key: cacheKey, palette: nextPalette });
      })
      .catch(() => {
        if (!disposed) {
          setResolvedPalette({ key: cacheKey, palette: fallbackPalette });
        }
      });

    return () => {
      disposed = true;
    };
  }, [accent, accentPalette, cacheKey, cover, paletteCache, themePalette]);

  const backgroundStyle = useMemo(
    () => ({
      background: [
        `radial-gradient(78rem 52rem at 10% -12%, ${rgbToCss(palette.primary, 0.22)} 0%, transparent 68%)`,
        `radial-gradient(76rem 52rem at 94% 8%, ${rgbToCss(palette.secondary, 0.18)} 0%, transparent 70%)`,
        `radial-gradient(68rem 54rem at 52% 112%, ${rgbToCss(palette.tertiary, 0.12)} 0%, transparent 66%)`,
        `linear-gradient(180deg, ${rgbToCss(mixRgb(palette.base, [255, 255, 255], 0.02), 0.98)} 0%, ${rgbToCss(
          mixRgb(palette.base, [0, 0, 0], 0.12),
          1
        )} 100%)`,
      ].join(", "),
    }),
    [palette]
  );

  const primaryBlobStyle = useMemo(
    () => ({
      background: `radial-gradient(circle, ${rgbToCss(palette.primary, 0.28)} 0%, ${rgbToCss(
        palette.primary,
        0.1
      )} 38%, transparent 72%)`,
    }),
    [palette.primary]
  );

  const secondaryBlobStyle = useMemo(
    () => ({
      background: `radial-gradient(circle, ${rgbToCss(palette.secondary, 0.24)} 0%, ${rgbToCss(
        palette.secondary,
        0.08
      )} 40%, transparent 72%)`,
    }),
    [palette.secondary]
  );

  const tertiaryBlobStyle = useMemo(
    () => ({
      background: `radial-gradient(circle, ${rgbToCss(palette.tertiary, 0.2)} 0%, ${rgbToCss(
        palette.tertiary,
        0.06
      )} 36%, transparent 72%)`,
    }),
    [palette.tertiary]
  );

  const imageOpacity = track?.cover ? palette.imageOpacity : 0;

  const vignetteStyle = useMemo(
    () => ({
      background: [
        `linear-gradient(180deg, ${rgbToCss([255, 255, 255], 0.02)} 0%, transparent 18%)`,
        `linear-gradient(180deg, ${rgbToCss([6, 7, 10], 0.06)} 0%, ${rgbToCss([4, 5, 8], 0.56)} 100%)`,
      ].join(", "),
    }),
    []
  );

  return (
    <>
      <style jsx global>{`
        @keyframes mp3DynamicFloatA {
          0% {
            transform: translate3d(0, 0, 0) scale(1);
          }
          50% {
            transform: translate3d(2%, -3%, 0) scale(1.06);
          }
          100% {
            transform: translate3d(0, 0, 0) scale(1);
          }
        }

        @keyframes mp3DynamicFloatB {
          0% {
            transform: translate3d(0, 0, 0) scale(1);
          }
          50% {
            transform: translate3d(-3%, 2%, 0) scale(1.08);
          }
          100% {
            transform: translate3d(0, 0, 0) scale(1);
          }
        }

        @keyframes mp3DynamicFloatC {
          0% {
            transform: translate3d(0, 0, 0) scale(1);
          }
          50% {
            transform: translate3d(1%, 3%, 0) scale(1.04);
          }
          100% {
            transform: translate3d(0, 0, 0) scale(1);
          }
        }

        .mp3-dynamic-cover {
          animation: mp3DynamicFloatA 18s ease-in-out infinite;
        }
        .mp3-dynamic-blob-a {
          animation: mp3DynamicFloatA 20s ease-in-out infinite;
        }
        .mp3-dynamic-blob-b {
          animation: mp3DynamicFloatB 24s ease-in-out infinite;
        }
        .mp3-dynamic-blob-c {
          animation: mp3DynamicFloatC 22s ease-in-out infinite;
        }
      `}</style>

      <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div className="absolute inset-0 transition-[background] duration-700 ease-out" style={backgroundStyle} />

        {track?.cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={track.src}
            src={track.cover}
            alt=""
            className="mp3-dynamic-cover absolute left-[-12%] top-[-12%] h-[124%] w-[124%] object-cover transition-opacity duration-700 ease-out"
            style={{
              opacity: imageOpacity,
              filter: "blur(110px) saturate(1.3) brightness(0.56)",
              transform: "scale(1.08)",
            }}
          />
        ) : null}

        <div
          className="mp3-dynamic-blob mp3-dynamic-blob-a absolute left-[-18rem] top-[-12rem] h-[44rem] w-[44rem] rounded-full blur-3xl transition-[background] duration-700 ease-out"
          style={primaryBlobStyle}
        />
        <div
          className="mp3-dynamic-blob mp3-dynamic-blob-b absolute right-[-16rem] top-[2rem] h-[40rem] w-[40rem] rounded-full blur-3xl transition-[background] duration-700 ease-out"
          style={secondaryBlobStyle}
        />
        <div
          className="mp3-dynamic-blob mp3-dynamic-blob-c absolute bottom-[-20rem] left-[24%] h-[38rem] w-[38rem] rounded-full blur-3xl transition-[background] duration-700 ease-out"
          style={tertiaryBlobStyle}
        />

        <div className="absolute inset-0" style={vignetteStyle} />
      </div>
    </>
  );
}
