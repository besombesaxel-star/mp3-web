"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import AlbumCard from "./AlbumCard";
import { Track, usePlayer } from "./PlayerContext";
import { COVER_SCROLL_TRANSFORM, useCoverScrollEffect } from "./useCoverScrollEffect";
import { useFocusTrap } from "./useFocusTrap";

type ApiTrack = {
  title: string;
  artist: string;
  src: string;
  cover: string | null;
};

type TracksResponse = {
  tracks?: ApiTrack[];
};

type RecentCard = {
  title: string;
  subtitle: string;
  track: Track & { cover?: string };
};

type SmartPlaylist = {
  id: string;
  title: string;
  subtitle: string;
  tracks: Track[];
};

type PlaylistBadge = {
  label: string;
  tone: "sky" | "emerald" | "amber";
};

type TodayMoment = "morning" | "evening" | "night";

const PLAYLISTS_PER_PAGE = 4;

function SkeletonCard() {
  return (
    <div className="group text-left relative animate-pulse">
      <div className="relative aspect-square w-full overflow-hidden rounded-3xl border border-white/5 bg-white/5" />
      <div className="mt-3 space-y-2">
        <div className="h-3 w-3/4 rounded bg-white/10" />
        <div className="h-3 w-1/2 rounded bg-white/10" />
      </div>
    </div>
  );
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function badgeToneClass(tone: PlaylistBadge["tone"]) {
  if (tone === "sky") return "border-sky-300/35 bg-sky-400/20 text-sky-100";
  if (tone === "emerald") return "border-emerald-300/35 bg-emerald-400/20 text-emerald-100";
  return "border-amber-300/35 bg-amber-300/20 text-amber-100";
}

function getCoverDedupKey(track: Track) {
  const cover = track.cover?.trim().toLowerCase();
  if (cover) return `cover:${cover}`;
  return `src:${track.src}`;
}

function getUniqueTracksByCover(tracks: Track[], limit: number) {
  const used = new Set<string>();
  const unique: Track[] = [];

  for (const item of tracks) {
    const key = getCoverDedupKey(item);
    if (used.has(key)) continue;
    used.add(key);
    unique.push(item);
    if (unique.length >= limit) break;
  }

  return unique;
}

function getTodayMoment(hour: number | null): TodayMoment | null {
  if (hour === null || !Number.isFinite(hour)) return null;
  if (hour >= 6 && hour < 17) return "morning";
  if (hour >= 17 && hour < 24) return "evening";
  return "night";
}

function todayMomentLabel(moment: TodayMoment | null) {
  if (moment === "morning") return "Moment du jour: Matin";
  if (moment === "evening") return "Moment du jour: Soir";
  if (moment === "night") return "Moment du jour: Nuit";
  return "Recommandations dynamiques";
}

export default function Home() {
  const { favorites, setQueueAndPlay, stats, track } = usePlayer();
  const [tracks, setTracks] = useState<ApiTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [playlistPage, setPlaylistPage] = useState(0);
  const [openedPlaylistId, setOpenedPlaylistId] = useState<string | null>(null);
  const [openedPlaylistQuery, setOpenedPlaylistQuery] = useState("");
  const [todayHour, setTodayHour] = useState<number | null>(null);
  const [nowMs, setNowMs] = useState(0);
  const homeRef = useRef<HTMLDivElement | null>(null);
  const playlistDialogRef = useRef<HTMLDivElement | null>(null);
  useCoverScrollEffect(homeRef);

  async function loadTracks() {
    try {
      setLoading(true);
      setError("");

      const res = await fetch("/api/tracks", { cache: "no-store" });
      if (!res.ok) throw new Error("Impossible de charger /api/tracks");

      const json: TracksResponse = await res.json();
      const list = Array.isArray(json.tracks) ? json.tracks : [];
      setTracks(list);
    } catch (errorValue: unknown) {
      setError(getErrorMessage(errorValue, "Erreur lors du chargement"));
      setTracks([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTracks();
  }, []);

  useEffect(() => {
    const tick = () => {
      const now = Date.now();
      setNowMs(now);
      setTodayHour(new Date(now).getHours());
    };
    tick();
    const intervalId = window.setInterval(tick, 60_000);
    return () => window.clearInterval(intervalId);
  }, []);

  const recent = useMemo<RecentCard[]>(() => {
    return tracks.slice(0, 8).map((track) => ({
      title: track.title,
      subtitle: `${track.artist} - MP3`,
      track: {
        title: track.title,
        artist: track.artist,
        src: track.src,
        cover: track.cover ?? undefined,
      },
    }));
  }, [tracks]);

  const libraryTracks = useMemo<(Track & { cover?: string })[]>(
    () =>
      tracks.map((track) => ({
        title: track.title,
        artist: track.artist,
        src: track.src,
        cover: track.cover ?? undefined,
      })),
    [tracks]
  );

  const trackBySrc = useMemo(() => {
    const map = new Map<string, Track & { cover?: string }>();
    for (const item of libraryTracks) {
      map.set(item.src, item);
    }
    for (const favorite of favorites) {
      if (!map.has(favorite.src)) {
        map.set(favorite.src, favorite);
      }
    }
    return map;
  }, [libraryTracks, favorites]);

  const topPlayedTracks = useMemo<Track[]>(() => {
    const ranked = Object.entries(stats.byTrack)
      .sort(([, a], [, b]) => {
        if (b.seconds !== a.seconds) return b.seconds - a.seconds;
        return b.plays - a.plays;
      })
      .slice(0, 20);

    return ranked
      .map(([src]) => trackBySrc.get(src))
      .filter((track): track is Track => Boolean(track));
  }, [stats.byTrack, trackBySrc]);

  const recentTracks = useMemo<Track[]>(() => libraryTracks.slice(0, 20), [libraryTracks]);
  const favoriteTracks = useMemo<Track[]>(() => favorites.slice(0, 20), [favorites]);
  const recentPlayEvents = stats.recentPlays;

  const topWeekTracks = useMemo<Track[]>(() => {
    if (nowMs <= 0) return topPlayedTracks;
    const since = nowMs - 7 * 24 * 60 * 60 * 1000;
    const score = new Map<string, number>();

    for (const event of recentPlayEvents) {
      if (event.playedAt < since) continue;
      score.set(event.src, (score.get(event.src) ?? 0) + 1);
    }

    const ranked = [...score.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([src]) => trackBySrc.get(src))
      .filter((item): item is Track => Boolean(item));

    return ranked.length > 0 ? ranked : topPlayedTracks;
  }, [nowMs, recentPlayEvents, trackBySrc, topPlayedTracks]);

  const morningTracks = useMemo<Track[]>(() => {
    const score = new Map<string, number>();
    for (const event of recentPlayEvents) {
      if (event.hour < 6 || event.hour >= 12) continue;
      score.set(event.src, (score.get(event.src) ?? 0) + 1);
    }

    const ranked = [...score.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([src]) => trackBySrc.get(src))
      .filter((item): item is Track => Boolean(item));

    return ranked.length > 0 ? ranked : recentTracks;
  }, [recentPlayEvents, trackBySrc, recentTracks]);

  const eveningTracks = useMemo<Track[]>(() => {
    const score = new Map<string, number>();
    for (const event of recentPlayEvents) {
      if (event.hour < 18 || event.hour > 23) continue;
      score.set(event.src, (score.get(event.src) ?? 0) + 1);
    }

    const ranked = [...score.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([src]) => trackBySrc.get(src))
      .filter((item): item is Track => Boolean(item));

    return ranked.length > 0 ? ranked : recentTracks;
  }, [recentPlayEvents, trackBySrc, recentTracks]);

  const nightTracks = useMemo<Track[]>(() => {
    const score = new Map<string, number>();
    for (const event of recentPlayEvents) {
      if (event.hour >= 6) continue;
      score.set(event.src, (score.get(event.src) ?? 0) + 1);
    }

    const ranked = [...score.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([src]) => trackBySrc.get(src))
      .filter((item): item is Track => Boolean(item));

    return ranked.length > 0 ? ranked : favoriteTracks;
  }, [recentPlayEvents, trackBySrc, favoriteTracks]);

  const discoveryTracks = useMemo<Track[]>(() => {
    if (nowMs <= 0) return recentTracks;
    const since = nowMs - 14 * 24 * 60 * 60 * 1000;

    const ranked = Object.entries(stats.firstPlayedAtByTrack)
      .filter(([, playedAt]) => playedAt >= since)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([src]) => trackBySrc.get(src))
      .filter((item): item is Track => Boolean(item));

    return ranked.length > 0 ? ranked : recentTracks;
  }, [nowMs, stats.firstPlayedAtByTrack, trackBySrc, recentTracks]);

  const smartPlaylists = useMemo<SmartPlaylist[]>(
    () => [
      {
        id: "routine-top-week",
        title: "Top 7 jours",
        subtitle: "Mise a jour chaque semaine",
        tracks: topWeekTracks,
      },
      {
        id: "routine-evening",
        title: "Mix du soir",
        subtitle: "Based sur tes ecoutes 18h-23h",
        tracks: eveningTracks,
      },
      {
        id: "routine-night",
        title: "Mix de nuit",
        subtitle: "Tes vibes apres minuit",
        tracks: nightTracks,
      },
      {
        id: "routine-discovery",
        title: "Decouvertes recentes",
        subtitle: "Ce que tu as decouvert recemment",
        tracks: discoveryTracks,
      },
      {
        id: "smart-top",
        title: "Top ecoutes",
        subtitle: "Selon ton temps d'ecoute",
        tracks: topPlayedTracks,
      },
      {
        id: "smart-recent",
        title: "Recemment ajoutes",
        subtitle: "Mis a jour automatiquement",
        tracks: recentTracks,
      },
      {
        id: "smart-favorites",
        title: "Favoris",
        subtitle: "Selection personnelle",
        tracks: favoriteTracks,
      },
    ],
    [
      topWeekTracks,
      eveningTracks,
      nightTracks,
      discoveryTracks,
      topPlayedTracks,
      recentTracks,
      favoriteTracks,
    ]
  );

  const currentTodayMoment = useMemo(() => getTodayMoment(todayHour), [todayHour]);

  const todayMoments = useMemo(
    () => [
      {
        id: "today-morning",
        title: "Matin",
        subtitle: "Energie douce pour commencer",
        tracks: morningTracks,
        moment: "morning" as TodayMoment,
      },
      {
        id: "today-evening",
        title: "Soir",
        subtitle: "Tes vibes de fin de journee",
        tracks: eveningTracks,
        moment: "evening" as TodayMoment,
      },
      {
        id: "today-night",
        title: "Nuit",
        subtitle: "Ambiance calme et tardive",
        tracks: nightTracks,
        moment: "night" as TodayMoment,
      },
    ],
    [morningTracks, eveningTracks, nightTracks]
  );

  const todayMomentCards = useMemo(() => {
    const used = new Set<string>();

    return todayMoments.map((item) => {
      let featuredTrack: Track | null = null;
      for (const candidate of item.tracks) {
        const key = getCoverDedupKey(candidate);
        if (used.has(key)) continue;
        used.add(key);
        featuredTrack = candidate;
        break;
      }

      return {
        ...item,
        featuredTrack,
      };
    });
  }, [todayMoments]);

  const openedPlaylist = useMemo(
    () => smartPlaylists.find((playlist) => playlist.id === openedPlaylistId) ?? null,
    [smartPlaylists, openedPlaylistId]
  );

  const playlistBadgesById = useMemo(() => {
    if (nowMs <= 0) {
      const empty: Record<string, PlaylistBadge[]> = {};
      for (const playlist of smartPlaylists) empty[playlist.id] = [];
      return empty;
    }
    const now = nowMs;
    const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
    const freshAgo = now - 14 * 24 * 60 * 60 * 1000;
    const favoriteSrcSet = new Set(favorites.map((item) => item.src));
    const weekPlaysBySrc = new Map<string, number>();

    for (const event of recentPlayEvents) {
      if (event.playedAt < weekAgo) continue;
      weekPlaysBySrc.set(event.src, (weekPlaysBySrc.get(event.src) ?? 0) + 1);
    }

    const byId: Record<string, PlaylistBadge[]> = {};

    for (const playlist of smartPlaylists) {
      const total = playlist.tracks.length;
      if (total === 0) {
        byId[playlist.id] = [];
        continue;
      }

      let weekHits = 0;
      let freshCount = 0;
      let favoriteCount = 0;

      for (const item of playlist.tracks) {
        weekHits += weekPlaysBySrc.get(item.src) ?? 0;
        if ((stats.firstPlayedAtByTrack[item.src] ?? 0) >= freshAgo) freshCount += 1;
        if (favoriteSrcSet.has(item.src)) favoriteCount += 1;
      }

      const badges: PlaylistBadge[] = [];

      if (playlist.id.includes("top-week") || weekHits >= Math.max(6, Math.ceil(total * 1.4))) {
        badges.push({ label: "Top semaine", tone: "sky" });
      }

      if (playlist.id.includes("discovery") || freshCount >= Math.max(2, Math.ceil(total * 0.22))) {
        badges.push({ label: "Nouveau", tone: "emerald" });
      }

      if (playlist.id.includes("favorites") || favoriteCount >= Math.max(2, Math.ceil(total * 0.3))) {
        badges.push({ label: "Favori", tone: "amber" });
      }

      byId[playlist.id] = badges.slice(0, 2);
    }

    return byId;
  }, [nowMs, favorites, recentPlayEvents, smartPlaylists, stats.firstPlayedAtByTrack]);

  const playlistPages = useMemo(() => {
    const pages: SmartPlaylist[][] = [];
    for (let i = 0; i < smartPlaylists.length; i += PLAYLISTS_PER_PAGE) {
      pages.push(smartPlaylists.slice(i, i + PLAYLISTS_PER_PAGE));
    }
    return pages.length > 0 ? pages : [[]];
  }, [smartPlaylists]);

  const totalPlaylistPages = playlistPages.length;

  const openedPlaylistCurrentTrack = useMemo(() => {
    if (!openedPlaylist) return null;
    if (track && openedPlaylist.tracks.some((item) => item.src === track.src)) return track;
    return openedPlaylist.tracks[0] ?? null;
  }, [openedPlaylist, track]);

  const openedPlaylistBadges = useMemo(() => {
    if (!openedPlaylist) return [];
    return playlistBadgesById[openedPlaylist.id] ?? [];
  }, [openedPlaylist, playlistBadgesById]);

  const openedPlaylistFilteredTracks = useMemo(() => {
    if (!openedPlaylist) return [];
    const query = openedPlaylistQuery.trim().toLowerCase();
    if (!query) return openedPlaylist.tracks;
    return openedPlaylist.tracks.filter((item) =>
      `${item.title} ${item.artist ?? ""}`.toLowerCase().includes(query)
    );
  }, [openedPlaylist, openedPlaylistQuery]);

  useFocusTrap(Boolean(openedPlaylist), playlistDialogRef);

  useEffect(() => {
    if (!openedPlaylist) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenedPlaylistId(null);
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [openedPlaylist]);

  useEffect(() => {
    setOpenedPlaylistQuery("");
  }, [openedPlaylistId]);

  useEffect(() => {
    if (playlistPage < totalPlaylistPages) return;
    setPlaylistPage(0);
  }, [playlistPage, totalPlaylistPages]);

  function playFromOpenedPlaylist(index: number) {
    if (!openedPlaylist) return;
    if (index < 0 || index >= openedPlaylist.tracks.length) return;
    setQueueAndPlay(openedPlaylist.tracks, index);
  }

  function playFromOpenedPlaylistTrack(src: string) {
    if (!openedPlaylist) return;
    const startIndex = openedPlaylist.tracks.findIndex((item) => item.src === src);
    if (startIndex < 0) return;
    setQueueAndPlay(openedPlaylist.tracks, startIndex);
  }

  function playTodayMoment(tracksToPlay: Track[]) {
    if (!tracksToPlay.length) return;
    setQueueAndPlay(tracksToPlay, 0);
  }

  function goToNextPlaylistPage() {
    setPlaylistPage((value) => (value + 1) % totalPlaylistPages);
  }

  function goToPreviousPlaylistPage() {
    setPlaylistPage((value) => (value - 1 + totalPlaylistPages) % totalPlaylistPages);
  }

  return (
    <div ref={homeRef} className="pb-28">
      <div className="flex items-end justify-between mb-8">
        <h2 className="text-3xl font-light">Accueil</h2>

        <Link href="/library" className="text-sm text-white/55 hover:text-white/85 transition">
          Aller a Bibliotheque -&gt;
        </Link>
      </div>

      {error ? (
        <p className="text-sm text-red-400 mb-6" role="alert">
          {error}
        </p>
      ) : null}

      <div className="mb-12">
        <div className="flex items-end justify-between mb-6">
          <h3 className="text-2xl font-light">Mix hebdomadaires</h3>
          <div className="flex items-center gap-3">
            <span className="text-sm text-white/35">
              {smartPlaylists.length} playlists - {playlistPage + 1}/{totalPlaylistPages}
            </span>
            {totalPlaylistPages > 1 ? (
              <div className="flex items-center gap-2">
                {playlistPage > 0 ? (
                  <button
                    type="button"
                    onClick={goToPreviousPlaylistPage}
                    className="h-9 w-9 rounded-full bg-white/10 text-white/85 hover:bg-white/15 transition"
                    aria-label="Voir les playlists precedentes"
                    title="Voir les playlists precedentes"
                  >
                    <ChevronLeft size={18} className="mx-auto" />
                  </button>
                ) : null}

                <button
                  type="button"
                  onClick={goToNextPlaylistPage}
                  className="h-9 w-9 rounded-full bg-white/10 text-white/85 hover:bg-white/15 transition"
                  aria-label="Voir les playlists suivantes"
                  title="Voir les playlists suivantes"
                >
                  <ChevronRight size={18} className="mx-auto" />
                </button>
              </div>
            ) : null}
          </div>
        </div>

        <div className="overflow-hidden">
          <div
            className="flex transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
            style={{ transform: `translateX(-${playlistPage * 100}%)` }}
          >
            {playlistPages.map((page, pageIndex) => (
              <div key={`playlist-page-${pageIndex}`} className="min-w-full grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-6">
                {page.map((playlist) => {
                  const count = playlist.tracks.length;
                  const preview = getUniqueTracksByCover(playlist.tracks, 4);
                  const emptySlots = Math.max(0, 4 - preview.length);
                  const disabled = count === 0;
                  const badges = playlistBadgesById[playlist.id] ?? [];

                  return (
                    <div key={playlist.id} className="group text-left relative">
                      <button
                        type="button"
                        onClick={() => setOpenedPlaylistId(playlist.id)}
                        disabled={disabled}
                        title={disabled ? "Playlist vide" : `Ouvrir ${playlist.title}`}
                        aria-label={disabled ? `${playlist.title} vide` : `Ouvrir ${playlist.title}`}
                        className="cursor-pointer w-full text-left disabled:cursor-default"
                      >
                        <div
                          data-scroll-cover="1"
                          className={[
                            "scroll-edge-blur relative aspect-square w-full overflow-hidden rounded-3xl border border-white/5 bg-[#1A1A22] shadow-sm will-change-transform",
                          ].join(" ")}
                          style={{ transform: COVER_SCROLL_TRANSFORM }}
                        >
                          <div
                            className={[
                              "relative h-full w-full transition-transform duration-200",
                              disabled ? "opacity-60" : "group-hover:scale-[1.02]",
                            ].join(" ")}
                          >
                            {badges.length > 0 ? (
                              <div className="pointer-events-none absolute inset-x-3 top-3 z-10 flex flex-wrap gap-2">
                                {badges.map((badge) => (
                                  <span
                                    key={`${playlist.id}-${badge.label}`}
                                    className={`rounded-full border px-2 py-1 text-[10px] font-medium tracking-wide ${badgeToneClass(badge.tone)}`}
                                  >
                                    {badge.label}
                                  </span>
                                ))}
                              </div>
                            ) : null}

                            <div className="grid h-full w-full grid-cols-2 grid-rows-2 gap-[2px] p-[2px]">
                              {preview.map((track, index) => (
                                <div
                                  key={`${playlist.id}-${track.src}-${index}`}
                                  className="relative overflow-hidden rounded-xl border border-white/10 bg-[#0F0F14]"
                                >
                                  {track.cover ? (
                                    <Image
                                      src={track.cover}
                                      alt={track.title}
                                      fill
                                      className="object-cover"
                                      sizes="(max-width: 1024px) 50vw, 25vw"
                                    />
                                  ) : (
                                    <div className="h-full w-full flex items-center justify-center text-white/35 text-xs uppercase">
                                      {track.title.slice(0, 1) || "-"}
                                    </div>
                                  )}
                                </div>
                              ))}

                              {Array.from({ length: emptySlots }).map((_, index) => (
                                <div
                                  key={`${playlist.id}-empty-${index}`}
                                  className="rounded-xl border border-dashed border-white/10 bg-white/[0.03]"
                                />
                              ))}
                            </div>

                            <div className="pointer-events-none absolute inset-x-3 bottom-3 z-10">
                              <div className="rounded-2xl border border-white/15 bg-black/70 backdrop-blur-md px-3 py-2">
                                <p className="text-sm text-white/95 truncate">{playlist.title}</p>
                                <p className="text-[11px] text-white/70 truncate">
                                  {count} morceau{count > 1 ? "x" : ""} - {playlist.subtitle}
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>
                      </button>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      <section className="mb-12">
        <div className="flex items-end justify-between mb-6">
          <h3 className="text-2xl font-light">Pour toi aujourd&apos;hui</h3>
          <span className="text-sm text-white/35">{todayMomentLabel(currentTodayMoment)}</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {todayMomentCards.map((momentItem) => {
            const count = momentItem.tracks.length;
            const featuredTrack = momentItem.featuredTrack;
            const disabled = count === 0;
            const isCurrentMoment = currentTodayMoment === momentItem.moment;

            return (
              <button
                key={momentItem.id}
                type="button"
                onClick={() => playTodayMoment(momentItem.tracks)}
                disabled={disabled}
                title={disabled ? `${momentItem.title} vide` : `Lire le mix ${momentItem.title.toLowerCase()}`}
                className="group text-left disabled:cursor-default disabled:opacity-65"
              >
                <div
                  data-scroll-cover="1"
                  className="scroll-edge-blur relative aspect-square w-full overflow-hidden rounded-3xl border border-white/10 bg-[#1A1A22] shadow-sm will-change-transform"
                  style={{ transform: COVER_SCROLL_TRANSFORM }}
                >
                  <div className="relative h-full w-full">
                    {featuredTrack?.cover ? (
                      <Image
                        src={featuredTrack.cover}
                        alt={featuredTrack.title}
                        fill
                        className="object-cover transition-transform duration-200 group-hover:scale-[1.02]"
                        sizes="(max-width: 1024px) 90vw, 33vw"
                      />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center text-white/35 text-lg uppercase bg-[#0F0F14]">
                        {momentItem.title.slice(0, 1) || "-"}
                      </div>
                    )}
                  </div>

                  {isCurrentMoment ? (
                    <span className="absolute right-3 top-3 rounded-full border border-white/20 bg-black/60 px-2 py-1 text-[10px] text-white/85">
                      Maintenant
                    </span>
                  ) : null}

                  <div className="pointer-events-none absolute inset-x-3 bottom-3">
                    <div className="rounded-2xl border border-white/15 bg-black/70 backdrop-blur-md px-3 py-2">
                      <p className="text-sm text-white/95 truncate">{momentItem.title}</p>
                      <p className="text-[11px] text-white/70 truncate">
                        {count} morceau{count > 1 ? "x" : ""} - {momentItem.subtitle}
                      </p>
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {openedPlaylist ? (
        <div className="fixed inset-0 z-[70] p-2 sm:p-4 md:p-6 flex items-center justify-center">
          <button
            type="button"
            className="absolute inset-0 bg-black/75"
            aria-label="Fermer la playlist"
            onClick={() => setOpenedPlaylistId(null)}
          />

          <div
            ref={playlistDialogRef}
            role="dialog"
            aria-modal="true"
            aria-label={`Playlist ${openedPlaylist.title}`}
            className="relative z-10 h-[92vh] w-full max-w-[1500px] overflow-hidden rounded-3xl border border-white/10 bg-[#0D0D12] shadow-[0_20px_80px_rgba(0,0,0,0.55)]"
          >
            <div className="grid h-full grid-cols-1 lg:grid-cols-[420px_1fr]">
              <section className="border-b border-white/10 p-6 lg:border-b-0 lg:border-r overflow-y-auto">
                <p className="text-xs text-white/45">Son en cours</p>

                <div className="relative mt-3 aspect-square w-full overflow-hidden rounded-2xl border border-white/10 bg-[#14141B]">
                  {openedPlaylistCurrentTrack?.cover ? (
                    <Image
                      src={openedPlaylistCurrentTrack.cover}
                      alt={openedPlaylistCurrentTrack.title}
                      fill
                      className="object-cover"
                      sizes="(max-width: 1024px) 90vw, 420px"
                    />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center text-white/35 text-sm">
                      Aucune cover
                    </div>
                  )}
                </div>

                <div className="mt-4 min-w-0">
                  <p className="text-sm text-white/90 truncate">
                    {openedPlaylistCurrentTrack?.title ?? "Aucun son en cours"}
                  </p>
                  <p className="text-xs text-white/45 truncate">{openedPlaylistCurrentTrack?.artist ?? "-"}</p>
                </div>

                <button
                  type="button"
                  onClick={() => playFromOpenedPlaylist(0)}
                  disabled={openedPlaylist.tracks.length === 0}
                  className="mt-4 h-10 w-full rounded-2xl bg-white text-black text-sm font-medium hover:opacity-90 transition disabled:opacity-50"
                >
                  Tout lire
                </button>
              </section>

              <section className="p-6 flex h-full min-h-0 flex-col">
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs text-white/45">{openedPlaylist.subtitle}</p>
                    <h4 className="text-xl text-white/90 truncate">{openedPlaylist.title}</h4>
                    <p className="text-xs text-white/40 mt-1">
                      {openedPlaylist.tracks.length} morceau{openedPlaylist.tracks.length > 1 ? "x" : ""}
                    </p>
                    {openedPlaylistBadges.length > 0 ? (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {openedPlaylistBadges.map((badge) => (
                          <span
                            key={`${openedPlaylist.id}-${badge.label}`}
                            className={`rounded-full border px-2 py-1 text-[10px] font-medium tracking-wide ${badgeToneClass(badge.tone)}`}
                          >
                            {badge.label}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  <button
                    type="button"
                    onClick={() => setOpenedPlaylistId(null)}
                    className="h-10 px-4 rounded-2xl bg-white/10 text-white/85 hover:bg-white/15 transition"
                  >
                    Fermer
                  </button>
                </div>

                {openedPlaylist.tracks.length > 8 ? (
                  <div className="mb-4">
                    <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                      <span className="text-white/35" aria-hidden="true">
                        /
                      </span>
                      <input
                        value={openedPlaylistQuery}
                        onChange={(e) => setOpenedPlaylistQuery(e.target.value)}
                        placeholder="Rechercher dans la playlist..."
                        className="w-full bg-transparent outline-none text-sm text-white/90 placeholder:text-white/35"
                        aria-label="Recherche dans la playlist"
                      />
                      {openedPlaylistQuery ? (
                        <button
                          type="button"
                          onClick={() => setOpenedPlaylistQuery("")}
                          className="text-xs text-white/45 hover:text-white/80 transition"
                          title="Effacer"
                        >
                          X
                        </button>
                      ) : null}
                    </div>
                    <p className="mt-2 text-xs text-white/40">
                      {openedPlaylistFilteredTracks.length}/{openedPlaylist.tracks.length} morceau
                      {openedPlaylistFilteredTracks.length > 1 ? "x" : ""}
                    </p>
                  </div>
                ) : null}

                {openedPlaylist.tracks.length === 0 ? (
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/45">
                    Cette playlist est vide.
                  </div>
                ) : openedPlaylistFilteredTracks.length === 0 ? (
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/45">
                    Aucun morceau trouve pour &quot;{openedPlaylistQuery}&quot;.
                  </div>
                ) : (
                  <div className="min-h-0 flex-1 overflow-y-auto pr-1 space-y-2">
                    {openedPlaylistFilteredTracks.map((item, index) => {
                      const isCurrent = track?.src === item.src;

                      return (
                        <button
                          key={`${openedPlaylist.id}-${item.src}-${index}`}
                          type="button"
                          onClick={() => playFromOpenedPlaylistTrack(item.src)}
                          className={[
                            "w-full flex items-center justify-between gap-3 rounded-2xl border px-3 py-2 text-left transition",
                            isCurrent
                              ? "bg-white/10 border-white/20"
                              : "bg-white/5 border-white/10 hover:bg-white/8",
                          ].join(" ")}
                          title={`Lire ${item.title}`}
                        >
                          <div className="min-w-0 flex items-center gap-3">
                            <div className="relative h-12 w-12 overflow-hidden rounded-xl border border-white/10 bg-[#14141B] shrink-0">
                              {item.cover ? (
                                <Image src={item.cover} alt={item.title} fill className="object-cover" sizes="48px" />
                              ) : (
                                <div className="h-full w-full flex items-center justify-center text-white/35 text-xs uppercase">
                                  {item.title.slice(0, 1) || "-"}
                                </div>
                              )}
                            </div>

                            <div className="min-w-0">
                              <p className="text-sm text-white/90 truncate">{item.title}</p>
                              <p className="text-xs text-white/45 truncate">{item.artist ?? "-"}</p>
                            </div>
                          </div>

                          <span className="text-xs text-white/45 shrink-0">{isCurrent ? "En cours" : "Lire"}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </section>
            </div>
          </div>
        </div>
      ) : null}

      <div className="flex items-end justify-between mb-6">
        <h3 className="text-2xl font-light">Recemment ajoutes</h3>
        <span className="text-sm text-white/35" aria-live="polite">
          {loading ? "Chargement..." : "Auto"}
        </span>
      </div>

      {!loading && !error && recent.length === 0 ? (
        <div className="rounded-2xl bg-white/5 border border-white/5 p-6 text-white/55">
          Aucun son pour le moment. Ajoute un MP3 via <span className="text-white/80">/upload</span> ou depose-le
          dans <span className="text-white/80">public/Audio</span>.
        </div>
      ) : null}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-6">
        {loading
          ? Array.from({ length: 8 }).map((_, index) => <SkeletonCard key={index} />)
          : recent.map((item) => (
              <AlbumCard
                key={item.track.src}
                title={item.title}
                subtitle={item.subtitle}
                track={item.track}
                coverTransform={COVER_SCROLL_TRANSFORM}
              />
            ))}
      </div>
    </div>
  );
}
