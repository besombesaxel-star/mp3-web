"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GripVertical, Music2, Plus, Users } from "lucide-react";
import { useAuth } from "../AuthProvider";
import { createAuthorizedHeaders } from "@/lib/clientAuth";
import { usePlayer, Track } from "../PlayerContext";
import { fetchTracksShared } from "../tracksCache";
import { subscribeTracksUpdated } from "../tracksSync";
import { toast } from "../Toast";
import { useLongPress } from "../useLongPress";
import TrackContextMenu from "../TrackContextMenu";
import { formatDuration, useTracksTotalDuration } from "../trackDuration";
import SharedPlaylistModal, { type SharedPlaylist } from "../SharedPlaylistModal";

type TrackWithCover = Track & { cover?: string };

function PlaylistCover({ tracks, size = 44 }: { tracks: TrackWithCover[]; size?: number }) {
  const covers = useMemo(() => {
    const seen = new Set<string>();
    const list: string[] = [];
    for (const track of tracks) {
      if (!track.cover || seen.has(track.cover)) continue;
      seen.add(track.cover);
      list.push(track.cover);
      if (list.length === 4) break;
    }
    return list;
  }, [tracks]);

  return (
    <div
      className="relative shrink-0 grid grid-cols-2 grid-rows-2 overflow-hidden rounded-xl border border-white/5 bg-[#1A1A22]"
      style={{ width: size, height: size }}
    >
      {covers.length === 0 ? (
        <div className="col-span-2 row-span-2 flex items-center justify-center text-white/15">
          <Music2 size={Math.round(size * 0.42)} />
        </div>
      ) : (
        covers.map((cover, i) => {
          let spanClass = "";
          if (covers.length === 1) spanClass = "col-span-2 row-span-2";
          else if (covers.length === 2) spanClass = "row-span-2";
          else if (covers.length === 3 && i === 0) spanClass = "col-span-2";

          return (
            <div key={cover} className={`relative ${spanClass}`}>
              <Image src={cover} alt="" fill className="object-cover" sizes={`${size}px`} />
            </div>
          );
        })
      )}
    </div>
  );
}

function ActivePlaylistRow({
  track,
  index = 0,
  onPlay,
  onOpenMenu,
  reorderEnabled,
  isDragging,
  isDragOver,
  onDragHandlePointerDown,
  onDragPointerMove,
  onDragPointerUp,
  rowRef,
}: {
  track: TrackWithCover;
  index?: number;
  onPlay: (src: string) => void;
  onOpenMenu: (t: Track) => void;
  reorderEnabled: boolean;
  isDragging: boolean;
  isDragOver: boolean;
  onDragHandlePointerDown: (e: React.PointerEvent, index: number) => void;
  onDragPointerMove: (e: React.PointerEvent) => void;
  onDragPointerUp: (e: React.PointerEvent) => void;
  rowRef: (el: HTMLDivElement | null) => void;
}) {
  const longPress = useLongPress({ onLongPress: () => onOpenMenu(track) });

  return (
    <div
      ref={rowRef}
      className={[
        "group flex items-center gap-1 rounded-2xl transition mp3-fade-up",
        isDragging ? "opacity-40" : "",
        isDragOver ? "bg-white/10 ring-1 ring-white/20" : "",
      ].join(" ")}
      style={{ animationDelay: `${Math.min(index, 14) * 25}ms` }}
    >
      {reorderEnabled ? (
        <button
          type="button"
          onPointerDown={(e) => onDragHandlePointerDown(e, index)}
          onPointerMove={onDragPointerMove}
          onPointerUp={onDragPointerUp}
          onPointerCancel={onDragPointerUp}
          className="shrink-0 h-10 w-8 flex items-center justify-center rounded-lg text-white/20 hover:text-white/60 hover:bg-white/5 cursor-grab active:cursor-grabbing"
          style={{ touchAction: "none" }}
          aria-label={`Réordonner ${track.title}`}
          title="Glisser pour réordonner"
        >
          <GripVertical size={16} />
        </button>
      ) : null}

      <button
        type="button"
        onClick={() => {
          if (longPress.didLongPress()) return;
          onPlay(track.src);
        }}
        onTouchStart={longPress.onTouchStart}
        onTouchMove={longPress.onTouchMove}
        onTouchEnd={longPress.onTouchEnd}
        onTouchCancel={longPress.onTouchCancel}
        onContextMenu={longPress.onContextMenu}
        className="flex-1 min-w-0 flex items-center justify-between gap-4 rounded-2xl px-2 py-3 hover:bg-white/5 transition text-left"
        title="Lire"
      >
        <div className="min-w-0 flex items-center gap-4">
          <div className="relative h-12 w-12 overflow-hidden rounded-xl border border-white/5 bg-[#1A1A22]">
            {track.cover ? (
              <Image src={track.cover} alt={track.title} fill className="object-cover" sizes="48px" />
            ) : null}
          </div>
          <div className="min-w-0">
            <p className="text-sm text-white/90 truncate">{track.title}</p>
            <p className="text-xs text-white/45 truncate">{track.artist ?? "-"}</p>
          </div>
        </div>

        <span className="text-xs text-white/35 group-hover:text-white/70 transition">Play</span>
      </button>
    </div>
  );
}

