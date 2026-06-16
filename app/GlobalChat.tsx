"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { MessageSquare, Send, X } from "lucide-react";
import { useAuth } from "./AuthProvider";
import { createAuthorizedHeaders } from "@/lib/clientAuth";
import { getSupabaseBrowserAuthClient } from "@/lib/supabaseAuth";
import { getPublicProfileHref } from "@/lib/publicLinks";
import type { ChatMessage } from "@/app/api/chat/route";

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

type MessageGroup = { user_id: string; display_name: string; messages: ChatMessage[] };

function groupMessages(messages: ChatMessage[]): MessageGroup[] {
  const groups: MessageGroup[] = [];
  for (const msg of messages) {
    const last = groups[groups.length - 1];
    if (last && last.user_id === msg.user_id) {
      last.messages.push(msg);
    } else {
      groups.push({ user_id: msg.user_id, display_name: msg.display_name, messages: [msg] });
    }
  }
  return groups;
}

const CHANNEL_NAME = "global-chat";
const BROADCAST_EVENT = "msg";

export default function GlobalChat() {
  const { accessToken, isAuthenticated, user } = useAuth();

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const [unread, setUnread] = useState(0);
  const [avatarCache, setAvatarCache] = useState<Record<string, string>>({});

  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const openRef = useRef(false);
  const channelRef = useRef<ReturnType<typeof getSupabaseBrowserAuthClient> extends infer C ? (C extends null ? never : NonNullable<C> extends { channel: (...a: never[]) => infer R } ? R : never) : never | null>(null);

  openRef.current = open;

  function addMessage(msg: ChatMessage) {
    setMessages((prev) => {
      if (prev.some((m) => m.id === msg.id)) return prev;
      return [...prev, msg];
    });
  }

  // Realtime Broadcast subscription (no table needed)
  useEffect(() => {
    const client = getSupabaseBrowserAuthClient();
    if (!client) return;

    const channel = client
      .channel(CHANNEL_NAME)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .on("broadcast" as any, { event: BROADCAST_EVENT }, (payload: Record<string, unknown>) => {
        const msg = payload.payload as ChatMessage | undefined;
        if (!msg) return;
        addMessage(msg);
        if (!openRef.current) setUnread((u) => u + 1);
      })
      .subscribe();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (channelRef as any).current = channel;

    return () => {
      void client.removeChannel(channel);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (channelRef as any).current = null;
    };
  }, []);

  // Fetch avatars for all unique user IDs in messages
  useEffect(() => {
    const uniqueIds = [...new Set(messages.map((m) => m.user_id))].filter(
      (id) => !(id in avatarCache)
    );
    if (uniqueIds.length === 0) return;

    const url = `/api/chat/profiles?ids=${uniqueIds.map(encodeURIComponent).join(",")}`;
    fetch(url, { cache: "no-store" })
      .then((r) => r.json())
      .then((data: Record<string, { avatarUrl?: string }>) => {
        setAvatarCache((prev) => {
          const next = { ...prev };
          for (const [id, profile] of Object.entries(data)) {
            next[id] = profile.avatarUrl ?? "";
          }
          return next;
        });
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages]);

  // Load history when panel opens
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    async function load() {
      setLoadingHistory(true);
      try {
        const res = await fetch("/api/chat", { cache: "no-store" });
        const json = (await res.json()) as { ok?: boolean; messages?: ChatMessage[] };
        if (!cancelled && json.ok && Array.isArray(json.messages)) {
          setMessages(json.messages);
        }
      } catch {
        /* silent */
      } finally {
        if (!cancelled) setLoadingHistory(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [open]);

  // Scroll to bottom
  useEffect(() => {
    if (!open) return;
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 220;
    if (nearBottom || messages.length <= 5) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, open]);

  // On open: clear unread + focus + scroll
  useEffect(() => {
    if (open) {
      setUnread(0);
      setTimeout(() => {
        bottomRef.current?.scrollIntoView({ behavior: "instant" });
        inputRef.current?.focus();
      }, 50);
    }
  }, [open]);

  // Escape to close
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open]);

  async function sendMessage() {
    const content = input.trim();
    if (!content || sending || !accessToken) return;
    setSending(true);
    setSendError("");
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: createAuthorizedHeaders(accessToken, { "Content-Type": "application/json" }),
        body: JSON.stringify({ content }),
      });
      const json = (await res.json()) as { ok?: boolean; message?: ChatMessage; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Erreur d'envoi");

      if (json.message) {
        addMessage(json.message);
        setInput("");
        // Broadcast to other clients via Realtime
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ch = (channelRef as any).current;
        if (ch) {
          void ch.send({ type: "broadcast", event: BROADCAST_EVENT, payload: json.message });
        }
      }
    } catch (e) {
      setSendError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setSending(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendMessage();
    }
  }

  const groups = useMemo(() => groupMessages(messages), [messages]);
  const myId = user?.id ?? "";

  return (
    <>
      {/* Floating button */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Chat général"
        className={[
          "fixed z-[55] flex items-center justify-center rounded-full border transition-all shadow-lg",
          "top-[11px] right-16 h-9 w-9",
          "md:top-4 md:right-4 md:h-10 md:w-10",
          open
            ? "bg-white border-white text-black"
            : "border-white/15 bg-black/70 backdrop-blur text-white/70 hover:text-white hover:border-white/30 hover:bg-white/10",
        ].join(" ")}
      >
        {open ? <X size={15} /> : <MessageSquare size={15} />}
        {!open && unread > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white tabular-nums">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {/* Backdrop (mobile) */}
      {open && (
        <div
          className="fixed inset-0 z-[54] bg-black/50 md:hidden"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Panel */}
      <div
        className={[
          "fixed z-[56] flex flex-col",
          "inset-x-0 bottom-0 top-16 rounded-t-3xl",
          "md:inset-x-auto md:right-0 md:top-0 md:bottom-0 md:w-[360px] md:rounded-none md:rounded-l-3xl",
          "border-t border-white/10 md:border-t-0 md:border-l",
          "bg-[#080809]/95 backdrop-blur-xl",
          "transition-transform duration-300 ease-in-out",
          open ? "translate-y-0 md:translate-x-0" : "translate-y-full md:translate-y-0 md:translate-x-full",
        ].join(" ")}
        aria-hidden={!open}
      >
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-white/8 px-5 py-4 shrink-0">
          <div className="h-2 w-2 rounded-full bg-green-400 animate-pulse" />
          <h2 className="flex-1 text-sm font-medium text-white/85">Chat général</h2>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="h-8 w-8 rounded-full text-white/40 hover:text-white hover:bg-white/8 transition flex items-center justify-center"
          >
            <X size={15} />
          </button>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-1">
          {loadingHistory ? (
            <div className="space-y-3 pt-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="flex gap-2.5 animate-pulse">
                  <div className="h-7 w-7 shrink-0 rounded-full bg-white/8" />
                  <div className="space-y-1.5 flex-1">
                    <div className="h-2.5 w-20 rounded-full bg-white/8" />
                    <div className="h-9 rounded-2xl bg-white/6 w-3/4" />
                  </div>
                </div>
              ))}
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-center py-16">
              <MessageSquare size={32} className="text-white/12" />
              <p className="text-sm text-white/35">Aucun message pour l&apos;instant.</p>
              <p className="text-xs text-white/20">Sois le premier à écrire !</p>
            </div>
          ) : (
            groups.map((group) => {
              const isMe = group.user_id === myId;
              const hue = nameHue(group.display_name);
              const avatarUrl = avatarCache[group.user_id] ?? group.messages[0].avatar_url ?? "";
              const profileHref = getPublicProfileHref(group.user_id);
              return (
                <div
                  key={group.user_id + group.messages[0].id}
                  className={["flex gap-2.5 pt-2", isMe ? "flex-row-reverse" : "flex-row"].join(" ")}
                >
                  {/* Avatar */}
                  <Link
                    href={profileHref}
                    title={`Voir le profil de ${group.display_name}`}
                    className="h-7 w-7 shrink-0 rounded-full overflow-hidden mt-0.5 self-start ring-1 ring-transparent hover:ring-white/30 transition"
                    style={
                      !avatarUrl
                        ? { background: `linear-gradient(135deg, hsla(${hue},70%,55%,1), hsla(${(hue + 50) % 360},75%,48%,1))` }
                        : undefined
                    }
                  >
                    {avatarUrl ? (
                      <Image src={avatarUrl} alt={group.display_name} width={28} height={28} className="h-full w-full object-cover" />
                    ) : (
                      <span className="h-full w-full flex items-center justify-center text-[10px] font-semibold text-white">
                        {initials(group.display_name)}
                      </span>
                    )}
                  </Link>

                  <div className={["flex flex-col gap-1 max-w-[75%]", isMe ? "items-end" : "items-start"].join(" ")}>
                    {!isMe && (
                      <Link
                        href={profileHref}
                        className="text-[10px] text-white/40 hover:text-white/75 px-1 mb-0.5 transition underline-offset-2 hover:underline"
                      >
                        {group.display_name}
                      </Link>
                    )}
                    {group.messages.map((msg, i) => (
                      <div key={msg.id} className="flex flex-col">
                        <div
                          className={[
                            "px-3 py-2 text-sm leading-relaxed break-words",
                            isMe
                              ? "bg-white/12 text-white/90 rounded-2xl rounded-tr-md"
                              : "bg-white/6 text-white/80 rounded-2xl rounded-tl-md",
                            i > 0 && isMe ? "rounded-tr-2xl" : "",
                            i > 0 && !isMe ? "rounded-tl-2xl" : "",
                          ].join(" ")}
                        >
                          {msg.content}
                        </div>
                        {i === group.messages.length - 1 && (
                          <p className={["text-[10px] text-white/25 mt-1 px-1", isMe ? "text-right" : "text-left"].join(" ")}>
                            {formatTime(msg.created_at)}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })
          )}
          <div ref={bottomRef} className="h-1" />
        </div>

        {/* Input */}
        <div className="border-t border-white/8 px-4 py-3 shrink-0 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          {!isAuthenticated ? (
            <div className="rounded-2xl border border-white/8 bg-white/4 px-4 py-3 text-center">
              <p className="text-xs text-white/45">
                <a href="/account" className="underline underline-offset-2 hover:text-white/70 transition">
                  Connecte-toi
                </a>{" "}
                pour participer au chat.
              </p>
            </div>
          ) : (
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  setSendError("");
                  e.target.style.height = "auto";
                  e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
                }}
                onKeyDown={onKeyDown}
                placeholder="Écrire un message…"
                rows={1}
                maxLength={500}
                disabled={sending}
                className="flex-1 resize-none overflow-hidden rounded-2xl border border-white/10 bg-white/6 px-3.5 py-2.5 text-sm text-white/90 outline-none placeholder:text-white/25 focus:border-white/20 focus:bg-white/8 transition-colors disabled:opacity-50"
                style={{ minHeight: "42px", maxHeight: "120px" }}
              />
              <button
                type="button"
                onClick={() => void sendMessage()}
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
          {sendError && <p className="mt-1.5 text-xs text-red-400/80">{sendError}</p>}
        </div>
      </div>
    </>
  );
}
