"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { Track, usePlayer } from "../PlayerContext";
import { subscribeTracksUpdated } from "../tracksSync";

type TrackWithCover = Track & { cover?: string };

type ApiTrack = {
  title: string;
  artist: string;
  src: string;
  cover: string | null;
  ownerDisplayName?: string | null;
  ownerId?: string | null;
};

type TracksResponse = {
  tracks?: ApiTrack[];
};

type PlaylistLite = {
  id: string;
  name: string;
  trackSrcs: string[];
};

type SearchField = "all" | "title" | "artist";
type ArtistSuggestion = {
  name: string;
  count: number;
};

const PLAYLISTS_LS_KEY = "mp3_playlists_v1";

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .toLowerCase()
    .trim();
}

function levenshtein(a: string, b: string) {
  const dp = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));

  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }

  return dp[a.length][b.length];
}

function fuzzyMatch(haystack: string, needle: string): boolean {
  if (!needle) return true;
  const terms = needle.split(" ").filter(Boolean);
  if (terms.length > 1) {
    return terms.every((term) => fuzzyMatch(haystack, term));
  }
  if (haystack.includes(needle)) return true;

  const words = haystack.split(/\s+/).filter(Boolean);
  for (const word of words) {
    if (word.includes(needle)) return true;
    if (needle.length >= 4 && Math.abs(word.length - needle.length) <= 1) {
      if (levenshtein(word, needle) <= 1) return true;
    }
  }

  let i = 0;
  let j = 0;
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
      {parts.map((part, index) =>
        part.toLowerCase() === clean.toLowerCase() ? (
          <mark key={`${part}-${index}`} className="bg-white/20 text-white rounded px-[2px]">
            {part}
          </mark>
        ) : (
          <span key={`${part}-${index}`}>{part}</span>
        )
      )}
    </>
  );
}

