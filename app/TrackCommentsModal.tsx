"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { MessageCircle, Send, Trash2, X } from "lucide-react";
import { useAuth } from "./AuthProvider";
import { createAuthorizedHeaders } from "@/lib/clientAuth";
import { usePlayer } from "./PlayerContext";
import { useFocusTrap } from "./useFocusTrap";
import { getPublicProfileHref } from "@/lib/publicLinks";
import type { Track } from "./PlayerContext";

const REACTION_EMOJIS = ["🔥", "❤️", "😍", "🎧", "👏"];

type TrackComment = {
  id: string;
  userId: string;
  displayName: string;
  avatarUrl: string;
  text: string;
  createdAt: number;
};

type Props = {
  track: Track | null;
  open: boolean;
  onClose: () => void;
};

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function TrackCommentsModal({ track, open, onClose }: Props) {
  const { accessToken, isAuthenticated, user } = useAuth();
  const { markCommentPosted } = usePlayer();
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(open, dialogRef);

  const [comments, setComments] = useState<TrackComment[]>([]);
  const [reactions, setReactions] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || !track) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    fetch(`/api/tracks/comments?src=${encodeURIComponent(track.src)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((json: { ok?: boolean; comments?: TrackComment[]; reactions?: Record<string, string[]> }) => {
        if (cancelled) return;
        setComments(Array.isArray(json.comments) ? json.comments : []);
        setReactions(json.reactions && typeof json.reactions === "object" ? json.reactions : {});
      })
      .catch(() => {
        if (!cancelled) setError("Impossible de charger les commentaires.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, track]);

  useEffect(() => {
    if (!open) {
      setText("");
      setError("");
    }
  }, [open]);

  if (!open || !track) return null;

  async function submitComment() {
    if (!track || !accessToken || sending) return;
    const trimmed = text.trim();
    if (!trimmed) return;

    setSending(true);
    setError("");
    try {
      const res = await fetch("/api/tracks/comments", {
        method: "POST",
        headers: createAuthorizedHeaders(accessToken, { "Content-Type": "application/json" }),
        body: JSON.stringify({ src: track.src, text: trimmed }),
      });
      const json = (await res.json()) as { ok?: boolean; comment?: TrackComment; error?: string };
      if (!res.ok || !json.ok || !json.comment) {
        throw new Error(json.error ?? `Envoi impossible (HTTP ${res.status})`);
      }
      setComments((prev) => [...prev, json.comment as TrackComment]);
      setText("");
      markCommentPosted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Envoi impossible.");
    } finally {
      setSending(false);
    }
  }

  async function deleteComment(commentId: string) {
    if (!track || !accessToken) return;
    const previous = comments;
    setComments((prev) => prev.filter((c) => c.id !== commentId));
    try {
      const res = await fetch("/api/tracks/comments", {
        method: "DELETE",
        headers: createAuthorizedHeaders(accessToken, { "Content-Type": "application/json" }),
        body: JSON.stringify({ src: track.src, commentId }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setComments(previous);
    }
  }

  async function toggleReaction(emoji: string) {
    if (!track || !accessToken || !user?.id) return;

    setReactions((prev) => {
      const current = prev[emoji] ?? [];
      const has = current.includes(user.id);
      return { ...prev, [emoji]: has ? current.filter((id) => id !== user.id) : [...current, user.id] };
    });

    try {
      const res = await fetch("/api/tracks/reactions", {
        method: "POST",
        headers: createAuthorizedHeaders(accessToken, { "Content-Type": "application/json" }),
        body: JSON.stringify({ src: track.src, emoji }),
      });
      const json = (await res.json()) as { ok?: boolean; reactions?: Record<string, string[]> };
      if (res.ok && json.ok && json.reactions) setReactions(json.reactions);
    } catch {}
  }

  return (
    <div className="fixed inset-0 z-[130] flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4 mp3-backdrop-in">
      <div
        ref={dialogRef}
        className="w-full sm:max-w-lg max-h-[85vh] flex flex-col rounded-t-3xl sm:rounded-3xl bg-[#15151C] border border-white/10 p-5 mp3-scale-in"
        role="dialog"
        aria-modal="true"
        aria-label={`Commentaires sur ${track.title}`}
      >
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="min-w-0 flex items-center gap-2">
            <MessageCircle size={16} className="text-white/40 shrink-0" />
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

        <div className="flex items-center gap-1.5 mb-4">
          {REACTION_EMOJIS.map((emoji) => {
            const count = reactions[emoji]?.length ?? 0;
            const active = Boolean(user?.id && reactions[emoji]?.includes(user.id));
            return (
              <button
                key={emoji}
                type="button"
                onClick={() => void toggleReaction(emoji)}
                disabled={!isAuthenticated}
                className={[
                  "h-8 px-2.5 rounded-full text-sm flex items-center gap-1 transition disabled:opacity-40",
                  active ? "bg-white/15 border border-white/25" : "bg-white/5 border border-white/10 hover:bg-white/10",
                ].join(" ")}
              >
                <span>{emoji}</span>
                {count > 0 && <span className="text-[11px] text-white/50 tabular-nums">{count}</span>}
              </button>
            );
          })}
        </div>

        <div className="flex-1 overflow-y-auto space-y-3 min-h-[80px]">
          {loading ? (
            <p className="text-xs text-white/30 text-center py-6">Chargement...</p>
          ) : comments.length === 0 ? (
            <p className="text-xs text-white/30 text-center py-6">Aucun commentaire pour l&apos;instant.</p>
          ) : (
            comments.map((comment) => (
              <div key={comment.id} className="flex items-start gap-2.5">
                <Link href={getPublicProfileHref(comment.userId)} className="shrink-0 mt-0.5">
                  <div className="h-7 w-7 rounded-full overflow-hidden bg-white/10 flex items-center justify-center text-[10px] font-semibold text-white/60">
                    {comment.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={comment.avatarUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      comment.displayName.slice(0, 2).toUpperCase()
                    )}
                  </div>
                </Link>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Link href={getPublicProfileHref(comment.userId)} className="text-xs font-medium text-white/80 hover:underline truncate">
                      {comment.displayName}
                    </Link>
                    <span className="text-[10px] text-white/25 shrink-0">{formatDate(comment.createdAt)}</span>
                  </div>
                  <p className="text-sm text-white/85 break-words">{comment.text}</p>
                </div>
                {user?.id === comment.userId && (
                  <button
                    type="button"
                    onClick={() => void deleteComment(comment.id)}
                    className="shrink-0 h-6 w-6 rounded-lg flex items-center justify-center text-white/20 hover:text-red-400 transition"
                    aria-label="Supprimer"
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
            ))
          )}
        </div>

        {error && <p className="text-xs text-red-400/90 mt-3">{error}</p>}

        <div className="mt-4 pt-3 border-t border-white/6">
          {isAuthenticated ? (
            <div className="flex items-center gap-2">
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void submitComment();
                  }
                }}
                maxLength={300}
                placeholder="Ecrire un commentaire..."
                className="flex-1 rounded-2xl bg-white/5 border border-white/10 px-3.5 py-2.5 text-sm text-white/90 outline-none focus:border-white/25 placeholder:text-white/25"
              />
              <button
                type="button"
                onClick={() => void submitComment()}
                disabled={!text.trim() || sending}
                className="h-10 w-10 shrink-0 rounded-full bg-white text-black flex items-center justify-center disabled:opacity-40 transition"
                aria-label="Envoyer"
              >
                <Send size={15} />
              </button>
            </div>
          ) : (
            <p className="text-xs text-white/35 text-center">
              <Link href="/account" className="underline underline-offset-4 hover:text-white/60">Connecte-toi</Link> pour commenter.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
