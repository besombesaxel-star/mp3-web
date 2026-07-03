"use client";

import Image from "next/image";
import { Radio } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AlbumCard from "./AlbumCard";
import { useAuth } from "./AuthProvider";
import { Track, usePlayer } from "./PlayerContext";
import { fetchTracksShared } from "./tracksCache";
import { subscribeTracksUpdated } from "./tracksSync";
import { COVER_SCROLL_TRANSFORM, useCoverScrollEffect } from "./useCoverScrollEffect";

type ApiTrack = {
  title: string;
  artist: string;
  src: string;
  cover: string | null;
  ownerDisplayName?: string | null;
  ownerId?: string | null;
};

type RecentCard = {
  title: string;
  subtitle: string;
  track: Track & { cover?: string };
};

type TodayMoment = "morning" | "evening" | "night";

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

function getCoverDedupKey(track: Track) {
  const cover = track.cover?.trim().toLowerCase();
  if (cover) return `cover:${cover}`;
  return `src:${track.src}`;
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
  const { favorites, setQueueAndPlay, stats, startRadio } = usePlayer();
  const { accessToken } = useAuth();
  const [tracks, setTracks] = useState<ApiTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [todayHour, setTodayHour] = useState<number | null>(null);
  const [radioLoading, setRadioLoading] = useState(false);

  async function onStartRadio() {
    if (radioLoading) return;
    setRadioLoading(true);
    try {
      await startRadio();
    } finally {
      setRadioLoading(false);
    }
  }
  const homeRef = useRef<HTMLDivElement | null>(null);
  useCoverScrollEffect(homeRef);

  const loadTracks = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      setTracks(await fetchTracksShared(accessToken));
    } catch (errorValue: unknown) {
      setError(getErrorMessage(errorValue, "Erreur lors du chargement"));
      setTracks([]);
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void loadTracks();
  }, [loadTracks]);

  useEffect(() => {
    return subscribeTracksUpdated(() => {
      void loadTracks();
    });
  }, [loadTracks]);

  useEffect(() => {
    const tick = () => {
      const now = Date.now();
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
        ownerDisplayName: track.ownerDisplayName ?? undefined,
        ownerId: track.ownerId ?? undefined,
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
        ownerDisplayName: track.ownerDisplayName ?? undefined,
        ownerId: track.ownerId ?? undefined,
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

  const recentTracks = useMemo<Track[]>(() => libraryTracks.slice(0, 20), [libraryTracks]);
  const favoriteTracks = useMemo<Track[]>(() => favorites.slice(0, 20), [favorites]);
  const recentPlayEvents = stats.recentPlays;

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

  function playTodayMoment(tracksToPlay: Track[]) {
    if (!tracksToPlay.length) return;
    setQueueAndPlay(tracksToPlay, 0);
  }

  return (
    <div ref={homeRef} className="pb-[calc(11rem+env(safe-area-inset-bottom))] sm:pb-28">
      <div className="flex items-end justify-between mb-8 mp3-fade-up">
        <h2 className="text-3xl font-light">Accueil</h2>

        {!loading && tracks.length > 0 && (
          <button
            type="button"
            onClick={() => void onStartRadio()}
            disabled={radioLoading}
            className="flex items-center gap-2 h-9 px-4 rounded-full bg-white/8 border border-white/10 text-xs text-white/60 hover:bg-white/12 transition shrink-0 disabled:opacity-50"
            title="Lance une file continue basee sur tes gouts"
          >
            <Radio size={13} className={radioLoading ? "animate-pulse" : undefined} />
            {radioLoading ? "Demarrage..." : "Radio"}
          </button>
        )}
      </div>

      {error ? (
        <p className="text-sm text-red-400 mb-6" role="alert">
          {error}
        </p>
      ) : null}


      <section className="mb-12">
        <div className="flex items-end justify-between mb-6 mp3-fade-up">
          <h3 className="text-2xl font-light">Pour toi aujourd&apos;hui</h3>
          <span className="text-sm text-white/35">{todayMomentLabel(currentTodayMoment)}</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {todayMomentCards.map((momentItem, momentIndex) => {
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
                className="group text-left disabled:cursor-default disabled:opacity-65 transition hover:-translate-y-0.5 mp3-fade-up"
                style={{ animationDelay: `${momentIndex * 60}ms` }}
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

      <div className="flex items-end justify-between mb-6 mp3-fade-up">
        <h3 className="text-2xl font-light">Recemment ajoutes</h3>
        <span className="text-sm text-white/35" aria-live="polite">
          {loading ? "Chargement..." : "Auto"}
        </span>
      </div>

      {!loading && !error && recent.length === 0 ? (
        <div className="rounded-2xl bg-white/5 border border-white/5 p-6 text-white/55">
          Aucun son pour le moment. Ajoute un MP3 via <span className="text-white/80">/upload</span> ou depose-le
          localement dans <span className="text-white/80">public/audio</span>.
        </div>
      ) : null}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-6">
        {loading
          ? Array.from({ length: 8 }).map((_, index) => <SkeletonCard key={index} />)
          : recent.map((item, index) => (
              <AlbumCard
                key={item.track.src}
                title={item.title}
                subtitle={item.subtitle}
                track={item.track}
                coverTransform={COVER_SCROLL_TRANSFORM}
                animationDelay={`${Math.min(index, 9) * 40}ms`}
              />
            ))}
      </div>
    </div>
  );
}
