"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, Trash2, X } from "lucide-react";
import { useAuth } from "./AuthProvider";
import { createAuthorizedHeaders } from "@/lib/clientAuth";
import { useFocusTrap } from "./useFocusTrap";
import type { Track } from "./PlayerContext";

type Props = {
  track: Track | null;
  open: boolean;
  onClose: () => void;
  onSaved?: (text: string | null) => void;
};

export default function TrackLyricsEditorModal({ track, open, onClose, onSaved }: Props) {
  const { accessToken } = useAuth();
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(open, dialogRef);

  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const [hadCustom, setHadCustom] = useState(false);

  useEffect(() => {
    if (!open || !track) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    fetch(`/api/tracks/lyrics?src=${encodeURIComponent(track.src)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((json: { ok?: boolean; lyrics?: { text?: string } | null }) => {
        if (cancelled) return;
        const existing = json.lyrics?.text ?? "";
        setText(existing);
        setHadCustom(Boolean(existing));
      })
      .catch(() => {
        if (!cancelled) setError("Impossible de charger les paroles.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, track]);

  if (!open || !track) return null;

  async function save() {
    if (!track || !accessToken || saving) return;
    const trimmed = text.trim();
    if (!trimmed) return;

    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/tracks/lyrics", {
        method: "PUT",
        headers: createAuthorizedHeaders(accessToken, { "Content-Type": "application/json" }),
        body: JSON.stringify({ src: track.src, text: trimmed }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        throw new Error(json.error ?? `Enregistrement impossible (HTTP ${res.status})`);
      }
      setHadCustom(true);
      onSaved?.(trimmed);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Enregistrement impossible.");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!track || !accessToken || deleting) return;

    setDeleting(true);
    setError("");
    try {
      const res = await fetch("/api/tracks/lyrics", {
        method: "DELETE",
        headers: createAuthorizedHeaders(accessToken, { "Content-Type": "application/json" }),
        body: JSON.stringify({ src: track.src }),
      });
      if (!res.ok) throw new Error();
      setText("");
      setHadCustom(false);
      onSaved?.(null);
      onClose();
    } catch {
      setError("Suppression impossible.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[130] flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4 mp3-backdrop-in">
      <div
        ref={dialogRef}
        className="w-full sm:max-w-lg max-h-[85vh] flex flex-col rounded-t-3xl sm:rounded-3xl bg-[#15151C] border border-white/10 p-5 mp3-scale-in"
        role="dialog"
        aria-modal="true"
        aria-label={`Paroles de ${track.title}`}
      >
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="min-w-0 flex items-center gap-2">
            <Mic size={16} className="text-white/40 shrink-0" />
            <div className="min-w-0">
              <p className="text-sm text-white/90 truncate">{track.title}</p>
              <p className="text-xs text-white/40 truncate">{track.artist ?? ""}</p>
            </div>
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

        {loading ? (
          <p className="text-xs text-white/30 text-center py-10">Chargement...</p>
        ) : (
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={8000}
            rows={12}
            placeholder="Colle ou ecris les paroles de ce son..."
            className="flex-1 min-h-[220px] resize-none rounded-2xl bg-white/5 border border-white/10 px-3.5 py-3 text-sm text-white/90 outline-none focus:border-white/25 placeholder:text-white/25"
          />
        )}

        {error && <p className="text-xs text-red-400/90 mt-3">{error}</p>}

        <div className="mt-4 pt-3 border-t border-white/6 flex items-center gap-2">
          {hadCustom && (
            <button
              type="button"
              onClick={() => void remove()}
              disabled={deleting || saving}
              className="h-10 px-4 shrink-0 rounded-full bg-white/5 hover:bg-red-500/15 text-red-300/90 text-sm flex items-center gap-1.5 disabled:opacity-40 transition"
            >
              <Trash2 size={14} />
              Supprimer
            </button>
          )}
          <button
            type="button"
            onClick={() => void save()}
            disabled={!text.trim() || saving || loading}
            className="flex-1 h-10 rounded-full bg-white text-black text-sm font-medium disabled:opacity-40 transition"
          >
            {saving ? "Enregistrement..." : "Enregistrer"}
          </button>
        </div>
      </div>
    </div>
  );
}
