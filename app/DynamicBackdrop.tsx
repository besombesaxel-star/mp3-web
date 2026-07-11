"use client";

import { useMemo } from "react";

type Rgb = [number, number, number];

type BackdropPalette = {
  base: Rgb;
  primary: Rgb;
  secondary: Rgb;
  tertiary: Rgb;
};

/** Identite "Steel" : rampe bleu acier, sombre et epuree - fixe, jamais teintee par la cover en cours. */
const BASE_PALETTE: BackdropPalette = {
  base: [5, 7, 11],
  primary: [111, 139, 179],
  secondary: [67, 87, 128],
  tertiary: [150, 172, 209],
};

function clampByte(value: number) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function rgbToCss([r, g, b]: Rgb, alpha = 1) {
  return `rgba(${clampByte(r)}, ${clampByte(g)}, ${clampByte(b)}, ${Math.max(0, Math.min(1, alpha))})`;
}

function mixRgb(a: Rgb, b: Rgb, weight = 0.5): Rgb {
  const ratio = Math.max(0, Math.min(1, weight));
  const inv = 1 - ratio;
  return [
    clampByte(a[0] * inv + b[0] * ratio),
    clampByte(a[1] * inv + b[1] * ratio),
    clampByte(a[2] * inv + b[2] * ratio),
  ];
}

export default function DynamicBackdrop() {
  const palette = BASE_PALETTE;

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
        <div className="absolute inset-0" style={backgroundStyle} />

        <div
          className="mp3-dynamic-blob mp3-dynamic-blob-a absolute left-[-18rem] top-[-12rem] h-[44rem] w-[44rem] rounded-full blur-3xl"
          style={primaryBlobStyle}
        />
        <div
          className="mp3-dynamic-blob mp3-dynamic-blob-b absolute right-[-16rem] top-[2rem] h-[40rem] w-[40rem] rounded-full blur-3xl"
          style={secondaryBlobStyle}
        />
        <div
          className="mp3-dynamic-blob mp3-dynamic-blob-c absolute bottom-[-20rem] left-[24%] h-[38rem] w-[38rem] rounded-full blur-3xl"
          style={tertiaryBlobStyle}
        />

        <div className="absolute inset-0" style={vignetteStyle} />
      </div>
    </>
  );
}
