"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { MessageCircle } from "lucide-react";
import { useAuth } from "@/app/AuthProvider";
import { createAuthorizedHeaders } from "@/lib/clientAuth";
import { getSupabaseBrowserAuthClient } from "@/lib/supabaseAuth";
import { getInitials } from "@/lib/publicLinks";

type ConversationPreview = {
  userId: string;
  displayName: string;
  avatarUrl: string;
  lastMessage: string;
  lastFromMe: boolean;
  updatedAt: number;
};

function formatRelative(timestamp: number) {
  const diff = Date.now() - timestamp;
  if (diff < 60_000) return "à l'instant";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} h`;
  return new Date(timestamp).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

export default function MessagesInboxPage() {
  const { accessToken, isAuthenticated, loading, user } = useAuth();
  const [conversations, setConversations] = useState<ConversationPreview[]>([]);
  const [fetched, setFetched] = useState(false);

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;

    function load() {
      fetch("/api/messages", { cache: "no-store", headers: createAuthorizedHeaders(accessToken!) })
        .then((r) => r.json())
        .then((json: { ok?: boolean; conversations?: ConversationPreview[] }) => {
          if (!cancelled && json.ok && json.conversations) setConversations(json.conversations);
        })
        .catch(() => {})
        .finally(() => {
          if (!cancelled) setFetched(true);
        });
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  useEffect(() => {
    if (!isAuthenticated || !accessToken || !user?.id) return;
    const supabase = getSupabaseBrowserAuthClient();
    if (!supabase) return;

    const channel = supabase
      .channel(`user:${user.id}`)
      .on("broadcast", { event: "new_notification" }, ({ payload }) => {
        const data = payload as { type?: string };
        if (data?.type !== "message") return;
        fetch("/api/messages", { cache: "no-store", headers: createAuthorizedHeaders(accessToken) })
          .then((r) => r.json())
          .then((json: { ok?: boolean; conversations?: ConversationPreview[] }) => {
            if (json.ok && json.conversations) setConversations(json.conversations);
          })
          .catch(() => {});
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [isAuthenticated, accessToken, user?.id]);

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto pb-[calc(11rem+env(safe-area-inset-bottom))] sm:pb-40 pt-20 text-center text-white/35 text-sm">
        Chargement…
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="max-w-2xl mx-auto pb-[calc(11rem+env(safe-area-inset-bottom))] sm:pb-40 pt-20 text-center">
        <p className="text-sm text-white/45">Connecte-toi pour voir tes messages.</p>
        <Link href="/account" className="mt-3 inline-block text-sm text-white/70 underline underline-offset-4">
          Aller au compte
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto pb-[calc(11rem+env(safe-area-inset-bottom))] sm:pb-40">
      <h2 className="text-3xl font-light mb-8 mp3-fade-up">Messages</h2>

      {!fetched ? (
        <p className="text-sm text-white/35">Chargement…</p>
      ) : conversations.length === 0 ? (
        <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-8 text-center mp3-fade-up">
          <MessageCircle size={22} className="mx-auto text-white/25 mb-3" />
          <p className="text-sm text-white/45">Aucune conversation pour le moment.</p>
          <p className="text-xs text-white/30 mt-1">
            Rends-toi sur le profil de quelqu&apos;un pour lui envoyer un message.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {conversations.map((conv, i) => (
            <Link
              key={conv.userId}
              href={`/messages/${conv.userId}`}
              className="flex items-center gap-3 rounded-2xl border border-white/5 bg-white/[0.03] px-4 py-3 hover:bg-white/[0.06] transition mp3-fade-up"
              style={{ animationDelay: `${Math.min(i, 12) * 30}ms` }}
            >
              <div className="relative h-11 w-11 shrink-0 rounded-full overflow-hidden bg-white/8 flex items-center justify-center text-xs font-semibold text-white/60">
                {conv.avatarUrl ? (
                  <Image src={conv.avatarUrl} alt={conv.displayName} fill className="object-cover" />
                ) : (
                  getInitials(conv.displayName)
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-white/90 truncate">{conv.displayName}</p>
                <p className="text-xs text-white/40 truncate">
                  {conv.lastFromMe ? "Toi : " : ""}
                  {conv.lastMessage}
                </p>
              </div>
              <span className="text-xs text-white/30 shrink-0">{formatRelative(conv.updatedAt)}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
