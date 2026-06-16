"use client";

import { useMemo } from "react";
import { usePlayer } from "@/app/PlayerContext";

function formatSeconds(s: number) {
  if (s < 60) return `${Math.round(s)}s`;
  if (s < 3600) return `${Math.floor(s / 60)}min`;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
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
        {data.map(({ label, value }) => (
          <div
            key={label}
            title={`${label} · ${value} écoute${value > 1 ? "s" : ""}`}
            className="flex-1 rounded-t-[3px] transition-all duration-500 cursor-default"
            style={{
              height: `${maxValue > 0 ? Math.max((value / maxValue) * 100, value > 0 ? 3 : 0) : 0}%`,
              background: color,
              opacity: value === 0 ? 0.12 : 1,
              minHeight: 2,
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
    <div className="flex items-center gap-3">
      <span className="text-xs text-white/20 w-4 text-right shrink-0">{rank}</span>
      <div className="w-36 truncate text-sm text-white/75 shrink-0">{label}</div>
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

  const maxDay = Math.max(...playsPerDay.map((d) => d.value), 1);
  const maxHour = Math.max(...playsPerHour.map((h) => h.value), 1);
  const maxTrack = Math.max(...topTracks.map((t) => t.value), 1);
  const maxArtist = Math.max(...topArtists.map((a) => a.value), 1);
  const uniqueArtists = Object.keys(stats.byArtist).filter((k) => k !== "-").length;

  return (
    <div className="max-w-3xl mx-auto pb-40">
      <h2 className="text-3xl font-light mb-8">Statistiques</h2>

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
            ].map(({ label, value }) => (
              <div key={label} className="rounded-2xl border border-white/10 bg-white/4 px-4 py-4">
                <p className="text-2xl font-light text-white/90 tabular-nums">{value}</p>
                <p className="text-xs text-white/35 mt-1">{label}</p>
              </div>
            ))}
          </div>

          {/* Plays per day */}
          <div className="rounded-2xl border border-white/10 bg-white/3 px-5 py-5">
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
          <div className="rounded-2xl border border-white/10 bg-white/3 px-5 py-5">
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
          <div className="grid md:grid-cols-2 gap-5">
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

          {/* Highlight: top track */}
          {stats.topTrack && (
            <div className="rounded-2xl border border-white/10 bg-white/3 px-5 py-4 flex items-center justify-between gap-4">
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
