"use client";

import { useMemo, useState } from "react";
import { usePlayer } from "@/app/PlayerContext";

function formatSeconds(s: number) {
  if (s < 60) return `${Math.round(s)}s`;
  if (s < 3600) return `${Math.floor(s / 60)}min`;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

function formatRelativeTime(timestamp: number) {
  const diffSeconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (diffSeconds < 60) return "à l'instant";
  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `il y a ${diffMinutes} min`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `il y a ${diffHours}h`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `il y a ${diffDays}j`;
  const diffMonths = Math.floor(diffDays / 30);
  return `il y a ${diffMonths} mois`;
}

function VerticalBars({
  data,
  maxValue,
  color,
  showLabelAt,
}: {
  data: { label: string; value: number }[];
  maxValue: number;
  color: string;
  showLabelAt?: Set<number>;
}) {
  return (
    <div>
      {/* Bars */}
      <div className="flex items-end gap-[3px] h-28">
        {data.map(({ label, value }, i) => (
          <div
            key={label}
            title={`${label} · ${value} écoute${value > 1 ? "s" : ""}`}
            className="flex-1 rounded-t-[3px] transition-all duration-500 cursor-default mp3-bar-grow"
            style={{
              height: `${maxValue > 0 ? Math.max((value / maxValue) * 100, value > 0 ? 3 : 0) : 0}%`,
              background: color,
              opacity: value === 0 ? 0.12 : 1,
              minHeight: 2,
              animationDelay: `${Math.min(i, 23) * 12}ms`,
            }}
          />
        ))}
      </div>
      {/* Labels row — separate from bars so alignment is always correct */}
      <div className="flex gap-[3px] mt-2">
        {data.map(({ label }, i) => (
          <div key={i} className="flex-1 text-center min-w-0">
            <span className="text-[9px] text-white/30 leading-none truncate block">
              {showLabelAt?.has(i) ? label : ""}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function HorizontalBar({
  label,
  value,
  maxValue,
  sub,
  color,
  rank,
}: {
  label: string;
  value: number;
  maxValue: number;
  sub: string;
  color: string;
  rank: number;
}) {
  const pct = maxValue > 0 ? (value / maxValue) * 100 : 0;
  return (
    <div
      className="flex items-center gap-3 mp3-fade-up"
      style={{ animationDelay: `${Math.min(rank - 1, 9) * 35}ms` }}
    >
      <span className="text-xs text-white/20 w-4 text-right shrink-0">{rank}</span>
      <div className="w-36 md:w-48 truncate text-sm text-white/75 shrink-0">{label}</div>
      <div className="flex-1 h-1.5 rounded-full bg-white/8 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      <div className="w-20 text-right text-xs text-white/35 shrink-0">{sub}</div>
    </div>
  );
}

export default function StatsPage() {
  const { stats } = usePlayer();

  const playsPerDay = useMemo(() => {
    const now = new Date();
    const days = Array.from({ length: 14 }, (_, i) => {
      const d = new Date(now);
      d.setDate(d.getDate() - (13 - i));
      return {
        label: d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" }),
        date: d.toDateString(),
        value: 0,
      };
    });
    for (const play of stats.recentPlays) {
      const ds = new Date(play.playedAt).toDateString();
      const day = days.find((d) => d.date === ds);
      if (day) day.value++;
    }
    return days;
  }, [stats.recentPlays]);

  const playsPerHour = useMemo(() => {
    const hours = Array.from({ length: 24 }, (_, i) => ({ label: `${i}h`, value: 0 }));
    for (const play of stats.recentPlays) {
      if (play.hour >= 0 && play.hour < 24) hours[play.hour].value++;
    }
    return hours;
  }, [stats.recentPlays]);

  const topTracks = useMemo(() =>
    Object.entries(stats.byTrack)
      .map(([, v]) => ({ label: v.title || "?", value: v.plays, sub: `${v.plays} écoute${v.plays > 1 ? "s" : ""}` }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6),
    [stats.byTrack]
  );

  const topArtists = useMemo(() =>
    Object.entries(stats.byArtist)
      .filter(([name]) => name !== "-")
      .map(([name, v]) => ({ label: name, value: v.seconds, sub: formatSeconds(v.seconds) }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6),
    [stats.byArtist]
  );

  const [now] = useState(() => Date.now());

  const topTracksMonth = useMemo(() => {
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
    const playsBySrc = new Map<string, number>();
    for (const play of stats.recentPlays) {
      if (play.playedAt < thirtyDaysAgo) continue;
      playsBySrc.set(play.src, (playsBySrc.get(play.src) ?? 0) + 1);
    }

    return [...playsBySrc.entries()]
      .map(([src, plays]) => {
        const track = stats.byTrack[src];
        return { label: track?.title || "?", value: plays, sub: `${plays} écoute${plays > 1 ? "s" : ""}` };
      })
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
  }, [stats.recentPlays, stats.byTrack, now]);

  const recentHistory = useMemo(() =>
    [...stats.recentPlays]
      .sort((a, b) => b.playedAt - a.playedAt)
      .slice(0, 15)
      .map((play) => ({
        src: play.src,
        playedAt: play.playedAt,
        title: stats.byTrack[play.src]?.title || "?",
        artist: stats.byTrack[play.src]?.artist,
      })),
    [stats.recentPlays, stats.byTrack]
  );

  const maxDay = Math.max(...playsPerDay.map((d) => d.value), 1);
  const maxHour = Math.max(...playsPerHour.map((h) => h.value), 1);
  const maxTrack = Math.max(...topTracks.map((t) => t.value), 1);
  const maxArtist = Math.max(...topArtists.map((a) => a.value), 1);
  const maxTrackMonth = Math.max(...topTracksMonth.map((t) => t.value), 1);
  const uniqueArtists = Object.keys(stats.byArtist).filter((k) => k !== "-").length;

  return (
    <div className="max-w-3xl lg:max-w-5xl xl:max-w-6xl mx-auto pb-[calc(11rem+env(safe-area-inset-bottom))] sm:pb-40">
      <h2 className="text-3xl font-light mb-8 mp3-fade-up">Statistiques</h2>

      {stats.totalPlays === 0 ? (
        <p className="text-center text-white/25 text-sm py-32">
          Écoute des sons pour générer des statistiques.
        </p>
      ) : (
        <div className="space-y-5">

          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Écoutes", value: stats.totalPlays.toLocaleString("fr-FR") },
              { label: "Temps total", value: formatSeconds(stats.totalListenSeconds) },
              { label: "Sons joués", value: stats.uniqueTracksPlayed },
              { label: "Artistes", value: uniqueArtists },
            ].map(({ label, value }, i) => (
              <div
                key={label}
                className="rounded-2xl border border-white/10 bg-white/4 px-4 py-4 transition hover:-translate-y-0.5 hover:bg-white/6 mp3-pop"
                style={{ animationDelay: `${i * 50}ms` }}
              >
                <p className="text-2xl font-light text-white/90 tabular-nums">{value}</p>
                <p className="text-xs text-white/35 mt-1">{label}</p>
              </div>
            ))}
          </div>

          {/* Plays per day */}
          <div className="rounded-2xl border border-white/10 bg-white/3 px-5 py-5 mp3-fade-up" style={{ animationDelay: "120ms" }}>
            <p className="text-xs font-medium text-white/40 uppercase tracking-wider mb-4">
              Écoutes · 14 derniers jours
            </p>
            <VerticalBars
              data={playsPerDay.map((d) => ({
                ...d,
                label: d.label.split(" ")[0], // just the day number: "16"
              }))}
              maxValue={maxDay}
              color="hsl(255, 70%, 65%)"
              showLabelAt={new Set([0, 2, 4, 6, 8, 10, 12])}
            />
          </div>

          {/* Hourly distribution */}
          <div className="rounded-2xl border border-white/10 bg-white/3 px-5 py-5 mp3-fade-up" style={{ animationDelay: "160ms" }}>
            <p className="text-xs font-medium text-white/40 uppercase tracking-wider mb-4">
              Distribution horaire
            </p>
            <VerticalBars
              data={playsPerHour}
              maxValue={maxHour}
              color="hsl(200, 70%, 60%)"
              showLabelAt={new Set([0, 6, 12, 18, 23])}
            />
          </div>

          {/* Top tracks + Top artists */}
          <div className="grid md:grid-cols-2 gap-5 mp3-fade-up" style={{ animationDelay: "200ms" }}>
            {topTracks.length > 0 && (
              <div className="rounded-2xl border border-white/10 bg-white/3 px-5 py-5">
                <p className="text-xs font-medium text-white/40 uppercase tracking-wider mb-4">
                  Top morceaux
                </p>
                <div className="space-y-3">
                  {topTracks.map((t, i) => (
                    <HorizontalBar
                      key={t.label + i}
                      rank={i + 1}
                      label={t.label}
                      value={t.value}
                      maxValue={maxTrack}
                      sub={t.sub}
                      color="hsl(255, 70%, 65%)"
                    />
                  ))}
                </div>
              </div>
            )}

            {topArtists.length > 0 && (
              <div className="rounded-2xl border border-white/10 bg-white/3 px-5 py-5">
                <p className="text-xs font-medium text-white/40 uppercase tracking-wider mb-4">
                  Top artistes
                </p>
                <div className="space-y-3">
                  {topArtists.map((a, i) => (
                    <HorizontalBar
                      key={a.label + i}
                      rank={i + 1}
                      label={a.label}
                      value={a.value}
                      maxValue={maxArtist}
                      sub={a.sub}
                      color="hsl(280, 65%, 65%)"
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Top tracks this month */}
          {topTracksMonth.length > 0 && (
            <div className="rounded-2xl border border-white/10 bg-white/3 px-5 py-5 mp3-fade-up" style={{ animationDelay: "240ms" }}>
              <p className="text-xs font-medium text-white/40 uppercase tracking-wider mb-4">
                Top morceaux · 30 derniers jours
              </p>
              <div className="space-y-3">
                {topTracksMonth.map((t, i) => (
                  <HorizontalBar
                    key={t.label + i}
                    rank={i + 1}
                    label={t.label}
                    value={t.value}
                    maxValue={maxTrackMonth}
                    sub={t.sub}
                    color="hsl(150, 60%, 55%)"
                  />
                ))}
              </div>
            </div>
          )}

          {/* Recent listening history */}
          {recentHistory.length > 0 && (
            <div className="rounded-2xl border border-white/10 bg-white/3 px-5 py-5 mp3-fade-up" style={{ animationDelay: "280ms" }}>
              <p className="text-xs font-medium text-white/40 uppercase tracking-wider mb-4">
                Historique récent
              </p>
              <div className="space-y-2.5">
                {recentHistory.map((play, i) => (
                  <div
                    key={`${play.src}-${play.playedAt}-${i}`}
                    className="flex items-center justify-between gap-3 mp3-fade-up"
                    style={{ animationDelay: `${280 + Math.min(i, 14) * 20}ms` }}
                  >
                    <div className="min-w-0">
                      <p className="text-sm text-white/80 truncate">{play.title}</p>
                      {play.artist && <p className="text-xs text-white/35 truncate">{play.artist}</p>}
                    </div>
                    <span className="text-xs text-white/30 shrink-0 tabular-nums">
                      {formatRelativeTime(play.playedAt)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Highlight: top track */}
          {stats.topTrack && (
            <div
              className="rounded-2xl border border-white/10 bg-white/3 px-5 py-4 flex items-center justify-between gap-4 mp3-fade-up"
              style={{ animationDelay: "320ms" }}
            >
              <div>
                <p className="text-xs text-white/30 mb-1">Morceau le plus écouté</p>
                <p className="text-sm font-medium text-white/85">{stats.topTrack.title}</p>
                {stats.topTrack.artist && (
                  <p className="text-xs text-white/40 mt-0.5">{stats.topTrack.artist}</p>
                )}
              </div>
              <div className="text-right shrink-0">
                <p className="text-2xl font-light text-white/70 tabular-nums">{stats.topTrack.plays}</p>
                <p className="text-xs text-white/25">écoutes</p>
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  );
}
