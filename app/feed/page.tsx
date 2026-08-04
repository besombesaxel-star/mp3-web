"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { LayoutGrid, List as ListIcon, Music, Play, Rss } from "lucide-react";
import AlbumCard from "@/app/AlbumCard";
import { useAuth } from "@/app/AuthProvider";
import { usePlayer, type Track } from "@/app/PlayerContext";
import { createAuthorizedHeaders } from "@/lib/clientAuth";
import { getPublicProfileHref } from "@/lib/publicLinks";
import { useLongPress } from "@/app/useLongPress";
import TrackContextMenu from "@/app/TrackContextMenu";
import { SwipeableRow, swipeRowStyle, useSwipeActions } from "@/app/SwipeableRow";
import { toast } from "@/app/Toast";
import { usePullToRefresh } from "@/app/usePullToRefresh";
import PullToRefreshIndicator from "@/app/PullToRefreshIndicator";
import { useInfiniteTracks } from "@/app/useInfiniteTracks";
import InfiniteScrollSentinel from "@/app/InfiniteScrollSentinel";

type FeedTrack = {
  artist: string;
  cover: string | null;
  ownerDisplayName?: string | null;
  ownerId?: string | null;
  src: string;
  title: string;
  credits?: string | null;
};

type PlayerTrack = { artist: string; cover?: string; src: string; title: string };

const FEED_VIEW_KEY = "mp3_feed_view";