export default function SearchPage() {
  const { setQueueAndPlay, isFavorite } = usePlayer();
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);
  const [searchField, setSearchField] = useState<SearchField>("all");
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [playlistFilter, setPlaylistFilter] = useState<string>("all");

  const [tracks, setTracks] = useState<TrackWithCover[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [playlists, setPlaylists] = useState<PlaylistLite[]>([]);

  async function loadTracks() {
    try {
      setLoading(true);
      setError("");

      const res = await fetch("/api/tracks", { cache: "no-store" });
      if (!res.ok) throw new Error("Impossible de charger /api/tracks");

      const json: TracksResponse = await res.json();
      const list = Array.isArray(json.tracks) ? json.tracks : [];

      setTracks(
        list.map((track) => ({
          title: track.title,
          artist: track.artist,
          src: track.src,
          cover: track.cover ?? undefined,
          ownerDisplayName: track.ownerDisplayName ?? undefined,
          ownerId: track.ownerId ?? undefined,
        }))
      );
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
    return subscribeTracksUpdated(() => {
      void loadTracks();
    });
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(PLAYLISTS_LS_KEY);
      if (!raw) {
        setPlaylists([]);
        return;
      }

      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) {
        setPlaylists([]);
        return;
      }

      const valid = parsed.filter((item): item is PlaylistLite => {
        if (!item || typeof item !== "object") return false;
        const obj = item as Record<string, unknown>;
        return (
          typeof obj.id === "string" &&
          typeof obj.name === "string" &&
          Array.isArray(obj.trackSrcs) &&
          obj.trackSrcs.every((src) => typeof src === "string")
        );
      });

      setPlaylists(valid);
    } catch {
      setPlaylists([]);
    }
  }, []);

  const hasQuery = query.trim().length > 0;
  const hasFilters = searchField !== "all" || onlyFavorites || playlistFilter !== "all";
  const shouldSearch = hasQuery || hasFilters;

  const playlistTrackSet = useMemo(() => {
    if (playlistFilter === "all") return null;
    const selected = playlists.find((playlist) => playlist.id === playlistFilter);
    if (!selected) return null;
    return new Set(selected.trackSrcs);
  }, [playlists, playlistFilter]);

  const baseFilteredTracks = useMemo(
    () =>
      tracks.filter((track) => {
        if (onlyFavorites && !isFavorite(track.src)) return false;
        if (playlistTrackSet && !playlistTrackSet.has(track.src)) return false;
        return true;
      }),
    [tracks, onlyFavorites, isFavorite, playlistTrackSet]
  );

  const artistSuggestions = useMemo<ArtistSuggestion[]>(() => {
    if (searchField !== "artist") return [];
    const byArtist = new Map<string, ArtistSuggestion>();

    for (const track of baseFilteredTracks) {
      const name = (track.artist ?? "").trim();
      if (!name) continue;

      const normalizedArtist = normalizeText(name);

      const existing = byArtist.get(normalizedArtist);
      if (existing) {
        existing.count += 1;
      } else {
        byArtist.set(normalizedArtist, { name, count: 1 });
      }
    }

    return [...byArtist.values()]
      .sort((a, b) => {
        if (b.count !== a.count) return b.count - a.count;
        return a.name.localeCompare(b.name, "fr");
      })
      .slice(0, 24);
  }, [searchField, baseFilteredTracks]);

  const filtered = useMemo(() => {
    if (!shouldSearch) return [];
    const needle = normalizeText(query);
    if (searchField === "artist" && !hasQuery) return [];

    return baseFilteredTracks.filter((track) => {
      if (!hasQuery) return true;

      const title = normalizeText(track.title);
      const artist = normalizeText(track.artist ?? "");

      if (searchField === "title") return fuzzyMatch(title, needle);
      if (searchField === "artist") return fuzzyMatch(artist, needle);
      return fuzzyMatch(`${title} ${artist}`, needle);
    });
  }, [shouldSearch, query, baseFilteredTracks, hasQuery, searchField]);

  useEffect(() => {
    setActiveIndex(filtered.length > 0 ? 0 : -1);
  }, [filtered.length]);

  const resultLabel = useMemo(() => {
    if (loading) return "Chargement...";
    if (error) return "Erreur";
    if (!shouldSearch) return "Tape pour chercher";
    if (searchField === "artist" && !hasQuery) return `${artistSuggestions.length} artiste(s)`;
    return `${filtered.length} resultat(s)`;
  }, [loading, error, shouldSearch, filtered.length, searchField, hasQuery, artistSuggestions.length]);

  function playResult(index: number) {
    if (index < 0 || index >= filtered.length) return;
    setQueueAndPlay(filtered, index);
  }

  function onSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((prev) => Math.min(filtered.length - 1, prev + 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((prev) => Math.max(0, prev - 1));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      playResult(activeIndex >= 0 ? activeIndex : 0);
    }
  }

  function applyArtistSuggestion(artistName: string) {
    setQuery(artistName);
    setActiveIndex(0);
  }

  return (
    <div className="pb-28">
      <div className="flex items-end justify-between mb-6">
        <h2 className="text-3xl font-light">Recherche</h2>
        <span className="text-sm text-white/35" aria-live="polite">
          {resultLabel}
        </span>
      </div>

      <div className="mb-6 space-y-3">
        <div className="flex items-center gap-3 rounded-2xl border border-white/5 bg-[#15151C] px-4 py-3">
          <span className="text-white/35" aria-hidden="true">
            /
          </span>
          <input
            aria-label="Rechercher un titre ou un artiste"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onSearchKeyDown}
            placeholder="Rechercher un titre ou un artiste..."
            className="w-full bg-transparent outline-none text-sm text-white/90 placeholder:text-white/35"
          />
          {query ? (
            <button
              onClick={() => setQuery("")}
              className="text-xs text-white/45 hover:text-white/80 transition"
              title="Effacer"
              type="button"
            >
              X
            </button>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {[
            { value: "all" as const, label: "Tout" },
            { value: "title" as const, label: "Titre" },
            { value: "artist" as const, label: "Artiste" },
          ].map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setSearchField(option.value)}
              aria-pressed={searchField === option.value}
              className={[
                "h-9 px-3 rounded-full text-sm transition",
                searchField === option.value
                  ? "bg-white text-black"
                  : "bg-white/10 text-white/80 hover:bg-white/15",
              ].join(" ")}
            >
              {option.label}
            </button>
          ))}

          <button
            type="button"
            onClick={() => setOnlyFavorites((value) => !value)}
            aria-pressed={onlyFavorites}
            className={[
              "h-9 px-3 rounded-full text-sm transition",
              onlyFavorites ? "bg-white text-black" : "bg-white/10 text-white/80 hover:bg-white/15",
            ].join(" ")}
          >
            Favoris
          </button>

          <select
            value={playlistFilter}
            onChange={(e) => setPlaylistFilter(e.target.value)}
            className="h-9 rounded-full bg-white/10 border border-white/10 px-3 text-sm text-white/85 outline-none"
            aria-label="Filtrer par playlist"
          >
            <option value="all">Toutes playlists</option>
            {playlists.map((playlist) => (
              <option key={playlist.id} value={playlist.id}>
                {playlist.name}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => {
              setSearchField("all");
              setOnlyFavorites(false);
              setPlaylistFilter("all");
            }}
            className="h-9 px-3 rounded-full bg-white/5 text-white/60 hover:bg-white/10 hover:text-white/85 transition text-sm"
          >
            Reset filtres
          </button>
        </div>

        {searchField === "artist" ? (
          <div className="flex flex-wrap items-center gap-2">
            {artistSuggestions.length === 0 ? (
              <span className="text-xs text-white/45">Aucun artiste avec ces filtres.</span>
            ) : (
              artistSuggestions.map((artistItem) => (
                <button
                  key={artistItem.name}
                  type="button"
                  onClick={() => applyArtistSuggestion(artistItem.name)}
                  className={[
                    "h-8 px-3 rounded-full text-xs transition",
                    searchField === "artist" && hasQuery && normalizeText(query) === normalizeText(artistItem.name)
                      ? "bg-white text-black"
                      : "bg-white/8 text-white/80 hover:bg-white/15",
                  ].join(" ")}
                  title={`Rechercher ${artistItem.name}`}
                >
                  {artistItem.name} ({artistItem.count})
                </button>
              ))
            )}
          </div>
        ) : null}

        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            onClick={loadTracks}
            className="h-9 px-3 rounded-lg bg-white/10 text-white text-sm font-medium hover:bg-white/15 transition"
          >
            Recharger la bibliotheque
          </button>

          {error ? <span className="text-sm text-red-400">{error}</span> : null}
        </div>
      </div>

      <div className="rounded-3xl bg-[#15151C] border border-white/5 p-4">
        {!shouldSearch ? (
          <div className="px-3 py-10 text-sm text-white/45">
            Commence a taper pour afficher des resultats, ou active un filtre.
          </div>
        ) : searchField === "artist" && !hasQuery ? (
          <div className="px-3 py-10 text-sm text-white/45">
            Choisis un artiste ci-dessus pour voir ses morceaux.
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-3 py-10 text-sm text-white/45">
            Aucun resultat pour <span className="text-white/80">&quot;{query || "filtres actuels"}&quot;</span>.
          </div>
        ) : (
          <div className="flex flex-col" role="listbox" aria-label="Resultats de recherche">
            {filtered.map((track, index) => {
              const active = index === activeIndex;
              const fav = isFavorite(track.src);

              return (
                <button
                  key={track.src}
                  id={`search-result-${index}`}
                  role="option"
                  aria-selected={active}
                  onClick={() => playResult(index)}
                  onMouseEnter={() => setActiveIndex(index)}
                  className={[
                    "group flex items-center justify-between gap-4 rounded-2xl px-3 py-3 transition text-left mp3-fade-up",
                    active ? "bg-white/10" : "hover:bg-white/5",
                  ].join(" ")}
                  style={{ animationDelay: `${Math.min(index, 12) * 30}ms` }}
                  title="Lire"
                  type="button"
                >
                  <div className="min-w-0 flex items-center gap-4">
                    <div className="relative h-12 w-12 overflow-hidden rounded-xl border border-white/5 bg-[#1A1A22]">
                      {track.cover ? (
                        <Image src={track.cover} alt={track.title} fill className="object-cover" sizes="48px" />
                      ) : null}
                    </div>

                    <div className="min-w-0">
                      <p className="text-sm text-white/90 truncate">
                        <HighlightedText text={track.title} query={query} />
                      </p>
                      <p className="text-xs text-white/45 truncate">
                        <HighlightedText text={track.artist ?? "-"} query={query} />
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {fav ? (
                      <span className="text-[10px] rounded-full border border-white/20 bg-white/10 px-2 py-1 text-white/80">
                        Favori
                      </span>
                    ) : null}
                    <span className="text-xs text-white/35 group-hover:text-white/70 transition">Play</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
