"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { MessageSquareText, Send, Trash2 } from "lucide-react";
import { useAuth } from "./AuthProvider";
import { createAuthorizedHeaders } from "@/lib/clientAuth";
import { getPublicProfileHref } from "@/lib/publicLinks";

type GuestbookEntry = {
  id: string;
  authorId: string;
  authorDisplayName: string;
  authorAvatarUrl: string;
  text: string;
  createdAt: number;
};

type Props = {
  userId: string;
  hue: number;
  isOwnProfile: boolean;
};

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function GuestbookSection({ userId, hue, isOwnProfile }: Props) {
  const { accessToken, isAuthenticated, user } = useAuth();
  const [entries, setEntries] = useState<GuestbookEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/users/${encodeURIComponent(userId)}/guestbook`, { cache: "no-store" })
      .then((r) => r.json())
      .then((json: { ok?: boolean; entries?: GuestbookEntry[] }) => {
        if (cancelled) return;
        setEntries(Array.isArray(json.entries) ? json.entries : []);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  async function submitEntry() {
    if (!accessToken || sending) return;
    const trimmed = text.trim();
    if (!trimmed) return;

    setSending(true);
    setError("");
    try {
      const res = await fetch(`/api/users/${encodeURIComponent(userId)}/guestbook`, {
        method: "POST",
        headers: createAuthorizedHeaders(accessToken, { "Content-Type": "application/json" }),
        body: JSON.stringify({ text: trimmed }),
      });
      const json = (await res.json()) as { ok?: boolean; entry?: GuestbookEntry; error?: string };
      if (!res.ok || !json.ok || !json.entry) {
        throw new Error(json.error ?? `Envoi impossible (HTTP ${res.status})`);
      }
      setEntries((prev) => [...prev, json.entry as GuestbookEntry]);
      setText("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Envoi impossible.");
    } finally {
      setSending(false);
    }
  }

  async function deleteEntry(entryId: string) {
    if (!accessToken) return;
    const previous = entries;
    setEntries((prev) => prev.filter((e) => e.id !== entryId));
    try {
      const res = await fetch(`/api/users/${encodeURIComponent(userId)}/guestbook`, {
        method: "DELETE",
        headers: createAuthorizedHeaders(accessToken, { "Content-Type": "application/json" }),
        body: JSON.stringify({ entryId }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setEntries(previous);
    }
  }

  return (
    <section
      className="rounded-3xl border border-white/8 bg-white/[0.03] p-5 mp3-fade-up"
      style={{ animationDelay: "110ms", boxShadow: `0 0 0 1px hsla(${hue}, 50%, 50%, 0.06)` }}
    >
      <div className="flex items-center gap-2 mb-4">
        <MessageSquareText size={14} className="text-white/30" />
        <p className="text-xs uppercase tracking-[0.22em] text-white/25">Livre d&apos;or</p>
        {entries.length > 0 && <span className="text-xs text-white/25 tabular-nums">{entries.length}</span>}
      </div>

      <div className="space-y-3 max-h-[360px] overflow-y-auto mb-4">
        {loading ? (
          <p className="text-xs text-white/30 text-center py-4">Chargement...</p>
        ) : entries.length === 0 ? (
          <p className="text-xs text-white/30 text-center py-4">Aucun message pour l&apos;instant.</p>
        ) : (
          entries
            .slice()
            .reverse()
            .map((entry) => (
              <div key={entry.id} className="flex items-start gap-2.5">
                <Link href={getPublicProfileHref(entry.authorId)} className="shrink-0 mt-0.5">
                  <div className="h-7 w-7 rounded-full overflow-hidden bg-white/10 flex items-center justify-center text-[10px] font-semibold text-white/60">
                    {entry.authorAvatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={entry.authorAvatarUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      entry.authorDisplayName.slice(0, 2).toUpperCase()
                    )}
                  </div>
                </Link>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Link
                      href={getPublicProfileHref(entry.authorId)}
                      className="text-xs font-medium text-white/80 hover:underline truncate"
                    >
                      {entry.authorDisplayName}
                    </Link>
                    <span className="text-[10px] text-white/25 shrink-0">{formatDate(entry.createdAt)}</span>
                  </div>
                  <p className="text-sm text-white/85 break-words">{entry.text}</p>
                </div>
                {(user?.id === entry.authorId || isOwnProfile) && (
                  <button
                    type="button"
                    onClick={() => void deleteEntry(entry.id)}
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

      {error && <p className="text-xs text-red-400/90 mb-3">{error}</p>}

      {isAuthenticated ? (
        <div className="flex items-center gap-2 pt-3 border-t border-white/6">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void submitEntry();
              }
            }}
            maxLength={200}
            placeholder="Laisser un mot..."
            className="flex-1 rounded-2xl bg-white/5 border border-white/10 px-3.5 py-2.5 text-sm text-white/90 outline-none focus:border-white/25 placeholder:text-white/25"
          />
          <button
            type="button"
            onClick={() => void submitEntry()}
            disabled={!text.trim() || sending}
            className="h-10 w-10 shrink-0 rounded-full bg-white text-black flex items-center justify-center disabled:opacity-40 transition"
            aria-label="Envoyer"
          >
            <Send size={15} />
          </button>
        </div>
      ) : (
        <p className="text-xs text-white/35 text-center pt-3 border-t border-white/6">
          <Link href="/account" className="underline underline-offset-4 hover:text-white/60">
            Connecte-toi
          </Link>{" "}
          pour laisser un mot.
        </p>
      )}
    </section>
  );
}
