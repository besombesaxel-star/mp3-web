"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import AlbumCard from "../AlbumCard";
import { useAuth } from "../AuthProvider";
import { createAuthorizedHeaders } from "@/lib/clientAuth";
import { usePlayer } from "../PlayerContext";
import { dispatchTracksUpdated, subscribeTracksUpdated } from "../tracksSync";
import { COVER_SCROLL_TRANSFORM, useCoverScrollEffect } from "../useCoverScrollEffect";
import { useFocusTrap } from "../useFocusTrap";
import { getArtistHref, getPublicProfileHref } from "@/lib/publicLinks";

type ApiTrack = {
  title: string;
  artist: string;
  src: string;
  cover: string | null;
  isLegacyShared?: boolean;
  isOwnedByViewer?: boolean;
  ownerDisplayName?: string | null;
  ownerId?: string | null;
  ownerLabel?: string | null;
};

type TracksResponse = {
  tracks?: ApiTrack[];
};

type MetaSaveResponse = {
  ok?: boolean;
  error?: string;
};

type DeleteTrackResponse = {
  ok?: boolean;
  error?: string;
};

type SortKey = "added_desc" | "title_asc" | "title_desc" | "artist_asc" | "artist_desc";

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export default function LibraryPage() {
  const { accessToken, isAuthenticated } = useAuth();
  const { isFavorite, addToQueueEnd, toggleFavorite } = usePlayer();
  const [selectMode, setSelectMode] = useState(false);
  const [selectedSrcs, setSelectedSrcs] = useState<Set<string>>(new Set());
  const [tracks, setTracks] = useState<ApiTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [artistFilter, setArtistFilter] = useState("all");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [sortBy, setSortBy] = useState<SortKey>("added_desc");

  const [editing, setEditing] = useState<ApiTrack | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editArtist, setEditArtist] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const pageRef = useRef<HTMLDivElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  useCoverScrollEffect(pageRef);
  useFocusTrap(Boolean(editing), dialogRef);

  function toggleSelect(src: string) {
    setSelectedSrcs((prev) => {
      const next = new Set(prev);
      if (next.has(src)) next.delete(src);
      else next.add(src);
      return next;
    });
  }

  function exitSelectMode() {
    setSelectMode(false);
    setSelectedSrcs(new Set());
  }

  function selectedAsTracks() {
    return tracks.filter((t) => selectedSrcs.has(t.src));
  }

  function addSelectedToQueue() {
    for (const t of selectedAsTracks()) {
      addToQueueEnd({ title: t.title, artist: t.artist, src: t.src, cover: t.cover ?? undefined });
    }
    exitSelectMode();
  }

  function favoriteSelected() {
    for (const t of selectedAsTracks()) {
      if (!isFavorite(t.src)) {
        toggleFavorite({ title: t.title, artist: t.artist, src: t.src, cover: t.cover ?? undefined });
      }
    }
    exitSelectMode();
  }

  const loadTracks = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const res = await fetch("/api/tracks", {
        cache: "no-store",
        headers: createAuthorizedHeaders(accessToken),
      });
      if (!res.ok) throw new Error("Impossible de charger /api/tracks");

      const json: TracksResponse = await res.json();
      setTracks(Array.isArray(json.tracks) ? json.tracks : []);
    } catch (errorValue: unknown) {
      setError(getErrorMessage(errorValue, "Erreur lors du chargement"));
      setTracks([]);
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void loadTracks();
  }, [isAuthenticated, loadTracks]);

  useEffect(() => {
    return subscribeTracksUpdated(() => {
      void loadTracks();
    });
  }, [loadTracks]);

  useEffect(() => {
    if (!editing) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !saving) {
        setEditing(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [editing, saving]);

  function openEdit(track: ApiTrack) {
    setEditing(track);
    setEditTitle(track.title);
    setEditArtist(track.artist);
  }

  function closeEdit(force = false) {
    if (!force && (saving || deleting)) return;
    setEditing(null);
    setEditTitle("");
    setEditArtist("");
  }

  async function saveEdit() {
    if (!editing) return;
    if (!accessToken) {
      setError("Connecte-toi pour modifier les metadata.");
      return;
    }

    const title = editTitle.trim();
    const artist = editArtist.trim();

    if (!title) {
      setError("Le titre ne peut pas etre vide.");
      return;
    }

    try {
      setSaving(true);
      setError("");

      const res = await fetch("/api/meta", {
        method: "POST",
        headers: createAuthorizedHeaders(accessToken, { "Content-Type": "application/json" }),
        body: JSON.stringify({
          src: editing.src,
          title,
          artist,
        }),
      });

      let json: MetaSaveResponse = {};
      try {
        json = (await res.json()) as MetaSaveResponse;
      } catch {
        json = {};
      }

      if (!res.ok || !json.ok) {
        throw new Error(json.error ?? `Sauvegarde impossible (HTTP ${res.status})`);
      }

      closeEdit(true);
      dispatchTracksUpdated();
      await loadTracks();
    } catch (errorValue: unknown) {
      setError(getErrorMessage(errorValue, "Erreur lors de la sauvegarde"));
    } finally {
      setSaving(false);
    }
  }

  async function deleteEditingTrack() {
    if (!editing || !accessToken) {
      setError("Connecte-toi pour supprimer un son.");
      return;
    }

    const confirmed = window.confirm(`Supprimer définitivement "${editing.title}" ?`);
    if (!confirmed) return;

    try {
      setDeleting(true);
      setError("");

      const res = await fetch("/api/tracks", {
        method: "DELETE",
        headers: createAuthorizedHeaders(accessToken, { "Content-Type": "application/json" }),
        body: JSON.stringify({ src: editing.src }),
      });

      let json: DeleteTrackResponse = {};
      try {
        json = (await res.json()) as DeleteTrackResponse;
      } catch {
        json = {};
      }

      if (!res.ok || !json.ok) {
        throw new Error(json.error ?? `Suppression impossible (HTTP ${res.status})`);
      }

      closeEdit();
      dispatchTracksUpdated();
      await loadTracks();
    } catch (errorValue: unknown) {
      setError(getErrorMessage(errorValue, "Erreur lors de la suppression"));
    } finally {
      setDeleting(false);
    }
  }

  const artists = useMemo(() => {
    const set = new Set<string>();
    for (const track of tracks) {
      const artist = (track.artist ?? "").trim();
      if (artist) set.add(artist);
    }
    return [...set].sort((a, b) => a.localeCompare(b, "fr"));
  }, [tracks]);

  const visibleTracks = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    const filtered = tracks.filter((track) => {
      if (artistFilter !== "all" && track.artist !== artistFilter) return false;
      if (favoritesOnly && !isFavorite(track.src)) return false;
      if (!normalizedQuery) return true;

      const text = `${track.title} ${track.artist ?? ""}`.toLowerCase();
      return text.includes(normalizedQuery);
    });

    const sorted = [...filtered];
    sorted.sort((a, b) => {
      if (sortBy === "added_desc") return 0;
      if (sortBy === "title_asc") return a.title.localeCompare(b.title, "fr");
      if (sortBy === "title_desc") return b.title.localeCompare(a.title, "fr");
      if (sortBy === "artist_asc") return (a.artist ?? "").localeCompare(b.artist ?? "", "fr");
      return (b.artist ?? "").localeCompare(a.artist ?? "", "fr");
    });

    return sorted;
  }, [tracks, artistFilter, favoritesOnly, query, sortBy, isFavorite]);

  return (
    <div ref={pageRef} className="p-6 pb-[calc(17.5rem+env(safe-area-inset-bottom))] sm:pb-28">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-semibold text-white">Bibliotheque</h1>
          <p className="text-sm text-white/40 mt-1">
            {isAuthenticated
              ? "Survole une cover pour modifier le titre ou l'artiste."
              : "Connecte-toi pour modifier le titre ou l'artiste."}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => (selectMode ? exitSelectMode() : setSelectMode(true))}
            aria-pressed={selectMode}
            className={[
              "h-9 px-3 rounded-lg text-sm font-medium transition",
              selectMode ? "bg-white/15 text-white border border-white/30" : "bg-white/5 text-white/80 border border-white/10 hover:bg-white/10",
            ].join(" ")}
            type="button"
          >
            {selectMode ? "Annuler" : "Selectionner"}
          </button>

          <button
            onClick={loadTracks}
            className="h-9 px-3 rounded-lg bg-white text-black text-sm font-medium hover:opacity-90"
            type="button"
          >
            Recharger
          </button>
        </div>
      </div>

      <div className="mb-6 rounded-2xl border border-white/10 bg-white/5 p-3 sm:p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label htmlFor="library-query" className="mb-1 block text-xs text-white/45">
              Recherche
            </label>
            <input
              id="library-query"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Titre ou artiste..."
              className="w-full rounded-xl border border-white/10 bg-[#0E0E14] px-3 py-2 text-base sm:text-sm text-white/90 outline-none"
            />
          </div>

          <div>
            <label htmlFor="library-artist" className="mb-1 block text-xs text-white/45">
              Artiste
            </label>
            <select
              id="library-artist"
              value={artistFilter}
              onChange={(e) => setArtistFilter(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-[#0E0E14] px-3 py-2 text-base sm:text-sm text-white/90 outline-none"
            >
              <option value="all">Tous</option>
              {artists.map((artist) => (
                <option key={artist} value={artist}>
                  {artist}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="library-sort" className="mb-1 block text-xs text-white/45">
              Trier par
            </label>
            <select
              id="library-sort"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortKey)}
              className="w-full rounded-xl border border-white/10 bg-[#0E0E14] px-3 py-2 text-base sm:text-sm text-white/90 outline-none"
            >
              <option value="added_desc">Recents</option>
              <option value="title_asc">Titre A-Z</option>
              <option value="title_desc">Titre Z-A</option>
              <option value="artist_asc">Artiste A-Z</option>
              <option value="artist_desc">Artiste Z-A</option>
            </select>
          </div>

          <div className="flex items-end">
            <button
              type="button"
              onClick={() => setFavoritesOnly((value) => !value)}
              aria-pressed={favoritesOnly}
              className={[
                "h-10 w-full rounded-xl border text-sm transition",
                favoritesOnly
                  ? "border-white/30 bg-white/15 text-white"
                  : "border-white/10 bg-white/5 text-white/80 hover:bg-white/10",
              ].join(" ")}
            >
              {favoritesOnly ? "Favoris uniquement: ON" : "Favoris uniquement: OFF"}
            </button>
          </div>
        </div>
      </div>

      {loading ? <p className="text-white/60">Chargement...</p> : null}
      {!isAuthenticated ? (
        <p className="mb-4 text-sm text-white/50">
          Edition protegee: connecte-toi dans <Link href="/account" className="text-white/85 underline underline-offset-4">Compte</Link>.
        </p>
      ) : null}
      {!loading && error ? (
        <p className="text-red-400 mb-4" role="alert">
          {error}
        </p>
      ) : null}

      {!loading && !error && tracks.length === 0 ? (
        <p className="text-white/60">Aucun son pour le moment.</p>
      ) : null}
      {!loading && !error && tracks.length > 0 && visibleTracks.length === 0 ? (
        <p className="text-white/55 mb-4">Aucun resultat avec ces filtres.</p>
      ) : null}

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
        {visibleTracks.map((track, i) => (
          <AlbumCard
            key={track.src}
            title={track.title}
            subtitle={track.ownerLabel ? `${track.artist} - ${track.ownerLabel}` : `${track.artist} - MP3`}
            track={{
              title: track.title,
              artist: track.artist,
              src: track.src,
              cover: track.cover ?? undefined,
              ownerDisplayName: track.ownerDisplayName ?? undefined,
              ownerId: track.ownerId ?? undefined,
            }}
            onEdit={isAuthenticated && track.isOwnedByViewer ? () => openEdit(track) : undefined}
            hoverEffect="shrink"
            coverTransform={COVER_SCROLL_TRANSFORM}
            animationDelay={`${Math.min(i, 9) * 40}ms`}
            selectMode={selectMode}
            selected={selectedSrcs.has(track.src)}
            onToggleSelect={() => toggleSelect(track.src)}
          />
        ))}
      </div>

      {selectMode && selectedSrcs.size > 0 ? (
        <div className="fixed bottom-[calc(17.5rem+env(safe-area-inset-bottom))] sm:bottom-8 left-1/2 -translate-x-1/2 z-50 px-4 w-full max-w-lg">
          <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/95 backdrop-blur-xl shadow-[0_18px_60px_rgba(0,0,0,0.55)] px-4 py-3">
            <p className="text-sm text-white/85 shrink-0">{selectedSrcs.size} selectionne{selectedSrcs.size > 1 ? "s" : ""}</p>
            <div className="flex-1 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={favoriteSelected}
                className="h-9 px-3 rounded-full bg-white/10 text-white text-xs font-medium hover:bg-white/15 transition"
              >
                Favoris
              </button>
              <button
                type="button"
                onClick={addSelectedToQueue}
                className="h-9 px-3 rounded-full bg-white text-black text-xs font-medium hover:opacity-90 transition"
              >
                Ajouter a la file
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {editing ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div
            ref={dialogRef}
            className="w-full max-w-lg rounded-3xl bg-[#15151C] border border-white/10 p-5"
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-track-title"
            aria-describedby="edit-track-src"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-xs text-white/45">Modifier</p>
                <p id="edit-track-title" className="text-lg text-white/90 truncate">
                  {editing.title}
                </p>
                <p id="edit-track-src" className="text-xs text-white/35 truncate">
                  {editing.src}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-white/55">
                  <Link href={getArtistHref(editing.artist)} className="underline underline-offset-4 hover:text-white/85">
                    Artiste: {editing.artist}
                  </Link>
                  {editing.ownerId ? (
                    <Link
                      href={getPublicProfileHref(editing.ownerId)}
                      className="underline underline-offset-4 hover:text-white/85"
                    >
                      Profil: {editing.ownerLabel ?? "Membre mp3"}
                    </Link>
                  ) : (
                    <span>
                      {editing.isLegacyShared
                        ? "Ce son est un ancien partage sans proprietaire assigne."
                        : editing.ownerLabel
                          ? `Proprietaire: ${editing.ownerLabel}`
                          : "Proprietaire non disponible"}
                    </span>
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={() => closeEdit()}
                className="h-9 w-9 rounded-full bg-white/5 hover:bg-white/10 text-white/80"
                title="Fermer"
                aria-label="Fermer la fenetre d'edition"
              >
                X
              </button>
            </div>

            <div className="mt-5 space-y-3">
              <div>
                <label htmlFor="edit-title" className="block text-xs text-white/45 mb-2">
                  Titre
                </label>
                <input
                  id="edit-title"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full rounded-2xl bg-[#111118] border border-white/10 px-3 py-2 text-base sm:text-sm text-white/90 outline-none"
                  placeholder="Titre..."
                />
              </div>

              <div>
                <label htmlFor="edit-artist" className="block text-xs text-white/45 mb-2">
                  Artiste
                </label>
                <input
                  id="edit-artist"
                  value={editArtist}
                  onChange={(e) => setEditArtist(e.target.value)}
                  className="w-full rounded-2xl bg-[#111118] border border-white/10 px-3 py-2 text-base sm:text-sm text-white/90 outline-none"
                  placeholder="Artiste..."
                />
              </div>
            </div>

            <div className="mt-6 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={deleteEditingTrack}
                className="h-10 px-4 rounded-2xl bg-red-500/15 text-red-100 hover:bg-red-500/20 transition disabled:opacity-60"
                disabled={saving || deleting || !editing.isOwnedByViewer}
              >
                {deleting ? "Suppression..." : "Supprimer"}
              </button>

              <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => closeEdit()}
                className="h-10 px-4 rounded-2xl bg-white/10 text-white/85 hover:bg-white/15 transition"
                disabled={saving || deleting}
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={saveEdit}
                className="h-10 px-4 rounded-2xl bg-white text-black font-semibold hover:opacity-90 transition disabled:opacity-60"
                disabled={saving || deleting || !editing.isOwnedByViewer}
              >
                {saving ? "Sauvegarde..." : "Sauvegarder"}
              </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
