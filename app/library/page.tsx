"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import AlbumCard from "../AlbumCard";
import { useAuth } from "../AuthProvider";
import { createAuthorizedHeaders } from "@/lib/clientAuth";
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

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export default function LibraryPage() {
  const { accessToken, isAuthenticated } = useAuth();
  const [tracks, setTracks] = useState<ApiTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [editing, setEditing] = useState<ApiTrack | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editArtist, setEditArtist] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const pageRef = useRef<HTMLDivElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  useCoverScrollEffect(pageRef);
  useFocusTrap(Boolean(editing), dialogRef);

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

  return (
    <div ref={pageRef} className="px-3 pt-6 sm:px-6 pb-[calc(17.5rem+env(safe-area-inset-bottom))] sm:pb-28">
      <div className="mb-4">
        <h1 className="text-2xl font-semibold text-white">Bibliotheque</h1>
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

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-6">
        {tracks.map((track, i) => (
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
          />
        ))}
      </div>

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
