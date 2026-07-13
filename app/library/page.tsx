"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Image as ImageIcon, LayoutGrid, List as ListIcon, Pencil } from "lucide-react";
import AlbumCard from "../AlbumCard";
import { useAuth } from "../AuthProvider";
import { createAuthorizedHeaders } from "@/lib/clientAuth";
import { getErrorMessage } from "@/lib/errorMessage";
import { Track, usePlayer } from "../PlayerContext";
import { fetchTracksShared, type ApiTrack } from "../tracksCache";
import { dispatchTracksUpdated, subscribeTracksUpdated } from "../tracksSync";
import { COVER_SCROLL_TRANSFORM, useCoverScrollEffect } from "../useCoverScrollEffect";
import { useFocusTrap } from "../useFocusTrap";
import { useLongPress } from "../useLongPress";
import { getArtistHref, getPublicProfileHref } from "@/lib/publicLinks";
import TrackContextMenu from "../TrackContextMenu";

type MetaSaveResponse = {
  ok?: boolean;
  error?: string;
};

type DeleteTrackResponse = {
  ok?: boolean;
  error?: string;
};

function normalizeTitle(value: string) {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

function toTrack(track: ApiTrack): Track & { cover?: string } {
  return {
    title: track.title,
    artist: track.artist,
    src: track.src,
    cover: track.cover ?? undefined,
    ownerDisplayName: track.ownerDisplayName ?? undefined,
    ownerId: track.ownerId ?? undefined,
    credits: track.credits ?? undefined,
  };
}

const LIBRARY_VIEW_KEY = "mp3_library_view";

function LibraryListRow({
  track, index, canEdit, onEdit, onOpenMenu, selectMode = false, selected = false, onToggleSelect,
}: {
  track: ApiTrack;
  index: number;
  canEdit: boolean;
  onEdit: () => void;
  onOpenMenu: (t: Track) => void;
  selectMode?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
}) {
  const { playTrack } = usePlayer();
  const longPress = useLongPress({ onLongPress: () => onOpenMenu(toTrack(track)) });

  return (
    <div
      className="group flex items-center gap-3 rounded-2xl px-2 py-2 transition hover:bg-white/5 mp3-fade-up"
      style={{ animationDelay: `${Math.min(index, 15) * 30}ms` }}
      onTouchStart={longPress.onTouchStart}
      onTouchMove={longPress.onTouchMove}
      onTouchEnd={longPress.onTouchEnd}
      onTouchCancel={longPress.onTouchCancel}
      onContextMenu={longPress.onContextMenu}
    >
      <button
        type="button"
        onClick={() => {
          if (longPress.didLongPress()) return;
          if (selectMode) {
            onToggleSelect?.();
            return;
          }
          playTrack(toTrack(track));
        }}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
        title="Lire"
      >
        {selectMode ? (
          <span
            className={[
              "h-5 w-5 rounded-full border flex items-center justify-center shrink-0 transition",
              selected ? "bg-white border-white text-black" : "border-white/25 text-transparent",
            ].join(" ")}
          >
            <svg viewBox="0 0 24 24" width={11} height={11} fill="none" stroke="currentColor" strokeWidth={3}>
              <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        ) : null}

        <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-xl bg-white/5">
          {track.cover ? (
            <Image src={track.cover} alt={track.title} fill className="object-cover" sizes="44px" />
          ) : null}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm text-white/90 truncate">{track.title}</p>
          <p className="text-xs text-white/45 truncate">
            {track.ownerLabel ? `${track.artist} - ${track.ownerLabel}` : `${track.artist} - MP3`}
          </p>
        </div>
      </button>

      {!selectMode && canEdit ? (
        <button
          type="button"
          onClick={onEdit}
          className="shrink-0 h-9 w-9 rounded-full flex items-center justify-center text-white/60 opacity-0 group-hover:opacity-100 hover:bg-white/10 hover:text-white transition"
          title="Modifier"
          aria-label={`Modifier ${track.title}`}
        >
          <Pencil size={14} />
        </button>
      ) : null}
    </div>
  );
}

export default function LibraryPage() {
  const { accessToken, isAuthenticated } = useAuth();
  const [tracks, setTracks] = useState<ApiTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [editing, setEditing] = useState<ApiTrack | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editArtist, setEditArtist] = useState("");
  const [editCredits, setEditCredits] = useState("");
  const [editCoverFile, setEditCoverFile] = useState<File | null>(null);
  const [editCoverPreview, setEditCoverPreview] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [view, setView] = useState<"grid" | "list">("grid");
  const [sort, setSort] = useState<"default" | "title" | "artist">("default");
  const [menuTrack, setMenuTrack] = useState<Track | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedSrcs, setSelectedSrcs] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [duplicatesOpen, setDuplicatesOpen] = useState(false);
  const [keepChoice, setKeepChoice] = useState<Record<string, string>>({});
  const [cleaningDuplicates, setCleaningDuplicates] = useState(false);

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

  async function deleteSelected() {
    if (!accessToken || bulkDeleting) return;

    const toDelete = tracks.filter((t) => selectedSrcs.has(t.src) && t.isOwnedByViewer);
    if (toDelete.length === 0) return;

    const confirmed = window.confirm(
      `Supprimer definitivement ${toDelete.length} son${toDelete.length > 1 ? "s" : ""} ?`
    );
    if (!confirmed) return;

    setBulkDeleting(true);
    setError("");
    try {
      await Promise.all(
        toDelete.map((t) =>
          fetch("/api/tracks", {
            method: "DELETE",
            headers: createAuthorizedHeaders(accessToken, { "Content-Type": "application/json" }),
            body: JSON.stringify({ src: t.src }),
          })
        )
      );
      exitSelectMode();
      dispatchTracksUpdated();
      await loadTracks();
    } catch (errorValue: unknown) {
      setError(getErrorMessage(errorValue, "Erreur lors de la suppression"));
    } finally {
      setBulkDeleting(false);
    }
  }

  const duplicateGroups = useMemo(() => {
    const groups = new Map<string, ApiTrack[]>();
    for (const t of tracks) {
      if (!t.isOwnedByViewer) continue;
      const key = normalizeTitle(t.title);
      if (!key) continue;
      const list = groups.get(key) ?? [];
      list.push(t);
      groups.set(key, list);
    }
    return [...groups.entries()].filter(([, list]) => list.length > 1);
  }, [tracks]);

  function openDuplicates() {
    const defaults: Record<string, string> = {};
    for (const [key, list] of duplicateGroups) {
      defaults[key] = list[0].src;
    }
    setKeepChoice(defaults);
    setDuplicatesOpen(true);
  }

  async function cleanupDuplicates() {
    if (!accessToken || cleaningDuplicates) return;

    const toDelete = duplicateGroups.flatMap(([key, list]) => {
      const keepSrc = keepChoice[key] ?? list[0].src;
      return list.filter((t) => t.src !== keepSrc);
    });
    if (toDelete.length === 0) return;

    const confirmed = window.confirm(
      `Supprimer ${toDelete.length} doublon${toDelete.length > 1 ? "s" : ""} ? Les morceaux conserves ne seront pas touches.`
    );
    if (!confirmed) return;

    setCleaningDuplicates(true);
    setError("");
    try {
      await Promise.all(
        toDelete.map((t) =>
          fetch("/api/tracks", {
            method: "DELETE",
            headers: createAuthorizedHeaders(accessToken, { "Content-Type": "application/json" }),
            body: JSON.stringify({ src: t.src }),
          })
        )
      );
      setDuplicatesOpen(false);
      dispatchTracksUpdated();
      await loadTracks();
    } catch (errorValue: unknown) {
      setError(getErrorMessage(errorValue, "Erreur lors de la suppression"));
    } finally {
      setCleaningDuplicates(false);
    }
  }

  useEffect(() => {
    try {
      const stored = localStorage.getItem(LIBRARY_VIEW_KEY);
      if (stored === "grid" || stored === "list") setView(stored);
    } catch {}
  }, []);

  function changeView(next: "grid" | "list") {
    setView(next);
    try {
      localStorage.setItem(LIBRARY_VIEW_KEY, next);
    } catch {}
  }

  const pageRef = useRef<HTMLDivElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  useCoverScrollEffect(pageRef);
  useFocusTrap(Boolean(editing), dialogRef);

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

  useEffect(() => {
    if (!editCoverFile) {
      setEditCoverPreview("");
      return;
    }

    const objectUrl = URL.createObjectURL(editCoverFile);
    setEditCoverPreview(objectUrl);
    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [editCoverFile]);

  function openEdit(track: ApiTrack) {
    setEditing(track);
    setEditTitle(track.title);
    setEditArtist(track.artist);
    setEditCredits(track.credits ?? "");
    setEditCoverFile(null);
    setEditCoverPreview("");
  }

  function closeEdit(force = false) {
    if (!force && (saving || deleting)) return;
    setEditing(null);
    setEditTitle("");
    setEditArtist("");
    setEditCredits("");
    setEditCoverFile(null);
    setEditCoverPreview("");
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
          credits: editCredits.trim(),
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

      if (editCoverFile) {
        const coverForm = new FormData();
        coverForm.append("src", editing.src);
        coverForm.append("cover", editCoverFile);

        const coverRes = await fetch("/api/tracks/cover", {
          method: "POST",
          headers: createAuthorizedHeaders(accessToken),
          body: coverForm,
        });

        let coverJson: MetaSaveResponse = {};
        try {
          coverJson = (await coverRes.json()) as MetaSaveResponse;
        } catch {
          coverJson = {};
        }

        if (!coverRes.ok || !coverJson.ok) {
          throw new Error(coverJson.error ?? `Sauvegarde de la cover impossible (HTTP ${coverRes.status})`);
        }
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

  const sortedTracks = useMemo(() => {
    if (sort === "title") return [...tracks].sort((a, b) => a.title.localeCompare(b.title, "fr"));
    if (sort === "artist") return [...tracks].sort((a, b) => a.artist.localeCompare(b.artist, "fr"));
    return tracks;
  }, [tracks, sort]);

  return (
    <div ref={pageRef} className="px-2 pt-6 sm:px-6 pb-[calc(11rem+env(safe-area-inset-bottom))] sm:pb-28">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-white">Bibliotheque</h1>
        <div className="flex items-center gap-3">
          {tracks.length > 0 ? (
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as "default" | "title" | "artist")}
              aria-label="Trier par"
              className="h-8 px-3 rounded-lg text-xs bg-white/5 text-white/70 border border-white/10 hover:bg-white/10 transition outline-none cursor-pointer"
            >
              <option value="default">Recents</option>
              <option value="title">Titre</option>
              <option value="artist">Artiste</option>
            </select>
          ) : null}
          {isAuthenticated && duplicateGroups.length > 0 ? (
            <button
              type="button"
              onClick={openDuplicates}
              className="h-8 px-3 rounded-lg text-xs font-medium bg-amber-300/10 text-amber-100 border border-amber-300/25 hover:bg-amber-300/15 transition"
            >
              Doublons ({duplicateGroups.length})
            </button>
          ) : null}
          {isAuthenticated && tracks.length > 0 ? (
            <button
              type="button"
              onClick={() => (selectMode ? exitSelectMode() : setSelectMode(true))}
              aria-pressed={selectMode}
              className={[
                "h-8 px-3 rounded-lg text-xs font-medium transition",
                selectMode
                  ? "bg-white/15 text-white border border-white/30"
                  : "bg-white/5 text-white/70 border border-white/10 hover:bg-white/10",
              ].join(" ")}
            >
              {selectMode ? "Annuler" : "Selectionner"}
            </button>
          ) : null}
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

      {view === "grid" ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2 sm:gap-6">
          {sortedTracks.map((track, i) => (
            <AlbumCard
              key={track.src}
              title={track.title}
              subtitle={track.ownerLabel ? `${track.artist} - ${track.ownerLabel}` : `${track.artist} - MP3`}
              track={toTrack(track)}
              onEdit={!selectMode && isAuthenticated && track.isOwnedByViewer ? () => openEdit(track) : undefined}
              hoverEffect="shrink"
              coverTransform={COVER_SCROLL_TRANSFORM}
              animationDelay={`${Math.min(i, 9) * 40}ms`}
              selectMode={selectMode}
              selected={selectedSrcs.has(track.src)}
              onToggleSelect={() => toggleSelect(track.src)}
            />
          ))}
        </div>
      ) : (
        <div className="space-y-1">
          {sortedTracks.map((track, i) => (
            <LibraryListRow
              key={track.src}
              track={track}
              index={i}
              canEdit={Boolean(isAuthenticated && track.isOwnedByViewer)}
              onEdit={() => openEdit(track)}
              onOpenMenu={setMenuTrack}
              selectMode={selectMode}
              selected={selectedSrcs.has(track.src)}
              onToggleSelect={() => toggleSelect(track.src)}
            />
          ))}
        </div>
      )}

      {editing ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 mp3-backdrop-in">
          <div
            ref={dialogRef}
            className="w-full max-w-lg rounded-3xl bg-[#15151C] border border-white/10 p-5 mp3-scale-in"
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
                <span className="block text-xs text-white/45 mb-2">Cover</span>
                <div className="flex items-center gap-3">
                  <div className="h-16 w-16 shrink-0 rounded-xl overflow-hidden border border-white/10 bg-[#111118]">
                    {editCoverPreview || editing.cover ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={editCoverPreview || editing.cover || ""}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center text-white/25">
                        <ImageIcon size={18} />
                      </div>
                    )}
                  </div>
                  <label
                    htmlFor="edit-cover"
                    className={[
                      "h-9 px-3 rounded-full border border-white/10 bg-white/5 text-xs text-white/70 transition flex items-center gap-1.5",
                      editing.isOwnedByViewer ? "cursor-pointer hover:bg-white/10 hover:text-white/90" : "opacity-50 cursor-not-allowed",
                    ].join(" ")}
                  >
                    <ImageIcon size={12} />
                    Changer la cover
                  </label>
                  <input
                    id="edit-cover"
                    type="file"
                    accept="image/*,.jpg,.jpeg,.png,.webp"
                    onChange={(e) => setEditCoverFile(e.target.files?.[0] ?? null)}
                    disabled={!editing.isOwnedByViewer || saving || deleting}
                    className="sr-only"
                  />
                </div>
              </div>

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

              <div>
                <label htmlFor="edit-credits" className="block text-xs text-white/45 mb-2">
                  Credits (optionnel)
                </label>
                <input
                  id="edit-credits"
                  value={editCredits}
                  onChange={(e) => setEditCredits(e.target.value)}
                  maxLength={300}
                  className="w-full rounded-2xl bg-[#111118] border border-white/10 px-3 py-2 text-base sm:text-sm text-white/90 outline-none"
                  placeholder="Compositeur, featuring..."
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

      {duplicatesOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 mp3-backdrop-in">
          <div className="w-full max-w-lg max-h-[80vh] overflow-y-auto rounded-3xl border border-white/10 bg-[#111118] p-5 mp3-scale-in">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-lg font-semibold text-white/90">Nettoyer les doublons</h2>
              <button
                type="button"
                onClick={() => setDuplicatesOpen(false)}
                className="h-9 w-9 rounded-full bg-white/5 hover:bg-white/10 text-white/80"
                aria-label="Fermer"
              >
                X
              </button>
            </div>
            <p className="text-xs text-white/40 mb-4">
              Choisis quel exemplaire garder pour chaque titre en double. Les autres seront supprimes.
            </p>

            <div className="space-y-5">
              {duplicateGroups.map(([key, list]) => (
                <div key={key} className="rounded-2xl border border-white/8 bg-white/[0.03] p-3">
                  <p className="text-sm text-white/85 mb-2 truncate">{list[0].title}</p>
                  <div className="space-y-1.5">
                    {list.map((t) => (
                      <label
                        key={t.src}
                        className="flex items-center gap-2.5 rounded-xl px-2 py-1.5 hover:bg-white/5 cursor-pointer"
                      >
                        <input
                          type="radio"
                          name={`keep-${key}`}
                          checked={(keepChoice[key] ?? list[0].src) === t.src}
                          onChange={() => setKeepChoice((prev) => ({ ...prev, [key]: t.src }))}
                          className="accent-white"
                        />
                        <span className="text-xs text-white/60 truncate flex-1">{t.artist || "-"}</span>
                        <span className="text-[10px] text-white/25 shrink-0">{t.src.split("/").pop()}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setDuplicatesOpen(false)}
                className="h-10 px-4 rounded-2xl bg-white/10 text-white/85 hover:bg-white/15 transition"
                disabled={cleaningDuplicates}
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={() => void cleanupDuplicates()}
                className="h-10 px-4 rounded-2xl bg-white text-black font-semibold hover:opacity-90 transition disabled:opacity-60"
                disabled={cleaningDuplicates}
              >
                {cleaningDuplicates ? "Suppression..." : "Supprimer les doublons"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {selectMode && selectedSrcs.size > 0 ? (
        <div className="fixed bottom-[calc(11rem+env(safe-area-inset-bottom))] sm:bottom-8 left-1/2 -translate-x-1/2 z-50 px-4 w-full max-w-lg">
          <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/95 backdrop-blur-xl shadow-[0_18px_60px_rgba(0,0,0,0.55)] px-4 py-3">
            <p className="text-sm text-white/85 shrink-0">
              {selectedSrcs.size} selectionne{selectedSrcs.size > 1 ? "s" : ""}
            </p>
            <div className="flex-1 flex items-center justify-end">
              <button
                type="button"
                onClick={deleteSelected}
                disabled={bulkDeleting}
                className="h-9 px-3 rounded-full bg-red-500/20 text-red-100 text-xs font-medium hover:bg-red-500/30 transition disabled:opacity-60"
              >
                {bulkDeleting ? "Suppression..." : "Supprimer la selection"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <TrackContextMenu track={menuTrack} onClose={() => setMenuTrack(null)} />
    </div>
  );
}
