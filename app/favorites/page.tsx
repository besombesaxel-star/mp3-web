"use client";

import { useMemo } from "react";
import { usePlayer } from "../PlayerContext";

export default function FavoritesPage() {
  const { favorites, setQueueAndPlay } = usePlayer();

  const sorted = useMemo(() => {
    return [...favorites].sort((a, b) => a.title.localeCompare(b.title));
  }, [favorites]);

  return (
    <div className="pb-28">
      <div className="flex items-end justify-between gap-6 mb-8">
        <div className="min-w-0">
          <h2 className="text-3xl font-light truncate">Favoris</h2>
          <p className="text-sm text-white/35 mt-2">
            {sorted.length} morceau{sorted.length > 1 ? "x" : ""}
          </p>
        </div>

        <button
          onClick={() => sorted.length && setQueueAndPlay(sorted, 0)}
          className="rounded-2xl bg-white text-black text-sm font-medium px-4 py-2 hover:opacity-90 transition disabled:opacity-50"
          disabled={!sorted.length}
          title="Tout lire"
          type="button"
        >
          Tout lire
        </button>
      </div>

      {sorted.length === 0 ? (
        <div className="rounded-3xl bg-[#15151C] border border-white/5 p-8 text-center">
          <p className="text-white/80">Aucun favori</p>
          <p className="text-white/35 text-sm mt-2">Ajoute un favori depuis le player.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {sorted.map((track, index) => (
            <div
              key={track.src}
              className="flex items-center justify-between gap-4 rounded-2xl bg-white/5 border border-white/5 p-4"
            >
              <div className="min-w-0">
                <p className="text-sm text-white/85 truncate">{track.title}</p>
                <p className="text-xs text-white/40 truncate">{track.artist ?? "-"}</p>
              </div>

              <button
                onClick={() => setQueueAndPlay(sorted, index)}
                className="h-10 px-4 rounded-full bg-white text-black text-sm font-medium hover:opacity-90 transition"
                title="Lire"
                type="button"
              >
                Play
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
