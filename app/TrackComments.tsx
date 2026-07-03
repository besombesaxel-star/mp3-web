"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { MessageCircle, Send, Trash2, X } from "lucide-react";
import { useAuth } from "./AuthProvider";
import { createAuthorizedHeaders } from "@/lib/clientAuth";
import { getPublicProfileHref } from "@/lib/publicLinks";
import { isAdminUser } from "@/lib/adminAccess";

type TrackComment = {
  id: string;
  userId: string;
  displayName: string;
  avatarUrl: string;
  content: string;
  createdAt: string;
};

function formatTime(iso: string) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60_000) return "maintenant";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min`;
  if (d.toDateString() === now.toDateString())
    return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0].toUpperCase())
      .join("") || "?"
  );
}

const HUE_PALETTE = [34, 198, 142, 262, 28, 185, 335, 152];
function nameHue(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff;
  return HUE_PALETTE[h % HUE_PALETTE.length];
}

export default function TrackComments({
  trackSrc,
  open,
  onClose,
}: {
  trackSrc: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const { accessToken, isAuthenticated, user } = useAuth();
  const myId = user?.id ?? "";

  const [comments, setComments] = useState<TrackComment[]>([]);
  const [loading, setLoading] = useState(false);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || !trackSrc) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const res = await fetch(`/api/comments?src=${encodeURIComponent(trackSrc as string)}`, { cache: "no-store" });
        const json = (await res.json()) as { ok?: boolean; comments?: TrackComment[] };
        if (!cancelled && json.ok && Array.isArray(json.comments)) {
          setComments(json.comments);
        }
      } catch {
        /* silent */
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [open, trackSrc]);

  useEffect(() => {
    if (!open) return;
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "instant" }), 50);
  }, [open, comments.length]);

  async function sendComment() {
    const content = input.trim();
    if (!content || sending || !accessToken || !trackSrc) return;
    setSending(true);
    setError("");
    try {
      const res = await fetch("/api/comments", {
        method: "POST",
        headers: createAuthorizedHeaders(accessToken, { "Content-Type": "application/json" }),
        body: JSON.stringify({ src: trackSrc, content }),
      });
      const json = (await res.json()) as { ok?: boolean; comment?: TrackComment; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Erreur d'envoi");

      if (json.comment) {
        setComments((prev) => [...prev, json.comment as TrackComment]);
        setInput("");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setSending(false);
    }
  }

  async function deleteComment(id: string) {
    if (!accessToken || !trackSrc) return;
    try {
      const res = await fetch("/api/comments", {
        method: "DELETE",
        headers: createAuthorizedHeaders(accessToken, { "Content-Type": "application/json" }),
        body: JSON.stringify({ src: trackSrc, id }),
      });
      if (!res.ok) return;
      setComments((prev) => prev.filter((c) => c.id !== id));
    } catch {
      /* silent */
    }
  }

  const canModerate = isAdminUser(myId);

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-[54] bg-black/50 md:hidden" onClick={onClose} aria-hidden="true" />
      )}

      <div
        className={[
          "fixed z-[56] flex flex-col",
          "inset-x-0 bottom-0 top-[calc(3rem+env(safe-area-inset-top))] rounded-t-3xl",
          "md:inset-x-auto md:right-0 md:top-0 md:bottom-0 md:w-[360px] md:rounded-none md:rounded-l-3xl",
          "border-t border-white/10 md:border-t-0 md:border-l",
          "bg-[#080809]/95 backdrop-blur-xl transition-transform duration-300 ease-in-out",
          open ? "translate-y-0 md:translate-x-0" : "translate-y-full md:translate-y-0 md:translate-x-full",
        ].join(" ")}
        aria-hidden={!open}
      >
        <div className="flex items-center gap-3 border-b border-white/8 px-5 pt-3 pb-4 shrink-0">
          <div className="mx-auto h-1.5 w-10 rounded-full bg-white/15 md:hidden absolute left-1/2 -translate-x-1/2 top-2" aria-hidden="true" />
          <h2 className="flex-1 text-sm font-medium text-white/85 mt-2 md:mt-0">Commentaires</h2>
          <button
            type="button"
            onClick={onClose}
            className="h-8 w-8 rounded-full text-white/40 hover:text-white hover:bg-white/8 transition flex items-center justify-center"
          >
            <X size={15} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {loading ? (
            <div className="space-y-3 pt-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="flex gap-2.5 animate-pulse">
                  <div className="h-7 w-7 shrink-0 rounded-full bg-white/8" />
                  <div className="space-y-1.5 flex-1">
                    <div className="h-2.5 w-20 rounded-full bg-white/8" />
                    <div className="h-9 rounded-2xl bg-white/6 w-3/4" />
                  </div>
                </div>
              ))}
            </div>
          ) : comments.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-center py-16">
              <MessageCircle size={32} className="text-white/12" />
              <p className="text-sm text-white/35">Aucun commentaire pour l&apos;instant.</p>
              <p className="text-xs text-white/20">Sois le premier à donner ton avis !</p>
            </div>
          ) : (
            comments.map((comment) => {
              const hue = nameHue(comment.displayName);
              const canDelete = comment.userId === myId || canModerate;
              const profileHref = getPublicProfileHref(comment.userId);
              return (
                <div key={comment.id} className="group/comment flex gap-2.5">
                  <Link
                    href={profileHref}
                    title={`Voir le profil de ${comment.displayName}`}
                    className="h-7 w-7 shrink-0 rounded-full overflow-hidden mt-0.5 self-start ring-1 ring-transparent hover:ring-white/30 transition"
                    style={
                      !comment.avatarUrl
                        ? { background: `linear-gradient(135deg, hsla(${hue},70%,55%,1), hsla(${(hue + 50) % 360},75%,48%,1))` }
                        : undefined
                    }
                  >
                    {comment.avatarUrl ? (
                      <Image src={comment.avatarUrl} alt={comment.displayName} width={28} height={28} className="h-full w-full object-cover" />
                    ) : (
                      <span className="h-full w-full flex items-center justify-center text-[10px] font-semibold text-white">
                        {initials(comment.displayName)}
                      </span>
                    )}
                  </Link>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <Link
                        href={profileHref}
                        className="text-xs font-medium text-white/70 hover:text-white/90 transition truncate"
                      >
                        {comment.displayName}
                      </Link>
                      <span className="text-[10px] text-white/25 shrink-0">{formatTime(comment.createdAt)}</span>
                      {canDelete && (
                        <button
                          type="button"
                          onClick={() => void deleteComment(comment.id)}
                          title="Supprimer"
                          aria-label="Supprimer le commentaire"
                          className="ml-auto opacity-0 group-hover/comment:opacity-100 transition shrink-0 h-6 w-6 rounded-full flex items-center justify-center text-white/25 hover:text-red-400 hover:bg-white/8"
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                    <p className="text-sm text-white/80 leading-relaxed break-words mt-0.5">{comment.content}</p>
                  </div>
                </div>
              );
            })
          )}
          <div ref={bottomRef} className="h-1" />
        </div>

        <div className="border-t border-white/8 px-4 py-3 shrink-0 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          {!isAuthenticated ? (
            <div className="rounded-2xl border border-white/8 bg-white/4 px-4 py-3 text-center">
              <p className="text-xs text-white/45">
                <Link href="/account" className="underline underline-offset-2 hover:text-white/70 transition">
                  Connecte-toi
                </Link>{" "}
                pour commenter.
              </p>
            </div>
          ) : (
            <div className="flex items-end gap-2">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void sendComment();
                  }
                }}
                placeholder="Ajouter un commentaire…"
                rows={1}
                maxLength={500}
                disabled={sending}
                className="flex-1 resize-none overflow-hidden rounded-2xl border border-white/10 bg-white/6 px-3.5 py-2.5 text-base sm:text-sm text-white/90 outline-none placeholder:text-white/25 focus:border-white/20 focus:bg-white/8 transition-colors disabled:opacity-50"
                style={{ minHeight: "42px", maxHeight: "120px" }}
              />
              <button
                type="button"
                onClick={() => void sendComment()}
                disabled={!input.trim() || sending}
                className="h-[42px] w-[42px] shrink-0 rounded-2xl bg-white text-black flex items-center justify-center hover:opacity-90 transition disabled:opacity-30"
              >
                {sending ? (
                  <div className="h-3.5 w-3.5 rounded-full border-2 border-black/25 border-t-black animate-spin" />
                ) : (
                  <Send size={15} className="ml-0.5" />
                )}
              </button>
            </div>
          )}
          {error && <p className="mt-1.5 text-xs text-red-400/80">{error}</p>}
        </div>
      </div>
    </>
  );
}
