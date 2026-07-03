"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Download, Music, Sparkles, X } from "lucide-react";
import { usePlayer } from "@/app/PlayerContext";
import { ACHIEVEMENTS } from "@/lib/achievements";

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

function truncateToWidth(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let truncated = text;
  while (truncated.length > 1 && ctx.measureText(`${truncated}…`).width > maxWidth) {
    truncated = truncated.slice(0, -1);
  }
  return `${truncated}…`;
}

function downloadShareCard(data: {
  totalListenSeconds: number;
  totalPlays: number;
  uniqueTracksPlayed: number;
  topTrackTitle?: string;
  topArtistName?: string;
}) {
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1350;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const bg = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  bg.addColorStop(0, "#1a0b2e");
  bg.addColorStop(1, "#0a0612");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "rgba(139,92,246,0.22)";
  ctx.beginPath();
  ctx.arc(900, 160, 280, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(236,72,153,0.14)";
  ctx.beginPath();
  ctx.arc(120, 1250, 240, 0, Math.PI * 2);
  ctx.fill();

  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.font = "600 34px sans-serif";
  ctx.fillText("MON BILAN D'ÉCOUTE", 80, 140);

  ctx.fillStyle = "#ffffff";
  ctx.font = "300 128px sans-serif";
  ctx.fillText(formatDuration(data.totalListenSeconds), 80, 320);
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.font = "400 34px sans-serif";
  ctx.fillText("de musique écoutée", 80, 370);

  const blocks: Array<{ label: string; value: string }> = [
    { label: "Écoutes totales", value: String(data.totalPlays) },
    { label: "Morceaux uniques", value: String(data.uniqueTracksPlayed) },
  ];
  if (data.topArtistName) blocks.push({ label: "Artiste #1", value: data.topArtistName });
  if (data.topTrackTitle) blocks.push({ label: "Morceau #1", value: data.topTrackTitle });

  let y = 500;
  for (const block of blocks) {
    ctx.fillStyle = "rgba(255,255,255,0.4)";
    ctx.font = "500 28px sans-serif";
    ctx.fillText(block.label.toUpperCase(), 80, y);
    ctx.fillStyle = "#ffffff";
    ctx.font = "500 56px sans-serif";
    ctx.fillText(truncateToWidth(ctx, block.value, canvas.width - 160), 80, y + 66);
    y += 150;
  }

  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.font = "600 30px sans-serif";
  ctx.fillText("mp3-web", 80, canvas.height - 60);

  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "mon-bilan-ecoute.png";
    a.click();
    URL.revokeObjectURL(url);
  }, "image/png");
}

