"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Play, Plus, Trash2, Users, X } from "lucide-react";
import { useAuth } from "./AuthProvider";
import { createAuthorizedHeaders } from "@/lib/clientAuth";
import { useFocusTrap } from "./useFocusTrap";
import { getPublicProfileHref } from "@/lib/publicLinks";
import type { Track } from "./PlayerContext";
import Portal from "./Portal";

export type SharedPlaylist = {
  id: string;
  name: string;
  trackSrcs: string[];
  ownerId: string;
  collaboratorIds: string[];
  createdAt: number;
  updatedAt: number;
};

type TrackWithCover = Track & { cover?: string };

type Props = {
  playlist: SharedPlaylist;
  library: TrackWithCover[];
  onClose: () => void;
  onUpdated: (playlist: SharedPlaylist) => void;
  onDeleted: (id: string) => void;
  onPlay: (tracks: Track[], startIndex: number) => void;
};

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export default function SharedPlaylistModal({ playlist, library, onClose, onUpdated, onDeleted, onPlay }: Props) {
  const { accessToken, user } = useAuth();
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(true, dialogRef);

  const [names, setNames] = useState<Record<string, string>>({});
  const [renameValue, setRenameValue] = useState(playlist.name);
  const [addSearch, setAddSearch] = useState("");
  const [inviteId, setInviteId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"tracks" | "members">("tracks");

  const isOwner = user?.id === playlist.ownerId;
  const isMember = isOwner || (user?.id ? playlist.collaboratorIds.includes(user.id) : false);

  useEffect(() => {
    setRenameValue(playlist.name);
  }, [playlist.name]);

  useEffect(() => {
    const ids = [...new Set([playlist.ownerId, ...playlist.collaboratorIds])].filter((id) => !(id in names));
    if (ids.length === 0) return;
    ids.forEach((id) => {
      fetch(`/api/public/users/${encodeURIComponent(id)}`, { cache: "no-store" })
        .then((r) => r.json())
        .then((json: { ok?: boolean; profile?: { displayName?: string } }) => {
          setNames((prev) => ({ ...prev, [id]: json.profile?.displayName ?? id }));
        })
        .catch(() => setNames((prev) => ({ ...prev, [id]: id })));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playlist.ownerId, playlist.collaboratorIds]);

  const libraryBySrc = new Map(library.map((t) => [t.src, t]));
  const tracks = playlist.trackSrcs.map((src) => libraryBySrc.get(src)).filter((t): t is TrackWithCover => Boolean(t));
  const filteredLibrary = addSearch.trim()
    ? library.filter((t) => `${t.title} ${t.artist ?? ""}`.toLowerCase().includes(addSearch.trim().toLowerCase()))
    : library;

  async function patchPlaylist(patch: { name?: string; trackSrcs?: string[] }) {
    if (!accessToken) return;
    setError("");
    try {
      const res = await fetch(`/api/playlists/shared/${playlist.id}`, {
        method: "PATCH",
        headers: createAuthorizedHeaders(accessToken, { "Content-Type": "application/json" }),
        body: JSON.stringify(patch),
      });
      const json = (await res.json()) as { ok?: boolean; playlist?: SharedPlaylist; error?: string };
      if (!res.ok || !json.ok || !json.playlist) throw new Error(json.error ?? `Erreur ${res.status}`);
      onUpdated(json.playlist);
    } catch (err) {
      setError(getErrorMessage(err, "Mise a jour impossible."));
    }
  }

  function toggleTrack(src: string) {
    const has = playlist.trackSrcs.includes(src);
    const next = has ? playlist.trackSrcs.filter((s) => s !== src) : [...playlist.trackSrcs, src];
    void patchPlaylist({ trackSrcs: next });
  }

  function saveRename() {
    const name = renameValue.trim();
    if (!name || name === playlist.name) return;
    void patchPlaylist({ name });
  }

  async function invite() {
    const targetId = inviteId.trim();
    if (!targetId || !accessToken || busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/playlists/shared/${playlist.id}/collaborators`, {
        method: "POST",
        headers: createAuthorizedHeaders(accessToken, { "Content-Type": "application/json" }),
        body: JSON.stringify({ userId: targetId }),
      });
      const json = (await res.json()) as { ok?: boolean; playlist?: SharedPlaylist; error?: string };
      if (!res.ok || !json.ok || !json.playlist) throw new Error(json.error ?? `Erreur ${res.status}`);
      onUpdated(json.playlist);
      setInviteId("");
    } catch (err) {
      setError(getErrorMessage(err, "Invitation impossible."));
    } finally {
      setBusy(false);
    }
  }

  async function removeMember(targetId: string) {
    if (!accessToken) return;
    setError("");
    try {
      const res = await fetch(`/api/playlists/shared/${playlist.id}/collaborators`, {
        method: "DELETE",
        headers: createAuthorizedHeaders(accessToken, { "Content-Type": "application/json" }),
        body: JSON.stringify({ userId: targetId }),
      });
      const json = (await res.json()) as { ok?: boolean; playlist?: SharedPlaylist; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error ?? `Erreur ${res.status}`);
      if (targetId === user?.id) {
        onClose();
        return;
      }
      if (json.playlist) onUpdated(json.playlist);
    } catch (err) {
      setError(getErrorMessage(err, "Action impossible."));
    }
  }

  async function deletePlaylist() {
    if (!accessToken || busy) return;
    const confirmed = window.confirm(`Supprimer definitivement "${playlist.name}" ?`);
    if (!confirmed) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/playlists/shared/${playlist.id}`, {
        method: "DELETE",
        headers: createAuthorizedHeaders(accessToken),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error ?? `Erreur ${res.status}`);
      onDeleted(playlist.id);
      onClose();
    } catch (err) {
      setError(getErrorMessage(err, "Suppression impossible."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Portal>
    <div className="fixed inset-0 z-[130] flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4 mp3-backdrop-in">
      <div
        ref={dialogRef}
        className="w-full sm:max-w-lg max-h-[85vh] flex flex-col rounded-t-3xl sm:rounded-3xl bg-[#15151C] border border-white/10 p-5 mp3-scale-in"
        role="dialog"
        aria-modal="true"
        aria-label={`Playlist partagee ${playlist.name}`}
      >
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-white/45 flex items-center gap-1.5">
              <Users size={11} />
              Playlist partagee - {tracks.length} morceau{tracks.length > 1 ? "x" : ""}
            </p>
            <p className="text-lg text-white/90 truncate">{playlist.name}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-9 w-9 shrink-0 rounded-full bg-white/5 hover:bg-white/10 text-white/80 flex items-center justify-center"
            aria-label="Fermer"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex items-center gap-1 rounded-2xl bg-white/5 p-1 mb-4">
          {(["tracks", "members"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={["flex-1 h-8 rounded-xl text-xs font-medium transition", tab === t ? "bg-white text-black" : "text-white/60 hover:text-white"].join(" ")}
            >
              {t === "tracks" ? "Morceaux" : `Contributeurs (${playlist.collaboratorIds.length + 1})`}
            </button>
          ))}
        </div>

        {error && <p className="text-xs text-red-400/90 mb-3">{error}</p>}

        <div className="flex-1 overflow-y-auto">
          {tab === "tracks" ? (
            <>
              <div className="flex items-center gap-2 mb-4">
                <button
                  type="button"
                  onClick={() => onPlay(tracks, 0)}
                  disabled={tracks.length === 0}
                  className="h-9 px-4 rounded-full bg-white text-black text-xs font-medium hover:opacity-90 transition disabled:opacity-50 flex items-center gap-1.5"
                >
                  <Play size={12} className="fill-current" />
                  Lecture
                </button>
                <input
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onBlur={saveRename}
                  disabled={!isMember}
                  placeholder="Nom de la playlist"
                  className="flex-1 h-9 rounded-full bg-white/5 border border-white/10 px-3 text-xs text-white/85 outline-none disabled:opacity-50"
                />
              </div>

              {tracks.length === 0 ? (
                <p className="text-xs text-white/30 text-center py-4">Aucun morceau. Ajoute-en depuis la liste ci-dessous.</p>
              ) : (
                <div className="space-y-0.5 mb-4">
                  {tracks.map((track) => (
                    <div key={track.src} className="group flex items-center gap-3 rounded-2xl px-2 py-2 hover:bg-white/5 transition">
                      <div className="relative h-9 w-9 shrink-0 rounded-xl overflow-hidden bg-white/5">
                        {track.cover ? <Image src={track.cover} alt="" fill className="object-cover" sizes="36px" /> : null}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-white/85 truncate">{track.title}</p>
                        <p className="text-xs text-white/40 truncate">{track.artist ?? "-"}</p>
                      </div>
                      {isMember && (
                        <button
                          type="button"
                          onClick={() => toggleTrack(track.src)}
                          className="shrink-0 h-7 w-7 rounded-lg flex items-center justify-center text-white/25 hover:text-red-400 transition"
                          aria-label={`Retirer ${track.title}`}
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {isMember && (
                <div className="border-t border-white/6 pt-4">
                  <input
                    value={addSearch}
                    onChange={(e) => setAddSearch(e.target.value)}
                    placeholder="Rechercher un titre a ajouter..."
                    className="w-full h-9 rounded-full bg-white/5 border border-white/10 px-3 text-xs text-white/85 outline-none mb-2"
                  />
                  <div className="space-y-0.5 max-h-[180px] overflow-y-auto">
                    {filteredLibrary.slice(0, 40).map((track) => {
                      const inPlaylist = playlist.trackSrcs.includes(track.src);
                      return (
                        <button
                          key={track.src}
                          type="button"
                          onClick={() => toggleTrack(track.src)}
                          className={[
                            "w-full flex items-center gap-3 rounded-xl px-2 py-1.5 text-left transition",
                            inPlaylist ? "bg-white/8" : "hover:bg-white/5",
                          ].join(" ")}
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-xs text-white/80 truncate">{track.title}</p>
                          </div>
                          <span className="text-xs text-white/35 shrink-0">{inPlaylist ? "-" : "+"}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="space-y-1.5 mb-4">
                {[playlist.ownerId, ...playlist.collaboratorIds].map((id) => (
                  <div key={id} className="flex items-center justify-between gap-2 rounded-2xl border border-white/8 bg-white/3 px-3 py-2">
                    <Link href={getPublicProfileHref(id)} className="text-sm text-white/85 hover:underline truncate">
                      {names[id] ?? id}
                      {id === playlist.ownerId && <span className="ml-2 text-[10px] uppercase tracking-wide text-amber-300/80">Proprietaire</span>}
                    </Link>
                    {(isOwner && id !== playlist.ownerId) || id === user?.id ? (
                      <button
                        type="button"
                        onClick={() => void removeMember(id)}
                        className="shrink-0 text-xs text-white/40 hover:text-red-400 transition"
                      >
                        {id === user?.id ? "Quitter" : "Retirer"}
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>

              {isOwner && (
                <div className="flex items-center gap-2 mb-4">
                  <input
                    value={inviteId}
                    onChange={(e) => setInviteId(e.target.value)}
                    placeholder="ID utilisateur a inviter"
                    className="flex-1 h-9 rounded-full bg-white/5 border border-white/10 px-3 text-xs text-white/85 outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => void invite()}
                    disabled={!inviteId.trim() || busy}
                    className="h-9 px-3 rounded-full bg-white text-black text-xs font-medium hover:opacity-90 transition disabled:opacity-40 flex items-center gap-1"
                  >
                    <Plus size={12} />
                    Inviter
                  </button>
                </div>
              )}

              {isOwner && (
                <button
                  type="button"
                  onClick={() => void deletePlaylist()}
                  disabled={busy}
                  className="w-full h-9 rounded-2xl bg-red-500/10 text-red-300 text-xs hover:bg-red-500/15 transition disabled:opacity-50"
                >
                  Supprimer la playlist
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
    </Portal>
  );
}