type Playlist = {
  id: string;
  name: string;
  trackSrcs: string[];
};

type DynamicPlaylist = {
  id: string;
  name: string;
  subtitle: string;
  tracks: TrackWithCover[];
};

type PlaylistBadge = {
  label: string;
  tone: "sky" | "emerald" | "amber";
};

const LS_KEY = "mp3_playlists_v1";

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function isValidPlaylist(value: unknown): value is Playlist {
  if (!value || typeof value !== "object") return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.id === "string" &&
    typeof obj.name === "string" &&
    Array.isArray(obj.trackSrcs) &&
    obj.trackSrcs.every((src) => typeof src === "string")
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

export default function PlaylistsPage() {
  const { accessToken, isAuthenticated, loading, user } = useAuth();
  const { setQueueAndPlay, markPlaylistCreated, stats, favorites } = usePlayer();

  const [library, setLibrary] = useState<TrackWithCover[]>([]);
  const [libLoading, setLibLoading] = useState(true);
  const [libError, setLibError] = useState("");

  const [sharedPlaylists, setSharedPlaylists] = useState<SharedPlaylist[]>([]);
  const [sharedLoading, setSharedLoading] = useState(false);
  const [newSharedName, setNewSharedName] = useState("");
  const [creatingShared, setCreatingShared] = useState(false);
  const [openSharedId, setOpenSharedId] = useState<string | null>(null);

  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [playlistsHydrated, setPlaylistsHydrated] = useState(false);
  const [activeId, setActiveId] = useState("");

  const [newName, setNewName] = useState("");
  const [renameValue, setRenameValue] = useState("");
  const [search, setSearch] = useState("");
  const [menuTrack, setMenuTrack] = useState<Track | null>(null);
  const [activeTracksSearch, setActiveTracksSearch] = useState("");
  const [activeSort, setActiveSort] = useState<"default" | "title" | "artist">("default");
  const [deletedSnapshot, setDeletedSnapshot] = useState<{ playlist: Playlist; index: number } | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playlistsRemoteHydratedRef = useRef(false);
  const lastSyncedPlaylistsSignatureRef = useRef("");

  const [dragFromIndex, setDragFromIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const activeRowRefs = useRef<Array<HTMLDivElement | null>>([]);

  const loadLibrary = useCallback(async () => {
    try {
      setLibLoading(true);
      setLibError("");

      const list = await fetchTracksShared(accessToken);

      setLibrary(
        list.map((track) => ({
          title: track.title,
          artist: track.artist,
          src: track.src,
          cover: track.cover ?? undefined,
          ownerDisplayName: track.ownerDisplayName ?? undefined,
          ownerId: track.ownerId ?? undefined,
          credits: track.credits ?? undefined,
        }))
      );
    } catch (errorValue: unknown) {
      setLibError(getErrorMessage(errorValue, "Erreur lors du chargement"));
      setLibrary([]);
    } finally {
      setLibLoading(false);
    }
  }, [accessToken]);

  function clearUndoTimer() {
    if (undoTimerRef.current) {
      clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }
  }

  function queueDeletedSnapshot(snapshot: { playlist: Playlist; index: number }) {
    clearUndoTimer();
    setDeletedSnapshot(snapshot);
    undoTimerRef.current = setTimeout(() => {
      setDeletedSnapshot(null);
      undoTimerRef.current = null;
    }, 7000);
  }

  useEffect(() => {
    void loadLibrary();
  }, [loadLibrary]);

  useEffect(() => {
    return subscribeTracksUpdated(() => {
      void loadLibrary();
    });
  }, [loadLibrary]);

  useEffect(() => {
    return () => clearUndoTimer();
  }, []);

  // load playlists: from the account if signed in, else from localStorage
  useEffect(() => {
    let cancelled = false;

    function hydrateLocalPlaylists() {
      try {
        const raw = localStorage.getItem(LS_KEY);
        const parsed = raw ? (JSON.parse(raw) as unknown) : [];
        const valid = Array.isArray(parsed) ? parsed.filter(isValidPlaylist) : [];
        setPlaylists(valid);
        setActiveId(valid[0]?.id ?? "");
      } catch {
        setPlaylists([]);
        setActiveId("");
      }
      setPlaylistsHydrated(true);
    }

    async function hydrateRemotePlaylists() {
      try {
        const res = await fetch("/api/account", {
          cache: "no-store",
          headers: createAuthorizedHeaders(accessToken),
        });
        if (!res.ok) {
          playlistsRemoteHydratedRef.current = false;
          hydrateLocalPlaylists();
          return;
        }

        const json = await res.json();
        const remotePlaylists: Playlist[] = Array.isArray(json.playlists)
          ? json.playlists.filter(isValidPlaylist)
          : [];
        if (cancelled) return;

        lastSyncedPlaylistsSignatureRef.current = JSON.stringify(remotePlaylists);
        playlistsRemoteHydratedRef.current = true;
        setPlaylists(remotePlaylists);
        setActiveId(remotePlaylists[0]?.id ?? "");
        setPlaylistsHydrated(true);
      } catch {
        playlistsRemoteHydratedRef.current = false;
        if (!cancelled) hydrateLocalPlaylists();
      }
    }

    if (loading) return;

    setPlaylistsHydrated(false);

    if (!isAuthenticated || !accessToken) {
      playlistsRemoteHydratedRef.current = false;
      lastSyncedPlaylistsSignatureRef.current = "";
      hydrateLocalPlaylists();
      return;
    }

    void hydrateRemotePlaylists();

    return () => {
      cancelled = true;
    };
  }, [accessToken, isAuthenticated, loading]);

  // load shared (collaborative) playlists
  const loadSharedPlaylists = useCallback(async () => {
    if (!accessToken) {
      setSharedPlaylists([]);
      return;
    }
    setSharedLoading(true);
    try {
      const res = await fetch("/api/playlists/shared", { cache: "no-store", headers: createAuthorizedHeaders(accessToken) });
      const json = await res.json();
      setSharedPlaylists(Array.isArray(json.playlists) ? json.playlists : []);
    } catch {
      setSharedPlaylists([]);
    } finally {
      setSharedLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    if (loading) return;
    if (!isAuthenticated || !accessToken) {
      setSharedPlaylists([]);
      return;
    }
    void loadSharedPlaylists();
  }, [accessToken, isAuthenticated, loading, loadSharedPlaylists]);

  async function createSharedPlaylist() {
    const name = newSharedName.trim();
    if (!name || !accessToken || creatingShared) return;
    setCreatingShared(true);
    try {
      const res = await fetch("/api/playlists/shared", {
        method: "POST",
        headers: createAuthorizedHeaders(accessToken, { "Content-Type": "application/json" }),
        body: JSON.stringify({ name }),
      });
      const json = (await res.json()) as { ok?: boolean; playlist?: SharedPlaylist };
      if (res.ok && json.ok && json.playlist) {
        setSharedPlaylists((prev) => [json.playlist as SharedPlaylist, ...prev]);
        setNewSharedName("");
        setOpenSharedId(json.playlist.id);
        markPlaylistCreated();
      }
    } catch {}
    finally {
      setCreatingShared(false);
    }
  }

  function updateSharedPlaylistInList(playlist: SharedPlaylist) {
    setSharedPlaylists((prev) => prev.map((p) => (p.id === playlist.id ? playlist : p)));
  }

  function removeSharedPlaylistFromList(id: string) {
    setSharedPlaylists((prev) => prev.filter((p) => p.id !== id));
  }

  // cache playlists locally for offline-first access
  useEffect(() => {
    if (!playlistsHydrated) return;
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(playlists));
    } catch {}
  }, [playlistsHydrated, playlists]);

  // push playlist changes to the account
  useEffect(() => {
    if (loading || !isAuthenticated || !accessToken || !playlistsRemoteHydratedRef.current) {
      return;
    }

    const signature = JSON.stringify(playlists);
    if (signature === lastSyncedPlaylistsSignatureRef.current) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void fetch("/api/account", {
        method: "PUT",
        headers: createAuthorizedHeaders(accessToken, { "Content-Type": "application/json" }),
        body: JSON.stringify({ playlists }),
      })
        .then((res) => {
          if (!res.ok) {
            throw new Error("playlist sync failed");
          }

          lastSyncedPlaylistsSignatureRef.current = signature;
        })
        .catch(() => {});
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [accessToken, loading, isAuthenticated, playlists]);

  useEffect(() => {
    if (libLoading) return;
    if (!playlistsHydrated) return;
    if (playlists.length > 0) return;

    const def: Playlist = {
      id: uid(),
      name: "Tout",
      trackSrcs: library.map((track) => track.src),
    };
    setPlaylists([def]);
    setActiveId(def.id);
    setRenameValue("");
  }, [libLoading, playlistsHydrated, library, playlists.length]);

  const libraryBySrc = useMemo(() => {
    const map = new Map<string, TrackWithCover>();
    for (const track of library) map.set(track.src, track);
    return map;
  }, [library]);

  const active = playlists.find((playlist) => playlist.id === activeId) ?? playlists[0] ?? null;

  const activeTracks = useMemo(() => {
    if (!active) return [];
    return active.trackSrcs
      .map((src) => libraryBySrc.get(src))
      .filter((track): track is TrackWithCover => Boolean(track));
  }, [active, libraryBySrc]);

  const filteredActiveTracks = useMemo(() => {
    const value = activeTracksSearch.trim().toLowerCase();
    const base = !value
      ? activeTracks
      : activeTracks.filter((track) => `${track.title} ${track.artist ?? ""}`.toLowerCase().includes(value));

    if (activeSort === "title") return [...base].sort((a, b) => a.title.localeCompare(b.title, "fr"));
    if (activeSort === "artist") return [...base].sort((a, b) => (a.artist ?? "").localeCompare(b.artist ?? "", "fr"));
    return base;
  }, [activeTracks, activeTracksSearch, activeSort]);

  const reorderEnabled = activeSort === "default" && activeTracksSearch.trim() === "" && filteredActiveTracks.length > 1;

  const playlistTracksById = useMemo(() => {
    const map = new Map<string, TrackWithCover[]>();
    for (const playlist of playlists) {
      map.set(
        playlist.id,
        playlist.trackSrcs
          .map((src) => libraryBySrc.get(src))
          .filter((track): track is TrackWithCover => Boolean(track))
      );
    }
    return map;
  }, [playlists, libraryBySrc]);

  const activeTotalDuration = useTracksTotalDuration(activeTracks.map((track) => track.src));

  const filteredLibrary = useMemo(() => {
    const value = search.trim().toLowerCase();
    if (!value) return library;
    return library.filter((track) => `${track.title} ${track.artist ?? ""}`.toLowerCase().includes(value));
  }, [library, search]);

  const dynamicPlaylists = useMemo<DynamicPlaylist[]>(() => {
    const now = Date.now();
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

    const latestPlayedAtBySrc = new Map<string, number>();
    for (const event of stats.recentPlays) {
      const previous = latestPlayedAtBySrc.get(event.src) ?? 0;
      if (event.playedAt > previous) latestPlayedAtBySrc.set(event.src, event.playedAt);
    }

    const unplayed30 = library.filter((track) => {
      const lastPlayedAt = latestPlayedAtBySrc.get(track.src) ?? 0;
      return lastPlayedAt === 0 || lastPlayedAt < thirtyDaysAgo;
    });

    const discoveriesMonth = library
      .filter((track) => (stats.firstPlayedAtByTrack[track.src] ?? 0) >= thirtyDaysAgo)
      .sort((a, b) => (stats.firstPlayedAtByTrack[b.src] ?? 0) - (stats.firstPlayedAtByTrack[a.src] ?? 0));

    const weekCountBySrc = new Map<string, number>();
    for (const event of stats.recentPlays) {
      if (event.playedAt < sevenDaysAgo) continue;
      weekCountBySrc.set(event.src, (weekCountBySrc.get(event.src) ?? 0) + 1);
    }

    const topWeek = [...weekCountBySrc.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([src]) => libraryBySrc.get(src))
      .filter((track): track is TrackWithCover => Boolean(track));

    return [
      {
        id: "dyn-unplayed-30",
        name: "Pas ecoutes depuis 30 jours",
        subtitle: "Redecouvre les oublies",
        tracks: unplayed30,
      },
      {
        id: "dyn-discoveries-month",
        name: "Decouvertes du mois",
        subtitle: "Ce que tu as trouve recemment",
        tracks: discoveriesMonth,
      },
      {
        id: "dyn-top-week",
        name: "Top de la semaine",
        subtitle: "Selon tes lectures des 7 derniers jours",
        tracks: topWeek,
      },
    ];
  }, [library, libraryBySrc, stats.firstPlayedAtByTrack, stats.recentPlays]);

  const dynamicPlaylistBadgesById = useMemo(() => {
    const now = Date.now();
    const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
    const freshAgo = now - 14 * 24 * 60 * 60 * 1000;
    const favoriteSrcSet = new Set(favorites.map((item) => item.src));
    const weekPlaysBySrc = new Map<string, number>();

    for (const event of stats.recentPlays) {
      if (event.playedAt < weekAgo) continue;
      weekPlaysBySrc.set(event.src, (weekPlaysBySrc.get(event.src) ?? 0) + 1);
    }

    const byId: Record<string, PlaylistBadge[]> = {};

    for (const playlist of dynamicPlaylists) {
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

      if (playlist.id.includes("discoveries") || freshCount >= Math.max(2, Math.ceil(total * 0.22))) {
        badges.push({ label: "Nouveau", tone: "emerald" });
      }

      if (favoriteCount >= Math.max(2, Math.ceil(total * 0.3))) {
        badges.push({ label: "Favori", tone: "amber" });
      }

      byId[playlist.id] = badges.slice(0, 2);
    }

    return byId;
  }, [dynamicPlaylists, favorites, stats.firstPlayedAtByTrack, stats.recentPlays]);

  function selectPlaylist(id: string) {
    setActiveId(id);
    setRenameValue("");
  }

  function createPlaylist() {
    const name = newName.trim();
    if (!name) return;

    const playlist: Playlist = { id: uid(), name, trackSrcs: [] };
    setPlaylists((prev) => [playlist, ...prev]);
    setActiveId(playlist.id);
    setNewName("");
    setRenameValue("");
    markPlaylistCreated();
  }

  function deletePlaylist(id: string) {
    const deleteIndex = playlists.findIndex((playlist) => playlist.id === id);
    if (deleteIndex < 0) return;

    const removed = playlists[deleteIndex];
    const remaining = playlists.filter((playlist) => playlist.id !== id);
    setPlaylists(remaining);

    if (activeId === id) {
      setActiveId(remaining[0]?.id ?? "");
    }

    queueDeletedSnapshot({ playlist: removed, index: deleteIndex });
  }

  function undoDeletePlaylist() {
    if (!deletedSnapshot) return;

    const { playlist, index } = deletedSnapshot;
    setPlaylists((prev) => {
      if (prev.some((item) => item.id === playlist.id)) return prev;
      const next = [...prev];
      const insertAt = Math.max(0, Math.min(index, next.length));
      next.splice(insertAt, 0, playlist);
      return next;
    });
    setActiveId(playlist.id);
    clearUndoTimer();
    setDeletedSnapshot(null);
  }

  function renamePlaylist(id: string) {
    const name = renameValue.trim();
    if (!name) return;
    setPlaylists((prev) => prev.map((playlist) => (playlist.id === id ? { ...playlist, name } : playlist)));
    setRenameValue("");
  }

  function toggleTrackInActive(src: string) {
    if (!active) return;
    const alreadyIn = active.trackSrcs.includes(src);
    setPlaylists((prev) =>
      prev.map((playlist) => {
        if (playlist.id !== active.id) return playlist;
        return {
          ...playlist,
          trackSrcs: alreadyIn
            ? playlist.trackSrcs.filter((value) => value !== src)
            : [...playlist.trackSrcs, src],
        };
      })
    );
    if (!alreadyIn) toast(`Ajouté à « ${active.name} »`, "check");
  }

  function removeTrackFromActive(src: string) {
    if (!active) return;
    setPlaylists((prev) =>
      prev.map((playlist) =>
        playlist.id === active.id
          ? { ...playlist, trackSrcs: playlist.trackSrcs.filter((value) => value !== src) }
          : playlist
      )
    );
    toast(`Retiré de « ${active.name} »`, "check");
  }

  function reorderActiveTrack(fromIndex: number, toIndex: number) {
    if (!active || fromIndex === toIndex) return;
    setPlaylists((prev) =>
      prev.map((playlist) => {
        if (playlist.id !== active.id) return playlist;
        const next = [...playlist.trackSrcs];
        const [moved] = next.splice(fromIndex, 1);
        next.splice(toIndex, 0, moved);
        return { ...playlist, trackSrcs: next };
      })
    );
  }

  function handleDragHandlePointerDown(e: React.PointerEvent, index: number) {
    if (!reorderEnabled) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDragFromIndex(index);
    setDragOverIndex(index);
  }

  function handleDragPointerMove(e: React.PointerEvent) {
    if (dragFromIndex === null) return;
    const y = e.clientY;
    for (let i = 0; i < activeRowRefs.current.length; i += 1) {
      const el = activeRowRefs.current[i];
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      if (y >= rect.top && y <= rect.bottom) {
        setDragOverIndex((prev) => (prev === i ? prev : i));
        break;
      }
    }
  }

  function handleDragPointerUp() {
    if (dragFromIndex === null) return;
    const from = dragFromIndex;
    const to = dragOverIndex ?? dragFromIndex;
    setDragFromIndex(null);
    setDragOverIndex(null);
    if (from !== to) reorderActiveTrack(from, to);
  }

  function playActive(startIndex: number) {
    if (!activeTracks.length) return;
    setQueueAndPlay(activeTracks, startIndex);
  }

  function playActiveTrack(src: string) {
    const startIndex = activeTracks.findIndex((item) => item.src === src);
    if (startIndex < 0) return;
    setQueueAndPlay(activeTracks, startIndex);
  }

  function playDynamic(playlist: DynamicPlaylist, startIndex = 0) {
    if (!playlist.tracks.length) return;
    setQueueAndPlay(playlist.tracks, startIndex);
  }

  function saveDynamicAsPlaylist(playlist: DynamicPlaylist) {
    if (!playlist.tracks.length) return;

    const existing = playlists.find((item) => item.name.toLowerCase() === playlist.name.toLowerCase());
    if (existing) {
      setPlaylists((prev) =>
        prev.map((item) =>
          item.id === existing.id ? { ...item, trackSrcs: playlist.tracks.map((track) => track.src) } : item
        )
      );
      setActiveId(existing.id);
      return;
    }

    const created: Playlist = {
      id: uid(),
      name: playlist.name,
      trackSrcs: playlist.tracks.map((track) => track.src),
    };

    setPlaylists((prev) => [created, ...prev]);
    setActiveId(created.id);
    markPlaylistCreated();
  }

  useEffect(() => {
    setActiveTracksSearch("");
  }, [activeId]);

  return (
    <div className="pb-[calc(11rem+env(safe-area-inset-bottom))] sm:pb-28">
      <div className="flex items-end justify-between mb-8 mp3-fade-up">
        <h2 className="text-3xl font-light">Playlists</h2>
        <span className="text-sm text-white/35">
          {isAuthenticated ? "Synchronisees avec ton compte" : "Locales sur cet appareil"}
        </span>
      </div>

      {!loading && !isAuthenticated ? (
        <p className="mb-6 text-xs text-white/45">
          Connecte-toi dans <Link href="/account" className="text-white/85 underline underline-offset-4">Compte</Link> pour retrouver tes playlists sur tous tes appareils.
        </p>
      ) : null}

      <section className="mb-6 rounded-3xl border border-white/10 bg-[#121218] p-4 mp3-fade-up" style={{ animationDelay: "40ms" }}>
        <div className="flex items-end justify-between mb-3">
          <div>
            <p className="text-xs text-white/45">Playlists dynamiques</p>
            <p className="text-sm text-white/85">Mises a jour a partir de ton historique.</p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {dynamicPlaylists.map((playlist, index) => {
            const badges = dynamicPlaylistBadgesById[playlist.id] ?? [];

            return (
            <div
              key={playlist.id}
              className="rounded-2xl border border-white/10 bg-white/5 p-3 transition hover:-translate-y-0.5 hover:bg-white/8 mp3-fade-up"
              style={{ animationDelay: `${80 + index * 30}ms` }}
            >
              <div className="flex items-start gap-3">
                <PlaylistCover tracks={playlist.tracks} size={40} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm text-white/90 truncate">{playlist.name}</p>
                    {badges.length > 0 ? (
                      <div className="flex flex-wrap items-center justify-end gap-1 shrink-0">
                        {badges.map((badge) => (
                          <span
                            key={`${playlist.id}-${badge.label}`}
                            className={`rounded-full border px-2 py-1 text-[10px] font-medium tracking-wide ${badgeToneClass(
                              badge.tone
                            )}`}
                          >
                            {badge.label}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs text-white/45 truncate">{playlist.subtitle}</p>
                </div>
              </div>
              <p className="mt-2 text-xs text-white/35">{playlist.tracks.length} morceau(x)</p>

              <div className="mt-3 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => playDynamic(playlist)}
                  disabled={playlist.tracks.length === 0}
                  className="h-8 px-3 rounded-lg bg-white text-black text-xs font-medium hover:opacity-90 transition disabled:opacity-60"
                >
                  Lire
                </button>
                <button
                  type="button"
                  onClick={() => saveDynamicAsPlaylist(playlist)}
                  disabled={playlist.tracks.length === 0}
                  className="h-8 px-3 rounded-lg bg-white/10 text-white text-xs hover:bg-white/15 transition disabled:opacity-60"
                >
                  Sauver
                </button>
              </div>
            </div>
            );
          })}
        </div>
      </section>

      {isAuthenticated ? (
        <section className="mb-6 rounded-3xl border border-white/10 bg-[#121218] p-4 mp3-fade-up" style={{ animationDelay: "60ms" }}>
          <div className="flex items-end justify-between mb-3">
            <div>
              <p className="text-xs text-white/45 flex items-center gap-1.5">
                <Users size={12} />
                Playlists partagees
              </p>
              <p className="text-sm text-white/85">Plusieurs contributeurs, une seule playlist.</p>
            </div>
          </div>

          <div className="flex gap-2 mb-4">
            <input
              value={newSharedName}
              onChange={(e) => setNewSharedName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void createSharedPlaylist();
              }}
              placeholder="Nom de la playlist partagee..."
              className="flex-1 rounded-2xl bg-[#111118] border border-white/5 px-3 py-2 text-base sm:text-sm text-white/90 outline-none placeholder:text-white/35"
            />
            <button
              type="button"
              onClick={() => void createSharedPlaylist()}
              disabled={!newSharedName.trim() || creatingShared}
              className="rounded-2xl bg-white text-black text-sm font-medium px-4 hover:opacity-90 transition disabled:opacity-50 flex items-center gap-1.5"
            >
              <Plus size={14} />
              Creer
            </button>
          </div>

          {sharedLoading ? (
            <p className="text-xs text-white/30">Chargement...</p>
          ) : sharedPlaylists.length === 0 ? (
            <p className="text-xs text-white/30">Aucune playlist partagee pour l&apos;instant.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {sharedPlaylists.map((playlist, index) => {
                const tracks = playlist.trackSrcs.map((src) => library.find((t) => t.src === src)).filter((t): t is TrackWithCover => Boolean(t));
                const isOwner = playlist.ownerId === user?.id;
                return (
                  <button
                    key={playlist.id}
                    type="button"
                    onClick={() => setOpenSharedId(playlist.id)}
                    className="text-left rounded-2xl border border-white/10 bg-white/5 p-3 transition hover:-translate-y-0.5 hover:bg-white/8 mp3-fade-up"
                    style={{ animationDelay: `${80 + index * 30}ms` }}
                  >
                    <div className="flex items-start gap-3">
                      <PlaylistCover tracks={tracks} size={40} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-white/90 truncate">{playlist.name}</p>
                        <p className="mt-1 text-xs text-white/45 truncate">
                          {isOwner ? "Toi (proprietaire)" : `${playlist.collaboratorIds.length + 1} contributeurs`}
                        </p>
                      </div>
                    </div>
                    <p className="mt-2 text-xs text-white/35">{playlist.trackSrcs.length} morceau(x)</p>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6">
        <section className="rounded-3xl bg-[#15151C] border border-white/5 p-4 mp3-fade-up" style={{ animationDelay: "120ms" }}>
          <p className="text-xs text-white/45 px-2 mb-3">Mes playlists</p>

          <div className="flex gap-2 mb-3">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Nouvelle playlist..."
              className="flex-1 rounded-2xl bg-[#111118] border border-white/5 px-3 py-2 text-base sm:text-sm text-white/90 outline-none placeholder:text-white/35"
            />
            <button
              onClick={createPlaylist}
              className="rounded-2xl bg-white text-black text-sm font-medium px-4 hover:opacity-90 transition"
              type="button"
            >
              +
            </button>
          </div>

          <div className="flex flex-col gap-2">
            {playlists.map((playlist, index) => {
              const isActive = playlist.id === (active?.id ?? "");

              return (
                <div
                  key={playlist.id}
                  className={[
                    "rounded-2xl border transition mp3-fade-up",
                    isActive ? "bg-white/8 border-white/10" : "bg-transparent border-white/5",
                  ].join(" ")}
                  style={{ animationDelay: `${150 + Math.min(index, 14) * 25}ms` }}
                >
                  <div className="flex items-stretch gap-1 p-1">
                    <button
                      type="button"
                      onClick={() => selectPlaylist(playlist.id)}
                      className={[
                        "flex-1 min-w-0 flex items-center gap-3 text-left rounded-xl px-2 py-2",
                        isActive ? "text-white" : "text-white/85 hover:bg-white/5",
                      ].join(" ")}
                      aria-current={isActive ? "true" : undefined}
                    >
                      <PlaylistCover tracks={playlistTracksById.get(playlist.id) ?? []} size={40} />
                      <div className="min-w-0">
                        <p className="text-sm truncate">{playlist.name}</p>
                        <p className="text-xs text-white/40 truncate">{playlist.trackSrcs.length} morceau(x)</p>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => deletePlaylist(playlist.id)}
                      className="shrink-0 h-10 px-3 rounded-xl text-xs text-white/45 hover:text-white hover:bg-white/5"
                      title="Supprimer"
                      aria-label={`Supprimer ${playlist.name}`}
                    >
                      Suppr.
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="rounded-3xl bg-[#15151C] border border-white/5 p-4 mp3-fade-up" style={{ animationDelay: "160ms" }}>
          {!active ? (
            <div className="px-3 py-10 text-sm text-white/45">Cree une playlist pour commencer.</div>
          ) : (
            <>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-5 px-2">
                <div className="min-w-0 flex items-center gap-4">
                  <PlaylistCover tracks={activeTracks} size={64} />
                  <div className="min-w-0">
                    <p className="text-xs text-white/45">Playlist</p>
                    <p className="text-xl text-white/90 font-light truncate">{active.name}</p>
                    <p className="text-sm text-white/45 mt-1">
                      {activeTracks.length} morceau(x)
                      {activeTotalDuration.loadedCount > 0
                        ? ` · ${formatDuration(activeTotalDuration.totalSeconds)}${
                            activeTotalDuration.loadedCount < activeTotalDuration.total ? "+" : ""
                          }`
                        : ""}
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => playActive(0)}
                  className="h-11 px-5 rounded-full bg-white text-black text-sm font-medium hover:opacity-90 transition disabled:opacity-60"
                  disabled={activeTracks.length === 0}
                  type="button"
                >
                  Lecture
                </button>
              </div>

              <div className="flex gap-2 mb-6 px-2">
                <input
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  placeholder="Renommer..."
                  className="flex-1 rounded-2xl bg-[#111118] border border-white/5 px-3 py-2 text-base sm:text-sm text-white/90 outline-none placeholder:text-white/35"
                />
                <button
                  onClick={() => renamePlaylist(active.id)}
                  className="rounded-2xl bg-white/10 text-white/80 text-sm px-4 hover:bg-white/15 transition"
                  type="button"
                >
                  OK
                </button>
              </div>

              <div className="mb-6">
                <div className="flex items-center justify-between gap-3 px-2 mb-2">
                  <p className="text-xs text-white/45">Morceaux dans la playlist</p>
                  {activeTracks.length > 1 ? (
                    <select
                      value={activeSort}
                      onChange={(e) => setActiveSort(e.target.value as "default" | "title" | "artist")}
                      aria-label="Trier par"
                      className="h-7 px-2.5 rounded-lg text-xs bg-white/5 text-white/60 border border-white/10 hover:bg-white/10 transition outline-none cursor-pointer"
                    >
                      <option value="default">Ordre d&apos;ajout</option>
                      <option value="title">Titre</option>
                      <option value="artist">Artiste</option>
                    </select>
                  ) : null}
                </div>

                {activeTracks.length > 8 ? (
                  <div className="mb-3 px-2">
                    <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                      <span className="text-white/35" aria-hidden="true">
                        /
                      </span>
                      <input
                        value={activeTracksSearch}
                        onChange={(e) => setActiveTracksSearch(e.target.value)}
                        placeholder="Rechercher dans cette playlist..."
                        className="w-full bg-transparent outline-none text-base sm:text-sm text-white/90 placeholder:text-white/35"
                        aria-label="Recherche dans la playlist active"
                      />
                      {activeTracksSearch ? (
                        <button
                          type="button"
                          onClick={() => setActiveTracksSearch("")}
                          className="text-xs text-white/45 hover:text-white/80 transition"
                          title="Effacer"
                        >
                          X
                        </button>
                      ) : null}
                    </label>
                    <p className="mt-2 text-xs text-white/40">
                      {filteredActiveTracks.length}/{activeTracks.length} morceau
                      {filteredActiveTracks.length > 1 ? "x" : ""}
                    </p>
                  </div>
                ) : null}

                {activeTracks.length === 0 ? (
                  <div className="px-2 py-6 text-sm text-white/45">Ajoute des morceaux depuis la liste en dessous.</div>
                ) : filteredActiveTracks.length === 0 ? (
                  <div className="px-2 py-6 text-sm text-white/45">
                    Aucun morceau trouve pour &quot;{activeTracksSearch}&quot;.
                  </div>
                ) : (
                  <div className="flex flex-col">
                    {activeTracks.length > 1 && !reorderEnabled ? (
                      <p className="px-2 pb-2 text-xs text-white/30">
                        Passe en tri &quot;Ordre d&apos;ajout&quot; sans recherche pour réordonner par glisser-déposer.
                      </p>
                    ) : null}
                    {filteredActiveTracks.map((track, index) => (
                      <ActivePlaylistRow
                        key={track.src}
                        track={track}
                        index={index}
                        onPlay={playActiveTrack}
                        onOpenMenu={setMenuTrack}
                        reorderEnabled={reorderEnabled}
                        isDragging={reorderEnabled && dragFromIndex === index}
                        isDragOver={reorderEnabled && dragOverIndex === index && dragFromIndex !== null && dragFromIndex !== index}
                        onDragHandlePointerDown={handleDragHandlePointerDown}
                        onDragPointerMove={handleDragPointerMove}
                        onDragPointerUp={handleDragPointerUp}
                        rowRef={(el) => {
                          activeRowRefs.current[index] = el;
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>

              <div>
                <div className="flex items-end justify-between px-2 mb-2">
                  <p className="text-xs text-white/45">Ajouter / retirer</p>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-white/35">
                      Bibliotheque ({library.length}) {libLoading ? "- chargement..." : ""}
                    </span>
                    <button
                      type="button"
                      onClick={loadLibrary}
                      className="h-8 px-3 rounded-lg bg-white/10 text-white text-xs hover:bg-white/15 transition"
                    >
                      Recharger
                    </button>
                  </div>
                </div>

                {libError ? <div className="px-2 mb-3 text-sm text-red-400">{libError}</div> : null}

                <div className="mb-3 px-2">
                  <div className="flex items-center gap-3 rounded-2xl border border-white/5 bg-[#111118] px-4 py-3">
                    <span className="text-white/35" aria-hidden="true">
                      /
                    </span>
                    <input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Rechercher un titre..."
                      className="w-full bg-transparent outline-none text-base sm:text-sm text-white/90 placeholder:text-white/35"
                    />
                    {search ? (
                      <button
                        type="button"
                        onClick={() => setSearch("")}
                        className="text-xs text-white/45 hover:text-white/80 transition"
                        title="Effacer"
                      >
                        X
                      </button>
                    ) : null}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2 px-2">
                  {filteredLibrary.map((track, index) => {
                    const inPlaylist = active.trackSrcs.includes(track.src);
                    return (
                      <button
                        key={track.src}
                        type="button"
                        onClick={() => toggleTrackInActive(track.src)}
                        className={[
                          "flex items-center gap-3 rounded-2xl border px-3 py-2 text-left transition mp3-fade-up",
                          inPlaylist ? "border-white/15 bg-white/8" : "border-white/5 hover:bg-white/5",
                        ].join(" ")}
                        style={{ animationDelay: `${Math.min(index, 19) * 20}ms` }}
                        title={inPlaylist ? "Retirer" : "Ajouter"}
                        aria-pressed={inPlaylist}
                      >
                        <div className="relative h-10 w-10 overflow-hidden rounded-xl border border-white/5 bg-[#1A1A22] shrink-0">
                          {track.cover ? (
                            <Image src={track.cover} alt={track.title} fill className="object-cover" sizes="40px" />
                          ) : null}
                        </div>

                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-white/90 truncate">{track.title}</p>
                          <p className="text-xs text-white/45 truncate">{track.artist ?? "-"}</p>
                        </div>

                        <span className="text-xs text-white/35">{inPlaylist ? "-" : "+"}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </section>
      </div>

      {deletedSnapshot ? (
        <div className="fixed bottom-[94px] left-1/2 -translate-x-1/2 z-[70] w-full max-w-lg px-4">
          <div className="rounded-2xl border border-white/10 bg-black/95 backdrop-blur-xl shadow-[0_18px_60px_rgba(0,0,0,0.55)] px-4 py-3 flex items-center justify-between gap-3">
            <p className="text-sm text-white/85 truncate">
              Playlist supprimee: <span className="text-white/95">{deletedSnapshot.playlist.name}</span>
            </p>
            <button
              type="button"
              onClick={undoDeletePlaylist}
              className="h-9 px-3 rounded-full bg-white text-black text-xs font-medium hover:opacity-90 transition shrink-0"
            >
              Annuler
            </button>
          </div>
        </div>
      ) : null}

      <TrackContextMenu
        track={menuTrack}
        onClose={() => setMenuTrack(null)}
        removeFromPlaylist={
          active && menuTrack
            ? { playlistName: active.name, onRemove: () => removeTrackFromActive(menuTrack.src) }
            : undefined
        }
      />

      {openSharedId ? (
        (() => {
          const openPlaylist = sharedPlaylists.find((p) => p.id === openSharedId);
          if (!openPlaylist) return null;
          return (
            <SharedPlaylistModal
              playlist={openPlaylist}
              library={library}
              onClose={() => setOpenSharedId(null)}
              onUpdated={updateSharedPlaylistInList}
              onDeleted={removeSharedPlaylistFromList}
              onPlay={(tracks, index) => setQueueAndPlay(tracks, index)}
            />
          );
        })()
      ) : null}
    </div>
  );
}
