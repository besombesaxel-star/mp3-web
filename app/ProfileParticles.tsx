"use client";

import { useMemo } from "react";

const GLYPHS = ["♪", "♫", "♬", "♩"];

function seededRandom(seed: number) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

export default function ProfileParticles({ hue }: { hue: number }) {
  const notes = useMemo(
    () =>
      Array.from({ length: 18 }, (_, i) => {
        const left = seededRandom(i * 13.37) * 100;
        const size = 14 + seededRandom(i * 7.77) * 18;
        const duration = 14 + seededRandom(i * 3.21) * 12;
        const delay = -seededRandom(i * 5.55) * 24;
        const glyph = GLYPHS[i % GLYPHS.length];
        const drift = (seededRandom(i * 9.99) - 0.5) * 60;
        return { id: i, left, size, duration, delay, glyph, drift };
      }),
    []
  );

  return (
    <div className="pointer-events-none fixed inset-0 z-[1] overflow-hidden" aria-hidden="true">
      <style jsx>{`
        @keyframes mp3ProfileNoteFloat {
          0% {
            transform: translate3d(0, 110vh, 0) rotate(0deg);
            opacity: 0;
          }
          8% {
            opacity: 0.5;
          }
          92% {
            opacity: 0.5;
          }
          100% {
            transform: translate3d(var(--drift), -10vh, 0) rotate(24deg);
            opacity: 0;
          }
        }
        .mp3-profile-note {
          position: absolute;
          bottom: 0;
          animation: mp3ProfileNoteFloat linear infinite;
        }
      `}</style>
      {notes.map((note) => (
        <span
          key={note.id}
          className="mp3-profile-note"
          style={{
            left: `${note.left}%`,
            fontSize: note.size,
            animationDuration: `${note.duration}s`,
            animationDelay: `${note.delay}s`,
            color: `hsla(${hue}, 70%, 70%, 0.9)`,
            ["--drift" as string]: `${note.drift}px`,
          }}
        >
          {note.glyph}
        </span>
      ))}
    </div>
  );
}