export default function WrappedPage() {
  const { stats } = usePlayer();
  const [slideIndex, setSlideIndex] = useState(0);
  const [now] = useState(() => Date.now());

  const topTracks = useMemo(
    () =>
      Object.values(stats.byTrack)
        .filter((t) => t.plays > 0)
        .sort((a, b) => b.plays - a.plays)
        .slice(0, 5),
    [stats.byTrack]
  );

  const recentPlaysCount = useMemo(() => {
    const cutoff = now - 30 * 24 * 60 * 60 * 1000;
    return stats.recentPlays.filter((p) => p.playedAt >= cutoff).length;
  }, [stats.recentPlays, now]);

  const firstPlayedAt = useMemo(() => {
    const values = Object.values(stats.firstPlayedAtByTrack);
    if (values.length === 0) return null;
    return Math.min(...values);
  }, [stats.firstPlayedAtByTrack]);

  const unlockedCount = Object.keys(stats.achievements ?? {}).length;

  if (stats.totalPlays === 0) {
    return (
      <div className="max-w-lg mx-auto pb-[calc(11rem+env(safe-area-inset-bottom))] sm:pb-40 pt-24 text-center px-6">
        <Sparkles size={28} className="mx-auto text-white/25 mb-4" />
        <p className="text-white/60 text-sm">
          Écoute quelques morceaux pour débloquer ton bilan personnalisé.
        </p>
        <Link href="/" className="mt-4 inline-block text-sm text-white/70 underline underline-offset-4">
          Retour à l&apos;accueil
        </Link>
      </div>
    );
  }

  const slides = [
    {
      key: "intro",
      content: (
        <>
          <Sparkles size={30} className="text-white/70 mb-5 mp3-pop" />
          <p className="text-xs uppercase tracking-[0.25em] text-white/35 mb-3">Ton bilan d&apos;écoute</p>
          <p className="text-6xl font-light text-white/95 tabular-nums">{stats.totalPlays}</p>
          <p className="text-sm text-white/50 mt-2">écoutes au total</p>
          {recentPlaysCount > 0 ? (
            <p className="text-xs text-white/30 mt-6">{recentPlaysCount} ces 30 derniers jours</p>
          ) : null}
          {firstPlayedAt ? (
            <p className="text-xs text-white/25 mt-1">
              Premier morceau écouté le{" "}
              {new Date(firstPlayedAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
            </p>
          ) : null}
        </>
      ),
    },
    {
      key: "time",
      content: (
        <>
          <p className="text-xs uppercase tracking-[0.25em] text-white/35 mb-3">Temps d&apos;écoute cumulé</p>
          <p className="text-6xl font-light text-white/95">{formatDuration(stats.totalListenSeconds)}</p>
          <p className="text-sm text-white/50 mt-2">
            sur {stats.uniqueTracksPlayed} morceau{stats.uniqueTracksPlayed > 1 ? "x" : ""} différent
            {stats.uniqueTracksPlayed > 1 ? "s" : ""}
          </p>
        </>
      ),
    },
    ...(stats.topTrack
      ? [
          {
            key: "top-track",
            content: (
              <>
                <p className="text-xs uppercase tracking-[0.25em] text-white/35 mb-5">Ton morceau #1</p>
                <div className="h-28 w-28 rounded-3xl overflow-hidden bg-white/8 border border-white/10 mb-5 mp3-scale-in flex items-center justify-center">
                  <Music size={30} className="text-white/25" />
                </div>
                <p className="text-2xl font-medium text-white/95 max-w-[280px]">{stats.topTrack.title}</p>
                {stats.topTrack.artist ? <p className="text-sm text-white/45 mt-1">{stats.topTrack.artist}</p> : null}
                <p className="text-xs text-white/30 mt-4">
                  {stats.topTrack.plays} écoute{stats.topTrack.plays > 1 ? "s" : ""}
                </p>
              </>
            ),
          },
        ]
      : []),
    ...(stats.topArtist
      ? [
          {
            key: "top-artist",
            content: (
              <>
                <p className="text-xs uppercase tracking-[0.25em] text-white/35 mb-5">Ton artiste #1</p>
                <p className="text-3xl font-medium text-white/95 max-w-[280px]">{stats.topArtist.name}</p>
                <p className="text-xs text-white/30 mt-4">
                  {stats.topArtist.plays} écoute{stats.topArtist.plays > 1 ? "s" : ""} ·{" "}
                  {formatDuration(stats.topArtist.seconds)}
                </p>
              </>
            ),
          },
        ]
      : []),
    ...(topTracks.length > 0
      ? [
          {
            key: "top5",
            content: (
              <>
                <p className="text-xs uppercase tracking-[0.25em] text-white/35 mb-5">Ton top 5</p>
                <div className="w-full max-w-[300px] space-y-2.5">
                  {topTracks.map((t, i) => (
                    <div key={`${t.title}-${i}`} className="flex items-center gap-3 mp3-fade-up" style={{ animationDelay: `${i * 60}ms` }}>
                      <span className="text-white/25 text-sm w-4 shrink-0">{i + 1}</span>
                      <div className="min-w-0 flex-1 text-left">
                        <p className="text-sm text-white/85 truncate">{t.title}</p>
                        {t.artist ? <p className="text-xs text-white/35 truncate">{t.artist}</p> : null}
                      </div>
                      <span className="text-xs text-white/30 shrink-0 tabular-nums">{t.plays}</span>
                    </div>
                  ))}
                </div>
              </>
            ),
          },
        ]
      : []),
    {
      key: "badges",
      content: (
        <>
          <p className="text-xs uppercase tracking-[0.25em] text-white/35 mb-5">Badges débloqués</p>
          <p className="text-6xl font-light text-white/95">
            {unlockedCount}
            <span className="text-2xl text-white/35">/{ACHIEVEMENTS.length}</span>
          </p>
          <div className="flex items-center gap-2 mt-5">
            {ACHIEVEMENTS.map((a) => (
              <span
                key={a.id}
                className={["text-2xl", stats.achievements?.[a.id] ? "" : "opacity-15 grayscale"].join(" ")}
                title={a.title}
              >
                {a.icon}
              </span>
            ))}
          </div>
        </>
      ),
    },
    {
      key: "share",
      content: (
        <>
          <Sparkles size={30} className="text-white/70 mb-5" />
          <p className="text-xl text-white/85 max-w-[280px]">C&apos;est tout pour ce bilan.</p>
          <p className="text-sm text-white/40 mt-2">Emporte-le avec toi.</p>
          <button
            type="button"
            onClick={() =>
              downloadShareCard({
                totalListenSeconds: stats.totalListenSeconds,
                totalPlays: stats.totalPlays,
                uniqueTracksPlayed: stats.uniqueTracksPlayed,
                topTrackTitle: stats.topTrack?.title,
                topArtistName: stats.topArtist?.name,
              })
            }
            className="mt-7 h-11 px-5 rounded-full bg-white text-black text-sm font-medium hover:opacity-90 transition inline-flex items-center gap-2"
          >
            <Download size={16} />
            Télécharger l&apos;image
          </button>
        </>
      ),
    },
  ];

  const total = slides.length;
  const current = slides[Math.min(slideIndex, total - 1)];

  function goNext() {
    setSlideIndex((i) => Math.min(i + 1, total - 1));
  }
  function goPrev() {
    setSlideIndex((i) => Math.max(i - 1, 0));
  }

  return (
    <div className="fixed inset-0 z-[70] bg-[#0a0612] flex flex-col">
      <div className="flex items-center gap-1.5 px-4 pt-[calc(env(safe-area-inset-top)+12px)]">
        {slides.map((s, i) => (
          <div key={s.key} className="h-[3px] flex-1 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full bg-white/80 transition-all duration-300"
              style={{ width: i <= slideIndex ? "100%" : "0%" }}
            />
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between px-4 py-3">
        <Image src="/icon-192.png" alt="" width={22} height={22} className="rounded-md opacity-70" />
        <Link
          href="/stats"
          aria-label="Fermer le bilan"
          className="h-8 w-8 rounded-full flex items-center justify-center text-white/50 hover:text-white/90 hover:bg-white/10 transition"
        >
          <X size={18} />
        </Link>
      </div>

      <div className="relative flex-1 flex items-center justify-center px-8">
        <button
          type="button"
          onClick={goPrev}
          disabled={slideIndex === 0}
          aria-label="Precedent"
          className="absolute left-2 sm:left-6 h-10 w-10 rounded-full flex items-center justify-center text-white/30 hover:text-white/70 hover:bg-white/5 transition disabled:opacity-0"
        >
          <ChevronLeft size={22} />
        </button>

        <div key={current.key} className="flex flex-col items-center text-center mp3-fade-up max-w-md">
          {current.content}
        </div>

        <button
          type="button"
          onClick={goNext}
          disabled={slideIndex === total - 1}
          aria-label="Suivant"
          className="absolute right-2 sm:right-6 h-10 w-10 rounded-full flex items-center justify-center text-white/30 hover:text-white/70 hover:bg-white/5 transition disabled:opacity-0"
        >
          <ChevronRight size={22} />
        </button>
      </div>

      <div className="pb-[calc(env(safe-area-inset-bottom)+28px)]" />
    </div>
  );
}
