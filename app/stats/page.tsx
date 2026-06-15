"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { BarChart3, Clock, Flame, Music, Play, RotateCcw, User } from "lucide-react";
import { usePlayer } from "../PlayerContext";

function formatDuration(totalSeconds: number) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;

  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${rest}s`;
  return `${rest}s`;
}

function formatInt(value: number) {
  return Math.max(0, Math.floor(Number.isFinite(value) ? value : 0)).toString();
}

function startOfDayMs(ts: number) {
  const date = new Date(ts);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

export default function StatsPage() {
  const { stats, resetStats, setQueueAndPlay } = usePlayer();
  const [showAllTracks, setShowAllTracks] = useState(false);
  const [showAllArtists, setShowAllArtists] = useState(false);
  const [nowMs, setNowMs] = useState(0);
  const [coverBySrc, setCoverBySrc] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    const tick = () => setNowMs(Date.now());
    tick();
    const intervalId = window.setInterval(tick, 60_000);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    fetch("/api/tracks", { cache: "no-store" })
      .then((r) => r.json())
      .then((json) => {
        const map = new Map<string, string>();
        const tracks = Array.isArray(json.tracks) ? json.tracks : [];
        for (const t of tracks) {
          if (t.src && t.cover) map.set(t.src, t.cover);
        }
        setCoverBySrc(map);
      })
      .catch(() => {});
  }, []);

  const rankedTracks = useMemo(() => {
    const items = Object.entries(stats.byTrack).map(([src, value]) => ({
      src,
      title: value.title || "Unknown",
      artist: value.artist,
      seconds: value.seconds || 0,
      plays: value.plays || 0,
    }));
    items.sort((a, b) => b.seconds !== a.seconds ? b.seconds - a.seconds : b.plays - a.plays);
    return items;
  }, [stats.byTrack]);

  const rankedArtists = useMemo(() => {
    const items = Object.entries(stats.byArtist).map(([name, value]) => ({
      name,
      seconds: value.seconds || 0,
      plays: value.plays || 0,
    }));
    items.sort((a, b) => b.seconds !== a.seconds ? b.seconds - a.seconds : b.plays - a.plays);
    return items;
  }, [stats.byArtist]);

  const maxTrackSeconds = rankedTracks[0]?.seconds || 1;
  const maxArtistSeconds = rankedArtists[0]?.seconds || 1;

  const tracksToShow = showAllTracks ? rankedTracks : rankedTracks.slice(0, 10);
  const artistsToShow = showAllArtists ? rankedArtists : rankedArtists.slice(0, 10);

  const personalSummary = useMemo(() => {
    const weekAgo = nowMs - 7 * 24 * 60 * 60 * 1000;
    const avgSecondsBySrc = new Map<string, number>();

    for (const [src, value] of Object.entries(stats.byTrack)) {
      const plays = Math.max(1, value.plays || 0);
      avgSecondsBySrc.set(src, (value.seconds || 0) / plays);
    }

    let weeklyListenSeconds = 0;
    const weeklyArtistMap = new Map<string, { seconds: number; plays: number }>();
    const weeklyActiveDaySet = new Set<number>();
    const allActiveDaySet = new Set<number>();

    for (const event of stats.recentPlays) {
      const dayMs = startOfDayMs(event.playedAt);
      allActiveDaySet.add(dayMs);
      if (event.playedAt < weekAgo) continue;

      const avgTrackSeconds = avgSecondsBySrc.get(event.src) ?? 0;
      weeklyListenSeconds += avgTrackSeconds;
      weeklyActiveDaySet.add(dayMs);

      const artistName = stats.byTrack[event.src]?.artist?.trim() || "-";
      const previous = weeklyArtistMap.get(artistName) ?? { seconds: 0, plays: 0 };
      weeklyArtistMap.set(artistName, {
        seconds: previous.seconds + avgTrackSeconds,
        plays: previous.plays + 1,
      });
    }

    let weeklyTopArtistName = "-";
    let weeklyTopArtistSeconds = 0;
    let weeklyTopArtistPlays = 0;
    for (const [name, value] of weeklyArtistMap.entries()) {
      if (value.seconds > weeklyTopArtistSeconds || (value.seconds === weeklyTopArtistSeconds && value.plays > weeklyTopArtistPlays)) {
        weeklyTopArtistName = name;
        weeklyTopArtistSeconds = value.seconds;
        weeklyTopArtistPlays = value.plays;
      }
    }

    const today = startOfDayMs(nowMs);
    let streakDays = 0;
    let cursor = today;
    while (allActiveDaySet.has(cursor)) {
      streakDays += 1;
      cursor -= 24 * 60 * 60 * 1000;
    }

    const weeklySecondsByDay = new Map<number, number>();
    for (const event of stats.recentPlays) {
      if (event.playedAt < weekAgo) continue;
      const dayMs = startOfDayMs(event.playedAt);
      const avgTrackSeconds = avgSecondsBySrc.get(event.src) ?? 0;
      weeklySecondsByDay.set(dayMs, (weeklySecondsByDay.get(dayMs) ?? 0) + avgTrackSeconds);
    }

    const weekDays = Array.from({ length: 7 }, (_, i) => {
      const dayMs = today - (6 - i) * 24 * 60 * 60 * 1000;
      const date = new Date(dayMs);
      return {
        active: weeklyActiveDaySet.has(dayMs),
        seconds: weeklySecondsByDay.get(dayMs) ?? 0,
        dayNum: date.getDate(),
        dayName: ["D", "L", "M", "M", "J", "V", "S"][date.getDay()],
        isToday: dayMs === today,
      };
    });

    return { weeklyListenSeconds, weeklyTopArtistName, weeklyTopArtistPlays, weeklyActiveDays: weeklyActiveDaySet.size, streakDays, weekDays };
  }, [nowMs, stats.byTrack, stats.recentPlays]);

  return (
    <div className="pb-28">
      {/* Header */}
      <div className="flex items-end justify-between gap-6 mb-8">
        <div className="min-w-0">
          <h2 className="text-3xl font-light truncate">Stats</h2>
          <p className="text-sm text-white/35 mt-2">{formatInt(stats.totalPlays)} lectures au total</p>
        </div>
        <button
          onClick={resetStats}
          className="flex items-center gap-2 rounded-2xl bg-white/5 border border-white/10 text-white/50 text-sm px-4 py-2 hover:bg-white/10 hover:text-white/80 transition"
          title="Réinitialiser"
          type="button"
        >
          <RotateCcw size={13} />
          Réinitialiser
        </button>
      </div>

      {/* Top 4 cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
        {[
          { icon: Clock, label: "Temps total", value: formatDuration(stats.totalListenSeconds), sub: null, delay: 0 },
          { icon: Music, label: "Titres joués", value: formatInt(stats.uniqueTracksPlayed), sub: `${formatInt(stats.totalPlays)} lectures`, delay: 60 },
          { icon: Flame, label: "Streak", value: `${personalSummary.streakDays}j`, sub: personalSummary.streakDays > 1 ? "jours consécutifs" : "jour consécutif", delay: 120 },
          { icon: Clock, label: "Cette semaine", value: formatDuration(personalSummary.weeklyListenSeconds), sub: `${personalSummary.weeklyActiveDays}/7 jours actifs`, delay: 180 },
        ].map(({ icon: Icon, label, value, sub, delay }) => (
          <div key={label} className="rounded-3xl bg-[#15151C] border border-white/5 p-5 mp3-fade-up" style={{ animationDelay: `${delay}ms` }}>
            <div className="flex items-center gap-2 mb-3">
              <Icon size={14} className="text-white/30" />
              <p className="text-xs text-white/40">{label}</p>
            </div>
            <p className="text-2xl text-white/90 font-light tabular-nums">{value}</p>
            {sub && <p className="text-[11px] text-white/30 mt-1.5">{sub}</p>}
          </div>
        ))}
      </div>

      {/* Weekly activity + top artist */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
        <div className="rounded-3xl bg-[#15151C] border border-white/5 p-5 mp3-fade-up" style={{ animationDelay: "240ms" }}>
          <div className="flex items-center justify-between gap-2 mb-5">
            <div className="flex items-center gap-2">
              <BarChart3 size={14} className="text-white/30" />
              <p className="text-xs text-white/40">Activité des 7 derniers jours</p>
            </div>
            <p className="text-xs text-white/30 tabular-nums">{personalSummary.weeklyActiveDays}/7 jours</p>
          </div>
          {(() => {
            const maxSec = Math.max(...personalSummary.weekDays.map(d => d.seconds), 1);
            return (
              <div className="flex items-end gap-1.5 h-16">
                {personalSummary.weekDays.map((day, i) => {
                  const ratio = day.seconds > 0 ? day.seconds / maxSec : 0;
                  const barH = day.active ? Math.max(14, Math.round(ratio * 48)) : 4;
                  return (
                    <div key={i} className="group flex-1 flex flex-col items-center gap-2 cursor-default">
                      {day.seconds > 0 && (
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-150 text-[9px] text-white/50 tabular-nums whitespace-nowrap">
                          {formatDuration(day.seconds)}
                        </div>
                      )}
                      <div className="flex-1 flex items-end w-full">
                        <div
                          className={[
                            "w-full rounded-full transition-all duration-700",
                            day.isToday
                              ? "bg-white/90"
                              : day.active
                              ? "bg-white/45 group-hover:bg-white/65"
                              : "bg-white/8",
                          ].join(" ")}
                          style={{ height: `${barH}px` }}
                        />
                      </div>
                      <div className="flex flex-col items-center gap-0.5">
                        <span className={["text-[10px] tabular-nums font-medium", day.isToday ? "text-white/80" : "text-white/25"].join(" ")}>{day.dayNum}</span>
                        <span className={["text-[9px]", day.isToday ? "text-white/50" : "text-white/20"].join(" ")}>{day.dayName}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>

        <div className="rounded-3xl bg-[#15151C] border border-white/5 p-5 mp3-fade-up" style={{ animationDelay: "280ms" }}>
          <div className="flex items-center gap-2 mb-3">
            <User size={14} className="text-white/30" />
            <p className="text-xs text-white/40">Top artiste (7 jours)</p>
          </div>
          <p className="text-xl text-white/90 font-light truncate">{personalSummary.weeklyTopArtistName}</p>
          {personalSummary.weeklyTopArtistPlays > 0 && (
            <p className="text-[11px] text-white/30 mt-1.5 tabular-nums">{formatInt(personalSummary.weeklyTopArtistPlays)} lectures cette semaine</p>
          )}

          {stats.topArtist && (
            <>
              <div className="mt-4 h-px bg-white/8" />
              <p className="text-xs text-white/40 mt-4 mb-1">Artiste all-time</p>
              <p className="text-base text-white/80 truncate">{stats.topArtist.name}</p>
              <p className="text-[11px] text-white/30 mt-1 tabular-nums">{formatDuration(stats.topArtist.seconds)} · {stats.topArtist.plays} lectures</p>
            </>
          )}
        </div>
      </div>

      {/* Top tracks + top artists */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Top titres */}
        <div className="rounded-3xl bg-[#15151C] border border-white/5 p-5 mp3-fade-up" style={{ animationDelay: "320ms" }}>
          <div className="flex items-end justify-between gap-4 mb-4">
            <div className="flex items-center gap-2">
              <Music size={14} className="text-white/30" />
              <h3 className="text-sm text-white/70 font-medium">Top titres</h3>
            </div>
            {rankedTracks.length > 10 && (
              <button type="button" onClick={() => setShowAllTracks(v => !v)} className="text-xs text-white/35 hover:text-white/70 transition">
                {showAllTracks ? "Voir moins" : "Voir plus"}
              </button>
            )}
          </div>

          {rankedTracks.length === 0 ? (
            <p className="text-sm text-white/35 py-4 text-center">Lance quelques morceaux pour générer des stats.</p>
          ) : (
            <div className="space-y-1">
              {tracksToShow.map((track, index) => (
                <div key={track.src} className="group flex items-center gap-3 rounded-2xl px-3 py-2.5 hover:bg-white/5 transition">
                  <span className="text-xs text-white/25 tabular-nums w-5 shrink-0 text-right">{index + 1}</span>

                  <div className="h-9 w-9 shrink-0 rounded-xl overflow-hidden bg-white/5 relative">
                    {coverBySrc.get(track.src) ? (
                      <Image src={coverBySrc.get(track.src)!} alt={track.title} fill className="object-cover" sizes="36px" />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center">
                        <Music size={12} className="text-white/20" />
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-white/85 truncate">{track.title}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <div className="flex-1 h-1 rounded-full bg-white/8 overflow-hidden">
                        <div className="h-full bg-white/40 rounded-full transition-all duration-700" style={{ width: `${(track.seconds / maxTrackSeconds) * 100}%` }} />
                      </div>
                      <span className="text-[10px] text-white/30 tabular-nums shrink-0">{formatDuration(track.seconds)}</span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setQueueAndPlay([{ title: track.title, artist: track.artist, src: track.src, cover: coverBySrc.get(track.src) }], 0)}
                    className="h-7 w-7 rounded-full bg-white/0 group-hover:bg-white/10 flex items-center justify-center transition opacity-0 group-hover:opacity-100"
                    title="Lire"
                  >
                    <Play size={11} className="fill-white text-white ml-0.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top artistes */}
        <div className="rounded-3xl bg-[#15151C] border border-white/5 p-5 mp3-fade-up" style={{ animationDelay: "360ms" }}>
          <div className="flex items-end justify-between gap-4 mb-4">
            <div className="flex items-center gap-2">
              <User size={14} className="text-white/30" />
              <h3 className="text-sm text-white/70 font-medium">Top artistes</h3>
            </div>
            {rankedArtists.length > 10 && (
              <button type="button" onClick={() => setShowAllArtists(v => !v)} className="text-xs text-white/35 hover:text-white/70 transition">
                {showAllArtists ? "Voir moins" : "Voir plus"}
              </button>
            )}
          </div>

          {rankedArtists.length === 0 ? (
            <p className="text-sm text-white/35 py-4 text-center">Lance quelques morceaux pour générer des stats.</p>
          ) : (
            <div className="space-y-1">
              {artistsToShow.map((artist, index) => (
                <div key={artist.name} className="flex items-center gap-3 rounded-2xl px-3 py-2.5">
                  <span className="text-xs text-white/25 tabular-nums w-5 shrink-0 text-right">{index + 1}</span>

                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-white/85 truncate">{artist.name}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <div className="flex-1 h-1 rounded-full bg-white/8 overflow-hidden">
                        <div className="h-full bg-white/40 rounded-full transition-all duration-700" style={{ width: `${(artist.seconds / maxArtistSeconds) * 100}%` }} />
                      </div>
                      <span className="text-[10px] text-white/30 tabular-nums shrink-0">{formatDuration(artist.seconds)}</span>
                    </div>
                  </div>

                  <span className="text-[11px] text-white/25 tabular-nums shrink-0">{formatInt(artist.plays)} lect.</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
