"use client";

import Image from "next/image";
import Link from "next/link";
import { Music, Play, Search, User, X } from "lucide-react";
import { ReactNode, useEffect, useMemo, useState } from "react";
import { Track, usePlayer } from "../PlayerContext";
import { subscribeTracksUpdated } from "../tracksSync";
import { getInitials, hashStringToHue } from "@/lib/publicLinks";
import { useLongPress } from "../useLongPress";
import TrackContextMenu from "../TrackContextMenu";

type TrackWithCover = Track & { cover?: string };

type ApiTrack = {
  title: string;
  artist: string;
  src: string;
  cover: string | null;
  ownerDisplayName?: string | null;
  ownerId?: string | null;
};

type TracksResponse = { tracks?: ApiTrack[] };
type SearchTab = "all" | "titres" | "artistes" | "utilisateurs";

type ArtistEntry = { name: string; count: number; cover?: string };
type UserEntry = { id: string; displayName: string; trackCount: number };

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .toLowerCase()
    .trim();
}

function levenshtein(a: string, b: string) {
  const dp = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0)
  );
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[a.length][b.length];
}

function fuzzyMatch(haystack: string, needle: string): boolean {
  if (!needle) return true;
  const terms = needle.split(" ").filter(Boolean);
  if (terms.length > 1) return terms.every((t) => fuzzyMatch(haystack, t));
  if (haystack.includes(needle)) return true;
  const words = haystack.split(/\s+/).filter(Boolean);
  for (const word of words) {
    if (word.includes(needle)) return true;
    if (needle.length >= 4 && Math.abs(word.length - needle.length) <= 1 && levenshtein(word, needle) <= 1)
      return true;
  }
  let i = 0, j = 0;
  while (i < haystack.length && j < needle.length) {
    if (haystack[i] === needle[j]) j++;
    i++;
  }
  return j === needle.length;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function HighlightedText({ text, query }: { text: string; query: string }) {
  const clean = query.trim();
  if (!clean) return <>{text}</>;
  const regex = new RegExp(`(${escapeRegExp(clean)})`, "ig");
  const parts = text.split(regex);
  if (parts.length === 1) return <>{text}</>;
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === clean.toLowerCase() ? (
          <mark key={i} className="bg-white/20 text-white rounded px-[2px]">{part}</mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

function SectionHeader({
  title, count, onMore,
}: {
  title: string; count?: number; onMore?: () => void;
}) {
  return (
    <div className="flex items-center justify-between mb-3">
      <p className="text-xs uppercase tracking-[0.22em] text-white/25">
        {title}{typeof count === "number" && count > 0 ? ` · ${count}` : ""}
      </p>
      {onMore && (
        <button onClick={onMore} type="button"
          className="text-xs text-white/35 hover:text-white/70 transition">
          Voir plus →
        </button>
      )}
    </div>
  );
}

function EmptyState({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="mb-3">{icon}</div>
      <p className="text-sm text-white/35">{text}</p>
    </div>
  );
}

function TrackRow({
  track, idx, queue, active, query, isFav, onPlay, onHover,
}: {
  track: TrackWithCover; idx: number; queue: TrackWithCover[]; active: boolean;
  query: string; isFav: boolean;
  onPlay: (q: TrackWithCover[], i: number) => void;
  onHover: (i: number) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const longPress = useLongPress({ onLongPress: () => setMenuOpen(true) });

  return (
    <>
      <button
        type="button"
        role="option"
        aria-selected={active}
        onClick={() => {
          if (longPress.didLongPress()) return;
          onPlay(queue, idx);
        }}
        onMouseEnter={() => onHover(idx)}
        onTouchStart={longPress.onTouchStart}
        onTouchMove={longPress.onTouchMove}
        onTouchEnd={longPress.onTouchEnd}
        onTouchCancel={longPress.onTouchCancel}
        onContextMenu={longPress.onContextMenu}
        className={[
          "group flex items-center gap-3 rounded-2xl px-3 py-3 sm:py-2.5 transition w-full text-left",
          active ? "bg-white/10" : "hover:bg-white/5",
        ].join(" ")}
      >
        <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-xl bg-white/5">
          {track.cover ? (
            <Image src={track.cover} alt={track.title} fill className="object-cover" sizes="40px" />
          ) : (
            <div className="h-full w-full flex items-center justify-center">
              <Music size={11} className="text-white/20" />
            </div>
          )}
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition">
            <Play size={11} className="fill-white text-white ml-0.5" />
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm text-white/90 truncate">
            <HighlightedText text={track.title} query={query} />
          </p>
          <p className="text-xs text-white/40 truncate">
            <HighlightedText text={track.artist ?? "—"} query={query} />
          </p>
        </div>
        {isFav && (
          <span className="text-[9px] rounded-full border border-white/15 bg-white/8 px-2 py-0.5 text-white/45 shrink-0">
            ♥
          </span>
        )}
      </button>

      {menuOpen ? <TrackContextMenu track={track} onClose={() => setMenuOpen(false)} /> : null}
    </>
  );
}

function ArtistCard({
  artist, query, onPlay,
}: {
  artist: ArtistEntry; query: string; onPlay: (name: string) => void;
}) {
  const hue = hashStringToHue(artist.name);
  return (
    <button
      type="button"
      onClick={() => onPlay(artist.name)}
      className="group relative aspect-square rounded-2xl overflow-hidden border border-white/8 hover:border-white/20 transition"
    >
      {artist.cover ? (
        <Image src={artist.cover} alt={artist.name} fill className="object-cover" sizes="160px" />
      ) : (
        <div
          className="h-full w-full"
          style={{
            background: `linear-gradient(135deg, hsla(${hue}, 55%, 28%, 0.9), hsla(${(hue + 50) % 360}, 60%, 22%, 0.85))`,
          }}
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />
      <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 transition">
        <Play size={18} className="fill-white text-white" />
      </div>
      <div className="absolute bottom-0 left-0 right-0 p-2.5">
        <p className="text-[11px] font-semibold text-white/95 truncate leading-tight">
          <HighlightedText text={artist.name} query={query} />
        </p>
        <p className="text-[10px] text-white/45 mt-0.5">
          {artist.count} son{artist.count > 1 ? "s" : ""}
        </p>
      </div>
    </button>
  );
}

function UserRow({ user, query }: { user: UserEntry; query: string }) {
  const hue = hashStringToHue(user.id);
  const initials = getInitials(user.displayName, "");
  return (
    <Link
      href={`/users/${user.id}`}
      className="group flex items-center gap-3 rounded-2xl px-3 py-3 sm:py-2.5 hover:bg-white/5 transition"
    >
      <div
        className="h-10 w-10 shrink-0 rounded-full flex items-center justify-center text-sm font-semibold text-white"
        style={{
          background: `linear-gradient(135deg, hsla(${hue}, 65%, 55%, 0.85), hsla(${(hue + 50) % 360}, 70%, 48%, 0.8))`,
        }}
      >
        {initials || <User size={14} />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-white/90 truncate">
          <HighlightedText text={user.displayName} query={query} />
        </p>
        <p className="text-xs text-white/35">
          {user.trackCount} son{user.trackCount > 1 ? "s" : ""}
        </p>
      </div>
      <span className="text-white/20 group-hover:text-white/50 transition text-xs shrink-0">→</span>
    </Link>
  );
}

const TABS: { value: SearchTab; label: string }[] = [
  { value: "all", label: "Tout" },
  { value: "titres", label: "Titres" },
  { value: "artistes", label: "Artistes" },
  { value: "utilisateurs", label: "Utilisateurs" },
];

export default function SearchPage() {
  const { setQueueAndPlay, isFavorite } = usePlayer();

  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<SearchTab>("all");
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [artistFilter, setArtistFilter] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);
  const [tracks, setTracks] = useState<TrackWithCover[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadTracks() {
    try {
      setLoading(true);
      setError("");
      const res = await fetch("/api/tracks", { cache: "no-store" });
      if (!res.ok) throw new Error("Impossible de charger les sons");
      const json: TracksResponse = await res.json();
      const list = Array.isArray(json.tracks) ? json.tracks : [];
      setTracks(
        list.map((t) => ({
          title: t.title,
          artist: t.artist,
          src: t.src,
          cover: t.cover ?? undefined,
          ownerDisplayName: t.ownerDisplayName ?? undefined,
          ownerId: t.ownerId ?? undefined,
        }))
      );
    } catch (e) {
      setError(getErrorMessage(e, "Erreur lors du chargement"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadTracks(); }, []);
  useEffect(() => subscribeTracksUpdated(() => { void loadTracks(); }), []);

  const hasQuery = query.trim().length > 0;
  const needle = useMemo(() => normalizeText(query), [query]);

  const allArtistNames = useMemo(() => {
    const names = new Set<string>();
    for (const t of tracks) {
      const name = t.artist?.trim();
      if (name) names.add(name);
    }
    return [...names].sort((a, b) => a.localeCompare(b, "fr"));
  }, [tracks]);

  const baseTracks = useMemo(() => {
    let list = onlyFavorites ? tracks.filter((t) => isFavorite(t.src)) : tracks;
    if (artistFilter) list = list.filter((t) => t.artist?.trim() === artistFilter);
    return list;
  }, [tracks, onlyFavorites, isFavorite, artistFilter]);

  const filteredTracks = useMemo(() => {
    if (!hasQuery) return baseTracks;
    return baseTracks.filter((t) =>
      fuzzyMatch(`${normalizeText(t.title)} ${normalizeText(t.artist ?? "")}`, needle)
    );
  }, [baseTracks, hasQuery, needle]);

  const artists = useMemo(() => {
    const map = new Map<string, ArtistEntry>();
    for (const t of baseTracks) {
      const name = t.artist?.trim();
      if (!name) continue;
      const key = normalizeText(name);
      const ex = map.get(key);
      if (ex) { ex.count++; if (!ex.cover && t.cover) ex.cover = t.cover; }
      else map.set(key, { name, count: 1, cover: t.cover });
    }
    return [...map.values()].sort((a, b) => b.count - a.count);
  }, [baseTracks]);

  const filteredArtists = useMemo(
    () => hasQuery ? artists.filter((a) => fuzzyMatch(normalizeText(a.name), needle)) : artists,
    [artists, hasQuery, needle]
  );

  const users = useMemo(() => {
    const map = new Map<string, UserEntry>();
    for (const t of tracks) {
      if (!t.ownerId || !t.ownerDisplayName) continue;
      const ex = map.get(t.ownerId);
      if (ex) ex.trackCount++;
      else map.set(t.ownerId, { id: t.ownerId, displayName: t.ownerDisplayName, trackCount: 1 });
    }
    return [...map.values()].sort((a, b) => b.trackCount - a.trackCount);
  }, [tracks]);

  const filteredUsers = useMemo(
    () => hasQuery ? users.filter((u) => fuzzyMatch(normalizeText(u.displayName), needle)) : users,
    [users, hasQuery, needle]
  );

  useEffect(() => {
    setActiveIndex(filteredTracks.length > 0 ? 0 : -1);
  }, [filteredTracks.length]);

  function playArtist(name: string) {
    const q = baseTracks.filter((t) => t.artist?.trim() === name);
    if (q.length > 0) setQueueAndPlay(q, 0);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    const list = tab === "all" || tab === "titres" ? filteredTracks : [];
    if (e.key === "ArrowDown") { e.preventDefault(); setActiveIndex((p) => Math.min(list.length - 1, p + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActiveIndex((p) => Math.max(0, p - 1)); }
    else if (e.key === "Enter") {
      e.preventDefault();
      if (activeIndex >= 0 && activeIndex < list.length) setQueueAndPlay(list, activeIndex);
    }
  }

  function tabCount(t: SearchTab) {
    if (!hasQuery) return 0;
    if (t === "titres") return filteredTracks.length;
    if (t === "artistes") return filteredArtists.length;
    if (t === "utilisateurs") return filteredUsers.length;
    return 0;
  }

  function renderTracks(list: TrackWithCover[], limit?: number) {
    const items = limit ? list.slice(0, limit) : list;
    return (
      <div className="space-y-0.5">
        {items.map((t, i) => (
          <TrackRow
            key={t.src}
            track={t}
            idx={i}
            queue={list}
            active={i === activeIndex}
            query={query}
            isFav={isFavorite(t.src)}
            onPlay={setQueueAndPlay}
            onHover={setActiveIndex}
          />
        ))}
      </div>
    );
  }

  function renderContent() {
    if (loading) {
      return (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-14 rounded-2xl bg-white/5 animate-pulse" />
          ))}
        </div>
      );
    }

    if (tab === "titres") {
      const list = hasQuery ? filteredTracks : baseTracks;
      if (list.length === 0)
        return <EmptyState icon={<Music size={20} className="text-white/20" />} text={hasQuery ? `Aucun titre pour "${query}"` : "Aucun son disponible"} />;
      return (
        <div className="rounded-3xl border border-white/8 bg-white/[0.03] p-4">
          {renderTracks(list)}
        </div>
      );
    }

    if (tab === "artistes") {
      const list = filteredArtists;
      if (list.length === 0)
        return <EmptyState icon={<Music size={20} className="text-white/20" />} text={hasQuery ? `Aucun artiste pour "${query}"` : "Aucun artiste"} />;
      return (
        <div className="grid grid-cols-3 gap-2">
          {list.map((a) => (
            <ArtistCard key={a.name} artist={a} query={query} onPlay={playArtist} />
          ))}
        </div>
      );
    }

    if (tab === "utilisateurs") {
      const list = filteredUsers;
      if (list.length === 0)
        return <EmptyState icon={<User size={20} className="text-white/20" />} text={hasQuery ? `Aucun utilisateur pour "${query}"` : "Aucun utilisateur"} />;
      return (
        <div className="rounded-3xl border border-white/8 bg-white/[0.03] p-4">
          <div className="space-y-0.5">
            {list.map((u) => <UserRow key={u.id} user={u} query={query} />)}
          </div>
        </div>
      );
    }

    // tab === "all"
    const noResults =
      hasQuery &&
      filteredTracks.length === 0 &&
      filteredArtists.length === 0 &&
      filteredUsers.length === 0;

    if (noResults)
      return <EmptyState icon={<Search size={20} className="text-white/20" />} text={`Aucun résultat pour « ${query} »`} />;

    const artistsSlice = hasQuery ? filteredArtists.slice(0, 9) : artists.slice(0, 12);
    const tracksSlice = hasQuery ? filteredTracks : [];
    const usersSlice = hasQuery ? filteredUsers.slice(0, 4) : [];

    return (
      <>
        {tracksSlice.length > 0 && (
          <div className="mb-6">
            <SectionHeader
              title="Titres"
              count={filteredTracks.length}
              onMore={filteredTracks.length > 5 ? () => setTab("titres") : undefined}
            />
            <div className="rounded-3xl border border-white/8 bg-white/[0.03] p-3">
              {renderTracks(filteredTracks, 5)}
            </div>
          </div>
        )}

        {artistsSlice.length > 0 && (
          <div className="mb-6">
            <SectionHeader
              title="Artistes"
              count={hasQuery ? filteredArtists.length : undefined}
              onMore={
                (hasQuery && filteredArtists.length > 9) || (!hasQuery && artists.length > 12)
                  ? () => setTab("artistes")
                  : undefined
              }
            />
            <div className="grid grid-cols-3 gap-2">
              {artistsSlice.map((a) => (
                <ArtistCard key={a.name} artist={a} query={query} onPlay={playArtist} />
              ))}
            </div>
          </div>
        )}

        {usersSlice.length > 0 && (
          <div className="mb-6">
            <SectionHeader
              title="Utilisateurs"
              count={filteredUsers.length}
              onMore={filteredUsers.length > 4 ? () => setTab("utilisateurs") : undefined}
            />
            <div className="rounded-3xl border border-white/8 bg-white/[0.03] p-3">
              <div className="space-y-0.5">
                {usersSlice.map((u) => <UserRow key={u.id} user={u} query={query} />)}
              </div>
            </div>
          </div>
        )}

        {!hasQuery && artistsSlice.length === 0 && (
          <EmptyState icon={<Search size={20} className="text-white/20" />} text="Tape pour chercher" />
        )}
      </>
    );
  }

  return (
    <div className="pb-[calc(17.5rem+env(safe-area-inset-bottom))] sm:pb-28">
      {/* Header */}
      <div className="mb-6 flex items-end justify-between mp3-fade-up">
        <h2 className="text-3xl font-light">Recherche</h2>
        <span className="text-sm text-white/35">
          {loading ? "Chargement…" : error ? "Erreur" : `${tracks.length} son${tracks.length > 1 ? "s" : ""}`}
        </span>
      </div>

      {/* Search input */}
      <div className="mb-4 mp3-fade-up" style={{ animationDelay: "30ms" }}>
        <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 focus-within:border-white/20 transition">
          <Search size={15} className="text-white/30 shrink-0" />
          <input
            aria-label="Rechercher"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Titre, artiste, utilisateur…"
            className="w-full bg-transparent outline-none text-base sm:text-sm text-white/90 placeholder:text-white/30"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              type="button"
              aria-label="Effacer"
              className="text-white/30 hover:text-white/70 transition shrink-0"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Tabs + favorites toggle */}
      <div
        className="mb-6 flex items-center justify-between gap-3 flex-wrap mp3-fade-up"
        style={{ animationDelay: "60ms" }}
      >
        <div className="flex items-center gap-1.5">
          {TABS.map(({ value, label }) => {
            const count = tabCount(value);
            return (
              <button
                key={value}
                type="button"
                onClick={() => setTab(value)}
                className={[
                  "h-8 px-3.5 rounded-full text-sm transition flex items-center gap-1.5",
                  tab === value
                    ? "bg-white text-black font-medium"
                    : "bg-white/8 text-white/60 hover:bg-white/12 hover:text-white/85",
                ].join(" ")}
              >
                {label}
                {hasQuery && value !== "all" && count > 0 && (
                  <span
                    className={`text-[10px] tabular-nums ${tab === value ? "text-black/50" : "text-white/30"}`}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-1.5">
          <select
            value={artistFilter}
            onChange={(e) => setArtistFilter(e.target.value)}
            aria-label="Filtrer par artiste"
            className={[
              "h-8 px-3 rounded-full text-sm transition outline-none appearance-none cursor-pointer",
              artistFilter
                ? "bg-white text-black font-medium"
                : "bg-white/8 text-white/60 hover:bg-white/12",
            ].join(" ")}
          >
            <option value="">Tous les artistes</option>
            {allArtistNames.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setOnlyFavorites((v) => !v)}
            className={[
              "h-8 px-3.5 rounded-full text-sm transition",
              onlyFavorites
                ? "bg-white text-black font-medium"
                : "bg-white/8 text-white/60 hover:bg-white/12",
            ].join(" ")}
          >
            Favoris
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-2xl border border-red-400/20 bg-red-400/8 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {renderContent()}
    </div>
  );
}
