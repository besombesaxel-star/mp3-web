"use client";

import Image from "next/image";
import { useMemo } from "react";
import { Heart, Play, Shuffle } from "lucide-react";
import { usePlayer } from "../PlayerContext";
import AudioBars from "../AudioBars";

export default function FavoritesPage() {
  const { favorites, setQueueAndPlay, toggleFavorite, track: currentTrack, playing } = usePlayer();

  const sorted = useMemo(() => {
    return [...favorites].sort((a, b) => a.title.localeCompare(b.title));
  }, [favorites]);

  function playShuffled() {
    if (!sorted.length) return;
    const shuffled = [...sorted].sort(() => Math.random() - 0.5);
    setQueueAndPlay(shuffled, 0);
  }

  return (
    <div className="pb-28">
      {/* Header */}
      <div className="flex items-end justify-between gap-6 mb-8">
        <div className="min-w-0">
          <h2 className="text-3xl font-light truncate">Favoris</h2>
          <p className="text-sm text-white/35 mt-2">
            {sorted.length} morceau{sorted.length > 1 ? "x" : ""}
          </p>
        </div>

        {sorted.length > 0 && (
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={playShuffled}
              className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 text-white/70 text-sm font-medium px-4 py-2 hover:bg-white/10 hover:text-white transition"
              title="Lecture aléatoire"
              type="button"
            >
              <Shuffle size={14} />
              Aléatoire
            </button>
            <button
              onClick={() => setQueueAndPlay(sorted, 0)}
              className="flex items-center gap-2 rounded-2xl bg-white text-black text-sm font-medium px-4 py-2 hover:opacity-90 transition"
              title="Tout lire"
              type="button"
            >
              <Play size={14} className="fill-black" />
              Tout lire
            </button>
          </div>
        )}
      </div>

      {sorted.length === 0 ? (
        <div className="rounded-3xl bg-[#15151C] border border-white/5 p-12 text-center mp3-fade-up">
          <Heart size={36} className="mx-auto mb-4 text-white/15" />
          <p className="text-white/60 font-medium">Aucun favori pour l&apos;instant</p>
          <p className="text-white/30 text-sm mt-2">Appuie sur le cœur dans le player pour en ajouter.</p>
        </div>
      ) : (
        <div className="space-y-1">
          {sorted.map((track, index) => {
            const isActive = currentTrack?.src === track.src;

            return (
              <div
                key={track.src}
                className={[
                  "group flex items-center gap-4 rounded-2xl border px-4 py-3 transition-colors duration-200 mp3-fade-up",
                  isActive
                    ? "bg-white/8 border-white/10"
                    : "bg-white/[0.03] border-white/5 hover:bg-white/6 hover:border-white/8",
                ].join(" ")}
                style={{ animationDelay: `${Math.min(index, 15) * 30}ms` }}
              >
                {/* Cover */}
                <div className="relative h-11 w-11 shrink-0 rounded-xl overflow-hidden bg-white/5">
                  {track.cover ? (
                    <Image
                      src={track.cover}
                      alt={track.title}
                      fill
                      className="object-cover"
                      sizes="44px"
                    />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center">
                      <Heart size={16} className="text-white/20" />
                    </div>
                  )}
                </div>

                {/* Title + artist */}
                <div className="min-w-0 flex-1">
                  <p className={["text-sm font-medium truncate transition-colors", isActive ? "text-white" : "text-white/85"].join(" ")}>
                    {track.title}
                  </p>
                  <p className="text-xs text-white/40 truncate mt-0.5">{track.artist ?? "—"}</p>
                </div>

                {/* Audio bars when playing */}
                {isActive && playing && (
                  <AudioBars bars={10} height={24} className="shrink-0 opacity-60" />
                )}

                {/* Actions */}
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => toggleFavorite(track)}
                    className="h-8 w-8 rounded-full flex items-center justify-center text-red-400 opacity-0 group-hover:opacity-100 hover:bg-white/8 transition"
                    title="Retirer des favoris"
                    type="button"
                  >
                    <Heart size={15} className="fill-red-400" />
                  </button>

                  <button
                    onClick={() => setQueueAndPlay(sorted, index)}
                    className={[
                      "h-8 w-8 rounded-full flex items-center justify-center transition",
                      isActive
                        ? "bg-white text-black"
                        : "bg-white/10 text-white opacity-0 group-hover:opacity-100 hover:bg-white/20",
                    ].join(" ")}
                    title="Lire"
                    type="button"
                  >
                    <Play size={13} className={isActive ? "fill-black ml-0.5" : "fill-white ml-0.5"} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
