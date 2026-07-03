"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Music, Play, TrendingUp } from "lucide-react";
import { useAuth } from "@/app/AuthProvider";
import { usePlayer, type Track } from "@/app/PlayerContext";
import { fetchTracksShared } from "@/app/tracksCache";
import { getArtistHref } from "@/lib/publicLinks";

type TopEntry = {
  src: string;
  title: string;
  artist?: string;
  plays: number;
  seconds: number;
};

type Period = "all" | "week" | "month";

const PERIOD_TABS: { value: Period; label: string }[] = [
  { value: "week", label: "Cette semaine" },
  { value: "month", label: "Ce mois" },
  { value: "all", label: "Toujours" },
];

function formatListenTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h${m > 0 ? m + "min" : ""}`;
  if (m > 0) return `${m}min`;
  return `${Math.floor(seconds)}s`;
}

export default function TopPage() {
  const { accessToken } = useAuth();
  const { setQueueAndPlay } = usePlayer();
  const [top, setTop] = useState<TopEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [coverBySrc, setCoverBySrc] = useState<Map<string, string>>(new Map());
  const [period, setPeriod] = useState<Period>("week");

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [topRes, libraryTracks] = await Promise.all([
          fetch(`/api/stats/global?period=${period}`),
          fetchTracksShared(accessToken),
        ]);

        const json = await topRes.json().catch(() => ({ top: [] }));
        setTop(Array.isArray(json.top) ? json.top : []);

        const map = new Map<string, string>();
        for (const t of libraryTracks) {
          if (t.cover) map.set(t.src, t.cover);
        }
        setCoverBySrc(map);
      } catch {
        setTop([]);
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [accessToken, period]);

  const queue = useMemo<Track[]>(
    () =>
      top.map((entry) => ({
        title: entry.title,
        artist: entry.artist,
        src: entry.src,
        cover: coverBySrc.get(entry.src),
      })),
    [top, coverBySrc]
  );

  return (
    <div className="max-w-2xl mx-auto pb-[calc(11rem+env(safe-area-inset-bottom))] sm:pb-28">
      <div className="flex items-start justify-between mb-6 mp3-fade-up">
        <div>
          <h2 className="text-3xl font-light">Top global</h2>
          <p className="text-sm text-white/35 mt-1">Morceaux les plus joués sur la plateforme</p>
        </div>
        {!loading && top.length > 0 && (
          <button
            type="button"
            onClick={() => setQueueAndPlay(queue, 0)}
            className="flex items-center gap-2 h-9 px-4 rounded-full bg-white/8 border border-white/10 text-xs text-white/60 hover:bg-white/12 transition shrink-0"
          >
            <Play size={11} className="fill-current" />
            Tout écouter
          </button>
        )}
      </div>

      <div className="flex items-center gap-1.5 mb-8 mp3-fade-up" style={{ animationDelay: "30ms" }}>
        {PERIOD_TABS.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            onClick={() => setPeriod(value)}
            className={[
              "h-8 px-3.5 rounded-full text-sm transition",
              period === value
                ? "bg-white text-black font-medium"
                : "bg-white/8 text-white/60 hover:bg-white/12 hover:text-white/85",
            ].join(" ")}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-1">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="flex items-center gap-3 rounded-2xl px-3 py-2.5">
              <div className="w-7 shrink-0" />
              <div className="h-10 w-10 shrink-0 rounded-xl bg-white/5 animate-pulse" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 w-1/2 rounded-full bg-white/5 animate-pulse" />
                <div className="h-2.5 w-1/3 rounded-full bg-white/4 animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      ) : top.length === 0 ? (
        <div className="py-20 text-center">
          <TrendingUp size={32} className="mx-auto mb-4 text-white/10" />
          <p className="text-white/35 text-sm">
            {period === "all"
              ? "Aucune donnée d'écoute disponible."
              : `Aucune écoute sur ${period === "week" ? "les 7 derniers jours" : "les 30 derniers jours"}.`}
          </p>
          <p className="text-white/20 text-xs mt-1">Les écoutes apparaîtront ici après synchronisation.</p>
        </div>
      ) : (
        <div className="space-y-0.5">
          {top.map((entry, idx) => {
            const cover = coverBySrc.get(entry.src);
            const listenTime = formatListenTime(entry.seconds);
            return (
              <div
                key={entry.src}
                className="group flex items-center gap-3 rounded-2xl px-3 py-2.5 hover:bg-white/5 transition cursor-pointer mp3-fade-up"
                style={{ animationDelay: `${Math.min(idx, 14) * 20}ms` }}
                onClick={() => setQueueAndPlay(queue, idx)}
              >
                <div className="w-7 shrink-0 text-center text-sm text-white/20 tabular-nums font-light">
                  {idx + 1}
                </div>

                <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-xl bg-white/5">
                  {cover ? (
                    <Image src={cover} alt={entry.title} fill className="object-cover" sizes="40px" />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center">
                      <Music size={13} className="text-white/20" />
                    </div>
                  )}
                  <div className="absolute inset-0 flex items-center justify-center bg-black/45 opacity-0 group-hover:opacity-100 transition">
                    <Play size={12} className="fill-white text-white ml-0.5" />
                  </div>
                </div>

                <div className="min-w-0 flex-1">
                  <p className="text-sm text-white/85 truncate">{entry.title}</p>
                  {entry.artist ? (
                    <Link
                      href={getArtistHref(entry.artist)}
                      onClick={(e) => e.stopPropagation()}
                      className="text-xs text-white/40 hover:text-white/65 transition truncate block"
                    >
                      {entry.artist}
                    </Link>
                  ) : null}
                </div>

                <div className="shrink-0 text-right">
                  <p className="text-xs text-white/55 tabular-nums">
                    {entry.plays} écoute{entry.plays > 1 ? "s" : ""}
                  </p>
                  {listenTime ? (
                    <p className="text-[11px] text-white/25 tabular-nums">{listenTime}</p>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