function FeedRow({
  track, playerTrack, idx, queue, onPlay, onOpenMenu,
}: {
  track: FeedTrack; playerTrack: PlayerTrack; idx: number; queue: PlayerTrack[];
  onPlay: (q: PlayerTrack[], i: number) => void;
  onOpenMenu: (t: Track) => void;
}) {
  const longPress = useLongPress({ onLongPress: () => onOpenMenu(playerTrack) });
  const { toggleFavorite, isFavorite, addToQueueEnd, hapticsEnabled } = usePlayer();
  const favored = isFavorite(playerTrack.src);
  const swipe = useSwipeActions({
    hapticsEnabled,
    onSwipeRight: () => {
      toggleFavorite(playerTrack);
      toast(favored ? "Retire des favoris" : "Ajoute aux favoris", "heart");
    },
    onSwipeLeft: () => {
      addToQueueEnd(playerTrack);
      toast("Ajoute a la file", "music");
    },
  });

  return (
    <SwipeableRow swipe={swipe} favored={favored}>
    <div
      className="group flex items-center gap-3 rounded-2xl px-3 py-3 sm:py-2.5 hover:bg-white/5 transition cursor-pointer mp3-fade-up"
      style={swipeRowStyle(swipe, { animationDelay: `${Math.min(idx, 14) * 25}ms` })}
      onClick={() => {
        if (longPress.didLongPress() || swipe.didSwipe()) return;
        onPlay(queue, idx);
      }}
      onTouchStart={(e) => {
        longPress.onTouchStart(e);
        swipe.onTouchStart(e);
      }}
      onTouchMove={(e) => {
        longPress.onTouchMove(e);
        swipe.onTouchMove(e);
      }}
      onTouchEnd={(e) => {
        longPress.onTouchEnd();
        swipe.onTouchEnd(e);
      }}
      onTouchCancel={(e) => {
        longPress.onTouchCancel();
        swipe.onTouchCancel(e);
      }}
      onContextMenu={longPress.onContextMenu}
    >
      <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-xl bg-white/5">
        {track.cover ? (
          <Image src={track.cover} alt={track.title} fill className="object-cover" sizes="40px" />
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
        <p className="text-sm text-white/85 truncate">{track.title}</p>
        <p className="text-xs text-white/40 truncate">{track.artist}</p>
      </div>

      {track.ownerId && (
        <Link
          href={getPublicProfileHref(track.ownerId)}
          onClick={(e) => e.stopPropagation()}
          className="shrink-0 text-xs text-white/25 hover:text-white/60 transition truncate max-w-[80px]"
        >
          {track.ownerDisplayName ?? "Profil"}
        </Link>
      )}
    </div>
    </SwipeableRow>
  );
}

export default function FeedPage() {
  const { accessToken, isAuthenticated } = useAuth();
  const { setQueueAndPlay } = usePlayer();

  const [following, setFollowing] = useState<string[] | null>(null);
  const [menuTrack, setMenuTrack] = useState<Track | null>(null);
  const [view, setView] = useState<"grid" | "list">("list");

  useEffect(() => {
    try {
      const stored = localStorage.getItem(FEED_VIEW_KEY);
      if (stored === "grid" || stored === "list") setView(stored);
    } catch {}
  }, []);

  function changeView(next: "grid" | "list") {
    setView(next);
    try {
      localStorage.setItem(FEED_VIEW_KEY, next);
    } catch {}
  }

  const loadFollowing = useCallback(async () => {
    if (!isAuthenticated || !accessToken) {
      setFollowing([]);
      return;
    }

    const res = await fetch("/api/account", { cache: "no-store", headers: createAuthorizedHeaders(accessToken) });
    const json = await res.json().catch(() => ({}));
    setFollowing(Array.isArray(json.following) ? json.following : []);
  }, [isAuthenticated, accessToken]);

  useEffect(() => {
    void loadFollowing();
  }, [loadFollowing]);

  const infinite = useInfiniteTracks({
    ownerIds: following ?? [],
    enabled: Boolean(following && following.length > 0),
  });
  const loading = following === null || (following.length > 0 && infinite.loading && infinite.tracks.length === 0);
  const tracks: FeedTrack[] = useMemo(
    () => (following && following.length > 0 ? infinite.tracks : []),
    [following, infinite.tracks]
  );

  const pullToRefresh = usePullToRefresh(
    useCallback(async () => {
      await loadFollowing();
      await infinite.refresh();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [loadFollowing, infinite.refresh])
  );

  const queue = useMemo<PlayerTrack[]>(
    () => tracks.map((t) => ({ artist: t.artist, cover: t.cover ?? undefined, src: t.src, title: t.title })),
    [tracks]
  );

  if (!isAuthenticated) {
    return (
      <div className="max-w-2xl mx-auto pb-[calc(11rem+env(safe-area-inset-bottom))] sm:pb-28 pt-12 text-center">
        <Rss size={32} className="mx-auto mb-4 text-white/15" />
        <p className="text-white/40 text-sm">
          <Link href="/account" className="underline underline-offset-2 hover:text-white/70">Connecte-toi</Link> pour voir le feed de tes abonnements.
        </p>
      </div>
    );
  }

  return (
    <div
      className="max-w-2xl mx-auto pb-[calc(11rem+env(safe-area-inset-bottom))] sm:pb-28"
      {...pullToRefresh.containerProps}
    >
      <PullToRefreshIndicator
        pullDistance={pullToRefresh.pullDistance}
        refreshing={pullToRefresh.refreshing}
        triggerDistance={pullToRefresh.triggerDistance}
      />
      <div className="flex items-center justify-between mb-8 mp3-fade-up">
        <h2 className="text-3xl font-light">Feed</h2>
        <div className="flex items-center gap-2">
          {!loading && tracks.length > 0 && (
            <div className="hidden sm:flex items-center gap-1 rounded-full border border-white/10 bg-white/5 p-1">
              <button
                type="button"
                onClick={() => changeView("grid")}
                aria-pressed={view === "grid"}
                className={[
                  "h-8 w-8 rounded-full flex items-center justify-center transition",
                  view === "grid" ? "bg-white text-black" : "text-white/55 hover:bg-white/10 hover:text-white",
                ].join(" ")}
                title="Vue grille"
                aria-label="Vue grille"
              >
                <LayoutGrid size={15} />
              </button>
              <button
                type="button"
                onClick={() => changeView("list")}
                aria-pressed={view === "list"}
                className={[
                  "h-8 w-8 rounded-full flex items-center justify-center transition",
                  view === "list" ? "bg-white text-black" : "text-white/55 hover:bg-white/10 hover:text-white",
                ].join(" ")}
                title="Vue liste"
                aria-label="Vue liste"
              >
                <ListIcon size={15} />
              </button>
            </div>
          )}
          {!loading && tracks.length > 0 && (
            <button
              type="button"
              onClick={() => setQueueAndPlay(queue, 0)}
              className="flex items-center gap-2 h-9 px-4 rounded-full bg-white/8 border border-white/10 text-xs text-white/60 hover:bg-white/12 transition"
            >
              <Play size={11} className="fill-current" />
              Tout écouter
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex items-center gap-3 rounded-2xl px-3 py-3 sm:py-2.5">
              <div className="h-10 w-10 shrink-0 rounded-xl bg-white/5 animate-pulse" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 w-1/2 rounded-full bg-white/5 animate-pulse" />
                <div className="h-2.5 w-1/3 rounded-full bg-white/4 animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      ) : !following || following.length === 0 ? (
        <div className="py-20 text-center">
          <Rss size={32} className="mx-auto mb-4 text-white/10" />
          <p className="text-white/35 text-sm mb-2">Tu ne suis personne encore.</p>
          <p className="text-white/20 text-xs">Abonne-toi à des profils pour voir leurs sons ici.</p>
        </div>
      ) : tracks.length === 0 ? (
        <div className="py-20 text-center">
          <Music size={32} className="mx-auto mb-4 text-white/10" />
          <p className="text-white/35 text-sm">Aucun son de tes abonnements pour l&apos;instant.</p>
        </div>
      ) : view === "grid" ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-5">
          {tracks.map((track, idx) => (
            <AlbumCard
              key={track.src}
              title={track.title}
              subtitle={track.ownerDisplayName ? `${track.artist} - ${track.ownerDisplayName}` : track.artist}
              track={{
                title: track.title,
                artist: track.artist,
                src: track.src,
                cover: track.cover ?? undefined,
                ownerDisplayName: track.ownerDisplayName ?? undefined,
                ownerId: track.ownerId ?? undefined,
                credits: track.credits ?? undefined,
              }}
              hoverEffect="shrink"
              animationDelay={`${Math.min(idx, 9) * 40}ms`}
            />
          ))}
        </div>
      ) : (
        <div className="space-y-0.5">
          {tracks.map((track, idx) => (
            <FeedRow
              key={track.src}
              track={track}
              playerTrack={queue[idx]}
              idx={idx}
              queue={queue}
              onPlay={setQueueAndPlay}
              onOpenMenu={setMenuTrack}
            />
          ))}
        </div>
      )}

      {following && following.length > 0 ? (
        <InfiniteScrollSentinel onLoadMore={infinite.fetchNextPage} hasMore={infinite.hasMore} loading={infinite.loading} />
      ) : null}

      <TrackContextMenu track={menuTrack} onClose={() => setMenuTrack(null)} />
    </div>
  );
}
