"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { MessageCircle, MessageSquare, Send, Trash2, X } from "lucide-react";
import { useAuth } from "./AuthProvider";
import { usePlayer } from "./PlayerContext";
import { createAuthorizedHeaders } from "@/lib/clientAuth";
import { getSupabaseBrowserAuthClient } from "@/lib/supabaseAuth";
import { getInitials, getPublicProfileHref } from "@/lib/publicLinks";
import { isAdminUser } from "@/lib/adminAccess";
import { playPopSound } from "./sound";
import { vibrate } from "./haptics";
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

function formatRelative(timestamp: number) {
  const diff = Date.now() - timestamp;
  if (diff < 60_000) return "à l'instant";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} h`;
  return new Date(timestamp).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

type ConversationPreview = {
  userId: string;
  displayName: string;
  avatarUrl: string;
  lastMessage: string;
  lastFromMe: boolean;
  updatedAt: number;
};

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

type Participant = { id: string; name: string };

function renderMessageContent(content: string, participants: Participant[]) {
  if (participants.length === 0) return content;

  const sorted = [...participants].sort((a, b) => b.name.length - a.name.length);
  const nodes: ReactNode[] = [];
  const lower = content.toLowerCase();
  let cursor = 0;

  while (cursor < content.length) {
    const atIndex = content.indexOf("@", cursor);
    if (atIndex === -1) {
      nodes.push(content.slice(cursor));
      break;
    }

    const matched = sorted.find((p) => lower.startsWith(`@${p.name.toLowerCase()}`, atIndex));

    if (matched) {
      nodes.push(content.slice(cursor, atIndex));
      nodes.push(
        <span key={`${atIndex}-${matched.name}`} className="text-sky-300 font-medium">
          @{matched.name}
        </span>
      );
      cursor = atIndex + 1 + matched.name.length;
    } else {
      nodes.push(content.slice(cursor, atIndex + 1));
      cursor = atIndex + 1;
    }
  }

  return nodes;
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
const BROADCAST_DELETE_EVENT = "delete";
const BROADCAST_TYPING_EVENT = "typing";
const TYPING_EXPIRY_MS = 3000;
const TYPING_BROADCAST_INTERVAL_MS = 2000;

export default function GlobalChat() {
  const { accessToken, isAuthenticated, user, displayName } = useAuth();
  const { uiSounds, hapticsEnabled } = usePlayer();
  const myId = user?.id ?? "";

  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"global" | "private">("global");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [conversations, setConversations] = useState<ConversationPreview[]>([]);
  const [conversationsLoading, setConversationsLoading] = useState(false);
  const [conversationsLoaded, setConversationsLoaded] = useState(false);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const [unread, setUnread] = useState(0);
  const [avatarCache, setAvatarCache] = useState<Record<string, string>>({});
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionStart, setMentionStart] = useState(-1);
  const [typingUsers, setTypingUsers] = useState<Record<string, { name: string; expiresAt: number }>>({});

  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const openRef = useRef(false);
  const lastTypingBroadcastRef = useRef(0);
  const channelRef = useRef<ReturnType<typeof getSupabaseBrowserAuthClient> extends infer C ? (C extends null ? never : NonNullable<C> extends { channel: (...a: never[]) => infer R } ? R : never) : never | null>(null);

  const [keyboardOffset, setKeyboardOffset] = useState(0);
  const [panelDragY, setPanelDragY] = useState(0);
  const panelDragStartRef = useRef<number | null>(null);

  openRef.current = open;

  // Sur mobile, le clavier virtuel ne redimensionne pas le viewport "layout"
  // utilise par position: fixed -> on suit visualViewport pour remonter le
  // panneau au-dessus du clavier au lieu de le laisser le recouvrir.
  useEffect(() => {
    if (typeof window === "undefined" || !window.visualViewport) return;
    const vv = window.visualViewport;

    function onResize() {
      if (window.innerWidth >= 768) {
        setKeyboardOffset(0);
        return;
      }
      const offset = Math.max(0, Math.round(window.innerHeight - vv.height));
      setKeyboardOffset(offset);
    }

    onResize();
    vv.addEventListener("resize", onResize);
    vv.addEventListener("scroll", onResize);
    return () => {
      vv.removeEventListener("resize", onResize);
      vv.removeEventListener("scroll", onResize);
    };
  }, []);

  function onPanelHeaderTouchStart(e: React.TouchEvent) {
    panelDragStartRef.current = e.touches[0].clientY;
  }

  function onPanelHeaderTouchMove(e: React.TouchEvent) {
    if (panelDragStartRef.current === null) return;
    const delta = e.touches[0].clientY - panelDragStartRef.current;
    if (delta > 0) setPanelDragY(delta);
  }

  function onPanelHeaderTouchEnd() {
    if (panelDragStartRef.current === null) return;
    panelDragStartRef.current = null;
    if (panelDragY > 90) {
      if (hapticsEnabled) vibrate(12);
      setOpen(false);
    }
    setPanelDragY(0);
  }

  function addMessage(msg: ChatMessage) {
    setMessages((prev) => {
      if (prev.some((m) => m.id === msg.id)) return prev;
      return [...prev, msg];
    });
  }

  function removeMessage(id: string) {
    setMessages((prev) => prev.filter((m) => m.id !== id));
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .on("broadcast" as any, { event: BROADCAST_DELETE_EVENT }, (payload: Record<string, unknown>) => {
        const data = payload.payload as { id?: string } | undefined;
        if (data?.id) removeMessage(data.id);
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .on("broadcast" as any, { event: BROADCAST_TYPING_EVENT }, (payload: Record<string, unknown>) => {
        const data = payload.payload as { userId?: string; name?: string } | undefined;
        if (!data?.userId || !data.name) return;
        setTypingUsers((prev) => ({
          ...prev,
          [data.userId as string]: { name: data.name as string, expiresAt: Date.now() + TYPING_EXPIRY_MS },
        }));
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

  // Expire stale "typing" entries
  useEffect(() => {
    const interval = setInterval(() => {
      setTypingUsers((prev) => {
        const now = Date.now();
        const next: typeof prev = {};
        let changed = false;
        for (const [id, entry] of Object.entries(prev)) {
          if (entry.expiresAt > now) next[id] = entry;
          else changed = true;
        }
        return changed ? next : prev;
      });
    }, 1000);
    return () => clearInterval(interval);
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

  // Load private conversations when the "Messages" tab is opened
  useEffect(() => {
    if (!open || activeTab !== "private" || !isAuthenticated || !accessToken) return;
    let cancelled = false;
    async function load() {
      setConversationsLoading(true);
      try {
        const res = await fetch("/api/messages", { cache: "no-store", headers: createAuthorizedHeaders(accessToken!) });
        const json = (await res.json()) as { ok?: boolean; conversations?: ConversationPreview[] };
        if (!cancelled && json.ok && Array.isArray(json.conversations)) {
          setConversations(json.conversations);
        }
      } catch {
        /* silent */
      } finally {
        if (!cancelled) {
          setConversationsLoading(false);
          setConversationsLoaded(true);
        }
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [open, activeTab, isAuthenticated, accessToken]);

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
        if (uiSounds) playPopSound();
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

  async function deleteMessage(id: string) {
    if (!accessToken) return;
    try {
      const res = await fetch("/api/chat", {
        method: "DELETE",
        headers: createAuthorizedHeaders(accessToken, { "Content-Type": "application/json" }),
        body: JSON.stringify({ id }),
      });
      if (!res.ok) return;

      removeMessage(id);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ch = (channelRef as any).current;
      if (ch) {
        void ch.send({ type: "broadcast", event: BROADCAST_DELETE_EVENT, payload: { id } });
      }
    } catch {
      /* silent */
    }
  }

  const knownParticipants: Participant[] = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of messages) {
      if (m.user_id !== myId) map.set(m.user_id, m.display_name);
    }
    return [...map.entries()].map(([id, name]) => ({ id, name }));
  }, [messages, myId]);

  const mentionMatches = useMemo(() => {
    if (mentionQuery === null) return [];
    const q = mentionQuery.toLowerCase();
    return knownParticipants.filter((p) => p.name.toLowerCase().startsWith(q)).slice(0, 5);
  }, [mentionQuery, knownParticipants]);

  function handleInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const value = e.target.value;
    const cursor = e.target.selectionStart ?? value.length;
    setInput(value);
    setSendError("");
    e.target.style.height = "auto";
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";

    const prefix = value.slice(0, cursor);
    const match = /@([^\s@]*)$/.exec(prefix);
    if (match) {
      setMentionQuery(match[1]);
      setMentionStart(cursor - match[1].length - 1);
    } else {
      setMentionQuery(null);
      setMentionStart(-1);
    }

    if (value.trim() && myId) {
      const now = Date.now();
      if (now - lastTypingBroadcastRef.current > TYPING_BROADCAST_INTERVAL_MS) {
        lastTypingBroadcastRef.current = now;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ch = (channelRef as any).current;
        if (ch) {
          void ch.send({
            type: "broadcast",
            event: BROADCAST_TYPING_EVENT,
            payload: { userId: myId, name: displayName || "Quelqu'un" },
          });
        }
      }
    }
  }

  function applyMention(name: string) {
    if (mentionStart < 0) return;
    const cursor = inputRef.current?.selectionStart ?? input.length;
    const before = input.slice(0, mentionStart);
    const after = input.slice(cursor);
    const next = `${before}@${name} ${after}`;
    setInput(next);
    setMentionQuery(null);
    setMentionStart(-1);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      const pos = before.length + name.length + 2;
      inputRef.current?.setSelectionRange(pos, pos);
    });
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && mentionMatches.length > 0) {
      e.preventDefault();
      applyMention(mentionMatches[0].name);
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendMessage();
    }
  }

  const groups = useMemo(() => groupMessages(messages), [messages]);
  const canModerate = isAdminUser(myId);
  const typingNames = Object.entries(typingUsers)
    .filter(([id]) => id !== myId)
    .map(([, entry]) => entry.name);

  return (
    <>
      {/* Floating button */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Chat et messages"
        className={[
          "fixed z-[55] flex items-center justify-center rounded-full border transition-all active:scale-90 shadow-lg shadow-black/30",
          "top-0 right-16 h-10 w-10",
          "md:top-3 md:right-4 md:h-10 md:w-10",
          open
            ? "bg-white border-white text-black"
            : "border-white/20 bg-black/75 backdrop-blur text-white/75 hover:text-white hover:border-white/35 hover:bg-white/12",
        ].join(" ")}
      >
        {open ? <X size={16} /> : <MessageSquare size={16} />}
        {!open && unread > 0 && (
          <span
            key={unread}
            className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white tabular-nums leading-none mp3-pop"
          >
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {/* Backdrop (mobile) */}
      {open && (
        <div
          className="fixed inset-0 z-[54] bg-black/50 md:hidden mp3-backdrop-in"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Panel */}
      <div
        className={[
          "fixed z-[56] flex flex-col",
          "inset-x-0 bottom-0 top-[calc(3rem+env(safe-area-inset-top))] rounded-t-3xl",
          "md:inset-x-auto md:right-0 md:top-0 md:bottom-0 md:w-[360px] md:rounded-none md:rounded-l-3xl",
          "border-t border-white/10 md:border-t-0 md:border-l",
          "bg-[#080809]/95 backdrop-blur-xl",
          panelDragY ? "" : "transition-transform duration-300 ease-in-out",
          open ? "translate-y-0 md:translate-x-0" : "translate-y-full md:translate-y-0 md:translate-x-full",
        ].join(" ")}
        style={{
          bottom: keyboardOffset > 0 ? `${keyboardOffset}px` : undefined,
          transform: panelDragY ? `translateY(${panelDragY}px)` : undefined,
        }}
        aria-hidden={!open}
      >
        {/* Header */}
        <div
          onTouchStart={onPanelHeaderTouchStart}
          onTouchMove={onPanelHeaderTouchMove}
          onTouchEnd={onPanelHeaderTouchEnd}
          className="flex flex-col gap-2 border-b border-white/8 px-5 pt-3 pb-4 shrink-0"
        >
          <div className="mx-auto h-1.5 w-10 rounded-full bg-white/15 md:hidden" aria-hidden="true" />
          <div className="flex items-center gap-2">
            <div className="flex flex-1 items-center gap-1 rounded-full bg-white/6 p-1">
              <button
                type="button"
                onClick={() => setActiveTab("global")}
                className={[
                  "flex-1 flex items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition",
                  activeTab === "global" ? "bg-white text-black" : "text-white/50 hover:text-white/80",
                ].join(" ")}
              >
                <span
                  className={["h-1.5 w-1.5 rounded-full", activeTab === "global" ? "bg-green-500" : "bg-green-400 animate-pulse"].join(" ")}
                  aria-hidden="true"
                />
                Chat général
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("private")}
                className={[
                  "flex-1 flex items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition",
                  activeTab === "private" ? "bg-white text-black" : "text-white/50 hover:text-white/80",
                ].join(" ")}
              >
                <MessageCircle size={13} />
                Messages
              </button>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="h-8 w-8 shrink-0 rounded-full text-white/40 hover:text-white hover:bg-white/8 transition flex items-center justify-center"
            >
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div
          ref={scrollRef}
          className={["flex-1 overflow-y-auto px-4 py-4 space-y-1", activeTab === "global" ? "" : "hidden"].join(" ")}
        >
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
                    {group.messages.map((msg, i) => {
                      const canDelete = msg.user_id === myId || canModerate;
                      return (
                        <div key={msg.id} className="flex flex-col mp3-fade-up">
                          <div className={["group/msg flex items-center gap-1", isMe ? "flex-row-reverse" : "flex-row"].join(" ")}>
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
                              {renderMessageContent(msg.content, knownParticipants)}
                            </div>
                            {canDelete && (
                              <button
                                type="button"
                                onClick={() => void deleteMessage(msg.id)}
                                title="Supprimer"
                                aria-label="Supprimer le message"
                                className="opacity-0 group-hover/msg:opacity-100 transition shrink-0 h-6 w-6 rounded-full flex items-center justify-center text-white/25 hover:text-red-400 hover:bg-white/8"
                              >
                                <Trash2 size={12} />
                              </button>
                            )}
                          </div>
                          {i === group.messages.length - 1 && (
                            <p className={["text-[10px] text-white/25 mt-1 px-1", isMe ? "text-right" : "text-left"].join(" ")}>
                              {formatTime(msg.created_at)}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
          {typingNames.length > 0 && (
            <div className="flex items-center gap-2 pt-2 px-1 text-xs text-white/35 mp3-fade-up">
              <span className="flex gap-[3px] items-end" style={{ height: 8 }}>
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="w-[5px] h-[5px] rounded-full bg-white/40"
                    style={{ animation: "mp3TypingDot 1.2s ease-in-out infinite", animationDelay: `${i * 0.18}s` }}
                  />
                ))}
              </span>
              <span className="truncate">
                {typingNames.length === 1
                  ? `${typingNames[0]} écrit…`
                  : `${typingNames.slice(0, 2).join(", ")} écrivent…`}
              </span>
            </div>
          )}
          <div ref={bottomRef} className="h-1" />
        </div>

        {/* Private conversations */}
        <div className={["flex-1 overflow-y-auto px-4 py-4", activeTab === "private" ? "" : "hidden"].join(" ")}>
          {!isAuthenticated ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-center py-16">
              <MessageCircle size={32} className="text-white/12" />
              <p className="text-sm text-white/35">
                <a href="/account" className="underline underline-offset-2 hover:text-white/60 transition">
                  Connecte-toi
                </a>{" "}
                pour voir tes messages.
              </p>
            </div>
          ) : conversationsLoading && !conversationsLoaded ? (
            <div className="space-y-3 pt-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="flex gap-2.5 animate-pulse">
                  <div className="h-9 w-9 shrink-0 rounded-full bg-white/8" />
                  <div className="space-y-1.5 flex-1">
                    <div className="h-2.5 w-24 rounded-full bg-white/8" />
                    <div className="h-2.5 rounded-full bg-white/6 w-3/4" />
                  </div>
                </div>
              ))}
            </div>
          ) : conversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-center py-16">
              <MessageCircle size={32} className="text-white/12" />
              <p className="text-sm text-white/35">Aucune conversation pour le moment.</p>
              <p className="text-xs text-white/20">
                Rends-toi sur le profil de quelqu&apos;un pour lui envoyer un message.
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              {conversations.map((conv, i) => (
                <Link
                  key={conv.userId}
                  href={`/messages/${conv.userId}`}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-3 rounded-2xl px-2 py-2.5 hover:bg-white/5 transition mp3-fade-up"
                  style={{ animationDelay: `${Math.min(i, 12) * 30}ms` }}
                >
                  <div className="relative h-9 w-9 shrink-0 rounded-full overflow-hidden bg-white/8 flex items-center justify-center text-[10px] font-semibold text-white/60">
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
                  <span className="text-[10px] text-white/30 shrink-0">{formatRelative(conv.updatedAt)}</span>
                </Link>
              ))}
              <Link
                href="/messages"
                onClick={() => setOpen(false)}
                className="block mt-2 text-center text-xs text-white/35 hover:text-white/60 transition py-2"
              >
                Voir tous les messages
              </Link>
            </div>
          )}
        </div>

        {/* Input */}
        <div className={["border-t border-white/8 px-4 py-3 shrink-0 pb-[calc(0.75rem+env(safe-area-inset-bottom))]", activeTab === "global" ? "" : "hidden"].join(" ")}>
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
            <div className="relative flex items-end gap-2">
              {mentionMatches.length > 0 && (
                <div className="absolute bottom-full left-0 mb-2 w-48 rounded-2xl border border-white/10 bg-zinc-900/95 backdrop-blur-sm shadow-xl overflow-hidden">
                  {mentionMatches.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => applyMention(p.name)}
                      className="w-full text-left px-3 py-2 text-sm text-white/80 hover:bg-white/8 transition truncate"
                    >
                      @{p.name}
                    </button>
                  ))}
                </div>
              )}
              <textarea
                ref={inputRef}
                value={input}
                onChange={handleInputChange}
                onKeyDown={onKeyDown}
                placeholder="Écrire un message…"
                rows={1}
                maxLength={500}
                disabled={sending}
                className="flex-1 resize-none overflow-hidden rounded-2xl border border-white/10 bg-white/6 px-3.5 py-2.5 text-base sm:text-sm text-white/90 outline-none placeholder:text-white/25 focus:border-white/20 focus:bg-white/8 transition-colors disabled:opacity-50"
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
