"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { ArrowLeft, Send } from "lucide-react";
import { useAuth } from "@/app/AuthProvider";
import { createAuthorizedHeaders } from "@/lib/clientAuth";
import { getSupabaseBrowserAuthClient } from "@/lib/supabaseAuth";
import { getInitials, getPublicProfileHref } from "@/lib/publicLinks";

type DirectMessage = {
  id: string;
  senderId: string;
  content: string;
  createdAt: number;
};

type PublicProfile = {
  displayName: string;
  avatarUrl: string;
};

function formatTime(timestamp: number) {
  const d = new Date(timestamp);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function ConversationPage() {
  const params = useParams<{ userId: string }>();
  const otherId = params?.userId ?? "";
  const { accessToken, isAuthenticated, loading, user } = useAuth();

  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [fetched, setFetched] = useState(false);
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!otherId) return;
    let cancelled = false;
    fetch(`/api/public/users/${encodeURIComponent(otherId)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((json: { ok?: boolean; profile?: PublicProfile }) => {
        if (!cancelled && json.ok && json.profile) setProfile(json.profile);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [otherId]);

  useEffect(() => {
    if (!accessToken || !otherId) return;
    let cancelled = false;
    fetch(`/api/messages/${encodeURIComponent(otherId)}`, {
      cache: "no-store",
      headers: createAuthorizedHeaders(accessToken),
    })
      .then((r) => r.json())
      .then((json: { ok?: boolean; messages?: DirectMessage[] }) => {
        if (!cancelled && json.ok && json.messages) setMessages(json.messages);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setFetched(true);
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, otherId]);

  useEffect(() => {
    if (!user?.id || !otherId || !accessToken) return;
    const conversationId = [user.id, otherId].sort().join("__");
    const supabase = getSupabaseBrowserAuthClient();
    if (!supabase) return;

    // The broadcast payload intentionally carries no message content (that channel is reachable
    // by anyone holding the public anon key) - it's just a ping to re-fetch via the authenticated endpoint.
    const channel = supabase
      .channel(`dm:${conversationId}`)
      .on("broadcast", { event: "dm_message" }, () => {
        fetch(`/api/messages/${encodeURIComponent(otherId)}`, {
          cache: "no-store",
          headers: createAuthorizedHeaders(accessToken),
        })
          .then((r) => r.json())
          .then((json: { ok?: boolean; messages?: DirectMessage[] }) => {
            if (json.ok && json.messages) setMessages(json.messages);
          })
          .catch(() => {});
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user?.id, otherId, accessToken]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  async function sendMessage() {
    const content = input.trim();
    if (!content || sending || !accessToken || !otherId) return;
    setSending(true);
    setInput("");
    try {
      const res = await fetch(`/api/messages/${encodeURIComponent(otherId)}`, {
        method: "POST",
        headers: createAuthorizedHeaders(accessToken, { "Content-Type": "application/json" }),
        body: JSON.stringify({ content }),
      });
      const json = (await res.json()) as { ok?: boolean; messages?: DirectMessage[] };
      if (res.ok && json.ok && json.messages) setMessages(json.messages);
      else setInput(content);
    } catch {
      setInput(content);
    } finally {
      setSending(false);
    }
  }

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
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto pb-[calc(11rem+env(safe-area-inset-bottom))] sm:pb-40 flex flex-col h-[calc(100vh-8rem)]">
      <div className="flex items-center gap-3 mb-6 mp3-fade-up shrink-0">
        <Link
          href="/messages"
          aria-label="Retour aux messages"
          className="h-9 w-9 rounded-full flex items-center justify-center text-white/50 hover:text-white/90 hover:bg-white/8 transition shrink-0"
        >
          <ArrowLeft size={18} />
        </Link>
        <Link href={getPublicProfileHref(otherId)} className="flex items-center gap-3 min-w-0">
          <div className="relative h-10 w-10 shrink-0 rounded-full overflow-hidden bg-white/8 flex items-center justify-center text-xs font-semibold text-white/60">
            {profile?.avatarUrl ? (
              <Image src={profile.avatarUrl} alt={profile.displayName} fill className="object-cover" />
            ) : (
              getInitials(profile?.displayName ?? "")
            )}
          </div>
          <p className="text-lg text-white/90 truncate">{profile?.displayName ?? "Profil"}</p>
        </Link>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-2 pr-1">
        {!fetched ? (
          <p className="text-sm text-white/35 text-center py-10">Chargement…</p>
        ) : messages.length === 0 ? (
          <p className="text-sm text-white/35 text-center py-10">
            Dis bonjour à {profile?.displayName ?? "cette personne"} 👋
          </p>
        ) : (
          messages.map((msg) => {
            const mine = msg.senderId === user?.id;
            return (
              <div key={msg.id} className={`flex ${mine ? "justify-end" : "justify-start"} mp3-fade-up`}>
                <div
                  className={[
                    "max-w-[75%] rounded-2xl px-3.5 py-2.5",
                    mine ? "bg-white text-black" : "bg-white/8 text-white/85",
                  ].join(" ")}
                >
                  <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>
                  <p className={`text-[10px] mt-1 ${mine ? "text-black/45" : "text-white/35"}`}>
                    {formatTime(msg.createdAt)}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="mt-4 flex items-center gap-2 shrink-0">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void sendMessage();
            }
          }}
          placeholder="Ecrire un message..."
          maxLength={1000}
          className="flex-1 h-11 rounded-full bg-[#111118] border border-white/10 px-4 text-sm text-white/90 outline-none placeholder:text-white/30 focus:border-white/25"
        />
        <button
          type="button"
          onClick={() => void sendMessage()}
          disabled={!input.trim() || sending}
          aria-label="Envoyer"
          className="h-11 w-11 rounded-full bg-white text-black flex items-center justify-center disabled:opacity-40 hover:opacity-90 transition shrink-0"
        >
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}
