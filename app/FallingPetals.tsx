"use client";

import { useMemo } from "react";

function seededRandom(seed: number) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

// Keeps inline style values short/deterministic so the server-rendered HTML
// string and the client's recomputed style object stringify identically —
// otherwise React flags a hydration mismatch on the extra float digits.
function round(value: number, decimals = 3) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

const PETAL_COUNT = 26;

/**
 * Ambient background effect: pale petals drifting down the whole viewport,
 * behind interactive content (see AppShell's z-index layering: backdrop z-0,
 * decorative flourishes z-1, app content z-10). Purely decorative.
 */
export default function FallingPetals() {
  const petals = useMemo(
    () =>
      Array.from({ length: PETAL_COUNT }, (_, i) => {
        const left = round(seededRandom(i * 12.9) * 100, 2);
        const size = round(8 + seededRandom(i * 7.3) * 10, 2);
        const duration = round(14 + seededRandom(i * 5.1) * 16, 2);
        const delay = round(-seededRandom(i * 3.7) * 30, 2);
        const drift = round((seededRandom(i * 9.1) - 0.5) * 140, 2);
        const rotation = round(180 + seededRandom(i * 6.6) * 360, 2);
        const opacity = round(0.25 + seededRandom(i * 4.4) * 0.35, 3);
        return { id: i, left, size, duration, delay, drift, rotation, opacity };
      }),
    []
  );

  return (
    <div className="pointer-events-none fixed inset-0 z-[1] overflow-hidden" aria-hidden="true">
      <style jsx>{`
        @keyframes mp3PetalFall {
          0% {
            transform: translate3d(0, -10vh, 0) rotate(0deg);
          }
          100% {
            transform: translate3d(var(--drift), 110vh, 0) rotate(var(--rotation));
          }
        }
        .mp3-petal {
          position: absolute;
          top: 0;
          border-radius: 100% 0 100% 0;
          background: linear-gradient(135deg, rgba(255, 255, 255, 0.95), rgba(255, 255, 255, 0.5));
          animation: mp3PetalFall linear infinite;
        }
      `}</style>
      {petals.map((petal) => (
        <span
          key={petal.id}
          className="mp3-petal"
          style={{
            left: `${petal.left}%`,
            width: petal.size,
            height: round(petal.size * 0.72, 2),
            opacity: petal.opacity,
            animationDuration: `${petal.duration}s`,
            animationDelay: `${petal.delay}s`,
            ["--drift" as string]: `${petal.drift}px`,
            ["--rotation" as string]: `${petal.rotation}deg`,
          }}
        />
      ))}
    </div>
  );
}
