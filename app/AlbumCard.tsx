"use client";

import { useState } from "react";
import Image from "next/image";
import { Pencil } from "lucide-react";
import { Track, usePlayer } from "./PlayerContext";
import { useLongPress } from "./useLongPress";
import TrackContextMenu from "./TrackContextMenu";

type AlbumCardProps = {
  title: string;
  subtitle: string;
  track: Track & { cover?: string };
  onEdit?: () => void;
  hoverEffect?: "grow" | "shrink";
  coverTransform?: string;
  animationDelay?: string;
  selectMode?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
};

export default function AlbumCard({
  title,
  subtitle,
  track,
  onEdit,
  hoverEffect = "grow",
  coverTransform,
  animationDelay,
  selectMode = false,
  selected = false,
  onToggleSelect,
}: AlbumCardProps) {
  const { playTrack } = usePlayer();
  const [menuOpen, setMenuOpen] = useState(false);
  const longPress = useLongPress({ onLongPress: () => setMenuOpen(true) });

  return (
    <div
      className="group text-left relative mp3-fade-up"
      style={animationDelay ? { animationDelay } : undefined}
    >
      {selectMode ? (
        <button
          type="button"
          onClick={() => onToggleSelect?.()}
          aria-label={selected ? "Deselectionner" : "Selectionner"}
          aria-pressed={selected}
          className={[
            "absolute top-3 left-3 z-10 h-7 w-7 rounded-full border flex items-center justify-center transition",
            selected ? "bg-white border-white text-black" : "bg-black/55 border-white/30 text-transparent",
          ].join(" ")}
        >
          <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={3}>
            <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      ) : null}

      <button
        type="button"
        onClick={() => {
          if (longPress.didLongPress()) return;
          if (selectMode) {
            onToggleSelect?.();
            return;
          }
          playTrack(track);
        }}
        onTouchStart={longPress.onTouchStart}
        onTouchMove={longPress.onTouchMove}
        onTouchEnd={longPress.onTouchEnd}
        onTouchCancel={longPress.onTouchCancel}
        onContextMenu={longPress.onContextMenu}
        title="Lire"
        aria-label={`Lire ${title}`}
        className={[
          "cursor-pointer w-full text-left",
          selected ? "ring-2 ring-white rounded-3xl" : "",
        ].join(" ")}
      >
        <div
          data-scroll-cover="1"
          className={[
            "scroll-edge-blur relative aspect-square w-full overflow-hidden rounded-3xl border border-white/5 bg-[#1A1A22] shadow-sm will-change-transform",
            "transition-all duration-500 ease-out",
            hoverEffect === "shrink"
              ? "group-hover:scale-[0.96] group-hover:shadow-[0_0_32px_rgba(255,255,255,0.07)]"
              : "group-hover:shadow-[0_0_32px_rgba(255,255,255,0.07)]",
          ].join(" ")}
          style={coverTransform ? { transform: coverTransform } : undefined}
        >
          <div className={[
            "relative h-full w-full",
            hoverEffect === "grow" ? "transition-transform duration-500 ease-out group-hover:scale-[1.02]" : "",
          ].join(" ")}>
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
          <Pencil size={14} className="mx-auto" />
        </button>
      ) : null}

      <div className="mt-1.5 sm:mt-3 pointer-events-none transition-transform duration-200 group-hover:-translate-y-0.5">
        <p className="text-sm text-white/90 truncate transition-colors duration-200 group-hover:text-white">{title}</p>
        <p className="text-xs text-white/45 truncate transition-colors duration-200 group-hover:text-white/60">{subtitle}</p>
      </div>

      {menuOpen ? <TrackContextMenu track={track} onClose={() => setMenuOpen(false)} /> : null}
    </div>
  );
}
