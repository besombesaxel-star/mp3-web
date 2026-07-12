"use client";

import Image from "next/image";
import { useMemo } from "react";
import { Music } from "lucide-react";
import { getInitials } from "@/lib/publicLinks";

const NOTE_GLYPHS = ["♪", "♫", "♬", "♩"];

function seededRandom(seed: number) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

export type ProfilePreviewPinnedTrack = {
  src: string;
  title: string;
  cover: string | null;
};

type ProfilePreviewCardProps = {
  displayName: string;
  bio: string;
  avatarUrl: string;
  hue: number;
  bannerUrl: string;
  bannerBlur: number;
  bannerDim: number;
  showParticles: boolean;
  pinnedTracks: ProfilePreviewPinnedTrack[];
};

/**
 * Compact, faithful mock of app/users/[userId]/ProfileClient.tsx driven
 * entirely by local state (no fetch) so it updates on every keystroke/slider
 * move while editing the public profile in /account.
 */
export default function ProfilePreviewCard({
  displayName,
  bio,
  avatarUrl,
  hue,
  bannerUrl,
  bannerBlur,
  bannerDim,
  showParticles,
  pinnedTracks,
}: ProfilePreviewCardProps) {
  const initials = getInitials(displayName, "MP");

  const notes = useMemo(
    () =>
      Array.from({ length: 10 }, (_, i) => {
        const left = seededRandom(i * 13.37) * 100;
        const size = 10 + seededRandom(i * 7.77) * 10;
        const duration = 6 + seededRandom(i * 3.21) * 5;
        const delay = -seededRandom(i * 5.55) * 10;
        const glyph = NOTE_GLYPHS[i % NOTE_GLYPHS.length];
        return { id: i, left, size, duration, delay, glyph };
      }),
    []
  );

  return (
    <div
      className="relative overflow-hidden rounded-2xl border border-white/8"
      style={
        bannerUrl
          ? { background: "#0d0d11" }
          : { background: `radial-gradient(ellipse at 50% 0%, hsla(${hue}, 38%, 16%, 0.65) 0%, transparent 75%), #0d0d11` }
      }
    >
      {bannerUrl && (
        <div className="absolute inset-0" aria-hidden="true">
          <Image
            src={bannerUrl}
            alt=""
            fill
            className="object-cover"
            sizes="480px"
            style={{
              filter: bannerBlur > 0 ? `blur(${bannerBlur}px)` : undefined,
              transform: "scale(1.1)",
            }}
          />
          <div className="absolute inset-0" style={{ background: `hsla(${hue}, 45%, 6%, ${bannerDim / 100})` }} />
        </div>
      )}

      {showParticles && (
        <div className="pointer-events-none absolute inset-0 z-[1] overflow-hidden" aria-hidden="true">
          <style jsx>{`
            @keyframes mp3PreviewNoteFloat {
              0% {
                transform: translate3d(0, 140px, 0);
                opacity: 0;
              }
              15% {
                opacity: 0.5;
              }
              85% {
                opacity: 0.5;
              }
              100% {
                transform: translate3d(0, -20px, 0);
                opacity: 0;
              }
            }
            .mp3-preview-note {
              position: absolute;
              bottom: 0;
              animation: mp3PreviewNoteFloat linear infinite;
            }
          `}</style>
          {notes.map((note) => (
            <span
              key={note.id}
              className="mp3-preview-note"
              style={{
                left: `${note.left}%`,
                fontSize: note.size,
                animationDuration: `${note.duration}s`,
                animationDelay: `${note.delay}s`,
                color: `hsla(${hue}, 70%, 70%, 0.9)`,
              }}
            >
              {note.glyph}
            </span>
          ))}
        </div>
      )}

      <div className="relative z-10 flex items-center gap-4 px-5 py-4">
        {avatarUrl ? (
          <div
            className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full"
            style={{ boxShadow: `0 0 0 2px hsla(${hue}, 50%, 40%, 0.4)` }}
          >
            <Image src={avatarUrl} alt="" fill className="object-cover" sizes="48px" />
          </div>
        ) : (
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-base font-semibold text-white"
            style={{ background: `linear-gradient(135deg, hsla(${hue}, 72%, 58%, 0.95), hsla(${(hue + 50) % 360}, 76%, 50%, 0.88))` }}
          >
            {initials}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-white/95">{displayName || "Ton pseudo"}</p>
          {bio && (
            <p className="mt-0.5 truncate text-xs text-white/45">
              {bio.slice(0, 55)}
              {bio.length > 55 ? "…" : ""}
            </p>
          )}
        </div>
      </div>

      {pinnedTracks.length > 0 && (
        <div className="relative z-10 px-5 pb-4">
          <div className="grid grid-cols-6 gap-1.5">
            {pinnedTracks.slice(0, 6).map((track) => (
              <div key={track.src} className="relative aspect-square overflow-hidden rounded-lg border border-white/8 bg-white/5">
                {track.cover ? (
                  <Image src={track.cover} alt="" fill className="object-cover" sizes="60px" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <Music size={12} className="text-white/15" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
