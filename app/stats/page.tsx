"use client";

import { useEffect, useMemo, useState } from "react";
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

  useEffect(() => {
    const tick = () => setNowMs(Date.now());
    tick();
    const intervalId = window.setInterval(tick, 60_000);
    return () => window.clearInterval(intervalId);
  }, []);

  const topArtistLabel = useMemo(() => {
    if (!stats.topArtist) return "-";
    return `${stats.topArtist.name} - ${formatDuration(stats.topArtist.seconds)} - ${stats.topArtist.plays} lecture(s)`;
  }, [stats.topArtist]);

  const topTrackLabel = useMemo(() => {
    if (!stats.topTrack) return "-";
    const artist = stats.topTrack.artist ? ` - ${stats.topTrack.artist}` : "";
    return `${stats.topTrack.title}${artist} - ${formatDuration(stats.topTrack.seconds)} - ${stats.topTrack.plays} lecture(s)`;
  }, [stats.topTrack]);

  const rankedTracks = useMemo(() => {
    const items = Object.entries(stats.byTrack).map(([src, value]) => ({
      src,
      title: value.title || "Unknown",
      artist: value.artist,
      seconds: value.seconds || 0,
      plays: value.plays || 0,
    }));

    items.sort((a, b) => {
      if (b.seconds !== a.seconds) return b.seconds - a.seconds;
      return b.plays - a.plays;
    });

    return items;
  }, [stats.byTrack]);

  const rankedArtists = useMemo(() => {
    const items = Object.entries(stats.byArtist).map(([name, value]) => ({
      name,
      seconds: value.seconds || 0,
      plays: value.plays || 0,
    }));

    items.sort((a, b) => {
      if (b.seconds !== a.seconds) return b.seconds - a.seconds;
      return b.plays - a.plays;
    });

    return items;
  }, [stats.byArtist]);

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
      if (
        value.seconds > weeklyTopArtistSeconds ||
        (value.seconds === weeklyTopArtistSeconds && value.plays > weeklyTopArtistPlays)
      ) {
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

    return {
      weeklyListenSeconds,
      weeklyTopArtistName,
      weeklyTopArtistPlays,
      weeklyActiveDays: weeklyActiveDaySet.size,
      streakDays,
    };
  }, [nowMs, stats.byTrack, stats.recentPlays]);

  return (
    <div className="pb-28">
      <div className="flex items-end justify-between gap-6 mb-8">
        <div className="min-w-0">
          <h2 className="text-3xl font-light truncate">Stats</h2>
        </div>

        <button
          onClick={resetStats}
          className="rounded-2xl bg-white/10 text-white/80 text-sm font-medium px-4 py-2 hover:bg-white/15 transition"
          title="Reinitialiser"
          type="button"
        >
          Reinitialiser
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="rounded-3xl bg-[#15151C] border border-white/5 p-6">
          <p className="text-xs text-white/45">Temps total d&apos;ecoute</p>
          <p className="text-3xl text-white/90 font-light mt-2 tabular-nums">{formatDuration(stats.totalListenSeconds)}</p>
        </div>

        <div className="rounded-3xl bg-[#15151C] border border-white/5 p-6">
          <p className="text-xs text-white/45">Morceaux joues</p>
          <p className="text-3xl text-white/90 font-light mt-2 tabular-nums">{stats.uniqueTracksPlayed}</p>
          <p className="text-sm text-white/35 mt-2">
            Total lectures: <span className="text-white/70 tabular-nums">{formatInt(stats.totalPlays)}</span>
          </p>
        </div>

        <div className="rounded-3xl bg-[#15151C] border border-white/5 p-6 md:col-span-2">
          <p className="text-xs text-white/45">Artiste le plus ecoute</p>
          <p className="text-lg text-white/90 mt-2">{topArtistLabel}</p>

          <div className="mt-5 h-px bg-white/10" />

          <p className="text-xs text-white/45 mt-5">Titre le plus ecoute</p>
          <p className="text-lg text-white/90 mt-2">{topTrackLabel}</p>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        <div className="rounded-3xl bg-[#15151C] border border-white/5 p-6">
          <p className="text-xs text-white/45">Temps d&apos;ecoute hebdo</p>
          <p className="text-3xl text-white/90 font-light mt-2 tabular-nums">
            {formatDuration(personalSummary.weeklyListenSeconds)}
          </p>
          <p className="text-[11px] text-white/35 mt-2">Estimation sur les 7 derniers jours</p>
        </div>

        <div className="rounded-3xl bg-[#15151C] border border-white/5 p-6">
          <p className="text-xs text-white/45">Top artiste (7 jours)</p>
          <p className="text-xl text-white/90 font-light mt-2 truncate">{personalSummary.weeklyTopArtistName}</p>
          <p className="text-xs text-white/35 mt-2 tabular-nums">
            {formatInt(personalSummary.weeklyTopArtistPlays)} lecture(s) cette semaine
          </p>
        </div>

        <div className="rounded-3xl bg-[#15151C] border border-white/5 p-6">
          <p className="text-xs text-white/45">Jours actifs (7 jours)</p>
          <p className="text-3xl text-white/90 font-light mt-2 tabular-nums">
            {personalSummary.weeklyActiveDays}/7
          </p>
          <p className="text-xs text-white/35 mt-2">Au moins une lecture par jour</p>
        </div>

        <div className="rounded-3xl bg-[#15151C] border border-white/5 p-6">
          <p className="text-xs text-white/45">Streak actuel</p>
          <p className="text-3xl text-white/90 font-light mt-2 tabular-nums">
            {personalSummary.streakDays} jour{personalSummary.streakDays > 1 ? "s" : ""}
          </p>
          <p className="text-xs text-white/35 mt-2">Consecutifs depuis aujourd&apos;hui</p>
        </div>
      </div>

      <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-3xl bg-[#15151C] border border-white/5 p-5">
          <div className="flex items-end justify-between gap-4 mb-4">
            <div className="min-w-0">
              <p className="text-xs text-white/45">Classement</p>
              <h3 className="text-lg text-white/90 font-light">Top titres</h3>
            </div>

            {rankedTracks.length > 10 ? (
              <button
                type="button"
                onClick={() => setShowAllTracks((value) => !value)}
                className="text-xs text-white/45 hover:text-white/80 transition"
              >
                {showAllTracks ? "Voir moins" : "Voir plus"}
              </button>
            ) : null}
          </div>

          {rankedTracks.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/45">
              Lance quelques morceaux pour generer des stats.
            </div>
          ) : (
            <div className="space-y-2">
              {tracksToShow.map((track, index) => (
                <div
                  key={track.src}
                  className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/5 px-3 py-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm text-white/90 truncate">
                      <span className="text-white/45 tabular-nums mr-2">#{index + 1}</span>
                      {track.title}
                    </p>
                    <p className="text-xs text-white/45 truncate">{track.artist ?? "-"}</p>

                    <p className="text-[11px] text-white/35 mt-1 tabular-nums">
                      {formatDuration(track.seconds)} - {formatInt(track.plays)} lecture(s)
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setQueueAndPlay(
                        [
                          {
                            title: track.title,
                            artist: track.artist,
                            src: track.src,
                          },
                        ],
                        0
                      );
                    }}
                    className="h-9 px-4 rounded-full bg-white text-black text-sm font-medium hover:opacity-90 transition"
                    title="Lire"
                  >
                    Play
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-3xl bg-[#15151C] border border-white/5 p-5">
          <div className="flex items-end justify-between gap-4 mb-4">
            <div className="min-w-0">
              <p className="text-xs text-white/45">Classement</p>
              <h3 className="text-lg text-white/90 font-light">Top artistes</h3>
            </div>

            {rankedArtists.length > 10 ? (
              <button
                type="button"
                onClick={() => setShowAllArtists((value) => !value)}
                className="text-xs text-white/45 hover:text-white/80 transition"
              >
                {showAllArtists ? "Voir moins" : "Voir plus"}
              </button>
            ) : null}
          </div>

          {rankedArtists.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/45">
              Lance quelques morceaux pour generer des stats.
            </div>
          ) : (
            <div className="space-y-2">
              {artistsToShow.map((artist, index) => (
                <div
                  key={artist.name}
                  className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/5 px-3 py-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm text-white/90 truncate">
                      <span className="text-white/45 tabular-nums mr-2">#{index + 1}</span>
                      {artist.name}
                    </p>
                    <p className="text-[11px] text-white/35 mt-1 tabular-nums">
                      {formatDuration(artist.seconds)} - {formatInt(artist.plays)} lecture(s)
                    </p>
                  </div>

                  <div className="text-xs text-white/35">-</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="mt-8 rounded-3xl bg-[#0f0f14] border border-white/5 p-6 text-sm text-white/45">
        <p className="text-white/70">Comment c&apos;est compte:</p>
        <ul className="list-disc pl-5 mt-2 space-y-1">
          <li>Le temps d&apos;ecoute s&apos;additionne uniquement pendant la lecture (hors pause).</li>
          <li>Une lecture est comptee quand un morceau demarre (dans les ~1.2 premieres secondes).</li>
          <li>Top artiste/titre = base sur le temps d&apos;ecoute cumule.</li>
        </ul>
      </div>
    </div>
  );
}
