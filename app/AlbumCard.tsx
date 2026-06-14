"use client";

import Image from "next/image";
import { Track, usePlayer } from "./PlayerContext";

type AlbumCardProps = {
  title: string;
  subtitle: string;
  track: Track & { cover?: string };
  onEdit?: () => void;
  hoverEffect?: "grow" | "shrink";
  coverTransform?: string;
};

export default function AlbumCard({
  title,
  subtitle,
  track,
  onEdit,
  hoverEffect = "grow",
  coverTransform,
}: AlbumCardProps) {
  const { playTrack } = usePlayer();

  const hoverClass =
    hoverEffect === "shrink"
      ? "group-hover:scale-[0.96]"
      : "group-hover:scale-[1.02]";

  return (
    <div className="group text-left relative">
      <button
        type="button"
        onClick={() => playTrack(track)}
        title="Lire"
        aria-label={`Lire ${title}`}
        className="cursor-pointer w-full text-left"
      >
        <div
          data-scroll-cover="1"
          className={[
            "scroll-edge-blur relative aspect-square w-full overflow-hidden rounded-3xl border border-white/5 bg-[#1A1A22] shadow-sm will-change-transform",
          ].join(" ")}
          style={coverTransform ? { transform: coverTransform } : undefined}
        >
          <div className={["relative h-full w-full transition-transform duration-200", hoverClass].join(" ")}>
            {track.cover ? (
              <Image
                src={track.cover}
                alt={title}
                fill
                className="object-cover"
                sizes="(max-width: 1024px) 50vw, 25vw"
                priority={false}
              />
            ) : null}
          </div>
        </div>
      </button>

      {onEdit ? (
        <button
          type="button"
          data-edit-button="1"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onEdit();
          }}
          className={[
            "absolute top-3 right-3 z-10",
            "h-10 w-10 rounded-full",
            "bg-black/55 border border-white/10 text-white/90",
            "opacity-0 pointer-events-none",
            "group-hover:opacity-100 group-hover:pointer-events-auto",
            "group-focus-within:opacity-100 group-focus-within:pointer-events-auto",
            "transition",
            "hover:bg-black/70",
          ].join(" ")}
          title="Modifier"
          aria-label={`Modifier ${title}`}
        >
          ✏️
        </button>
      ) : null}

      <div className="mt-3 pointer-events-none">
        <p className="text-sm text-white/90 truncate">{title}</p>
        <p className="text-xs text-white/45 truncate">{subtitle}</p>
      </div>
    </div>
  );
}
