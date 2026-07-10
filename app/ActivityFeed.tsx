"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { MessageCircle, Play, Upload, UserPlus } from "lucide-react";
import { getSupabaseBrowserAuthClient } from "@/lib/supabaseAuth";
import { getPublicProfileHref } from "@/lib/publicLinks";
import { usePlayer } from "./PlayerContext";

type ActivityEvent = {
  id: string;
  type: "follow" | "upload" | "comment";
  actorUserId: string;
  actorDisplayName: string;
  actorAvatarUrl: string;
  targetUserId?: string;
  trackTitle?: string;
  trackSrc?: string;
  trackCover?: string | null;
  createdAt: number;
};

const MAX_EVENTS = 12;

function formatRelativeTime(ts: number) {
  const diffMs = Date.now() - ts;
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "a l'instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `il y a ${hours}h`;
  const days = Math.floor(hours / 24);
  return `il y a ${days}j`;
}

export default function ActivityFeed() {
  const { setQueueAndPlay } = usePlayer();
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [targetNames, setTargetNames] = useState<Record<string, string>>({});
  const seenIds = useRef(new Set<string>());

  useEffect(() => {
    let cancelled = false;
    fetch("/api/activity-feed", { cache: "no-store" })
      .then((r) => r.json())
      .then((json: { ok?: boolean; events?: ActivityEvent[] }) => {
        if (cancelled || !Array.isArray(json.events)) return;
        for (const e of json.events) seenIds.current.add(e.id);
        setEvents(json.events);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const client = getSupabaseBrowserAuthClient();
    if (!client) return;

    const channel = client
      .channel("global-activity")
      .on("broadcast", { event: "new_event" }, ({ payload }) => {
        const event = payload as ActivityEvent;
        if (!event?.id || seenIds.current.has(event.id)) return;
        seenIds.current.add(event.id);
        setEvents((prev) => [event, ...prev].slice(0, MAX_EVENTS));
      })
      .subscribe();

    return () => {
      void client.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    const missing = [...new Set(events.filter((e) => e.type === "follow" && e.targetUserId).map((e) => e.targetUserId as string))].filter(
      (id) => !(id in targetNames)
    );
    if (missing.length === 0) return;

    missing.forEach((id) => {
      fetch(`/api/public/users/${encodeURIComponent(id)}`, { cache: "no-store" })
        .then((r) => r.json())
        .then((json: { ok?: boolean; profile?: { displayName?: string } }) => {
          setTargetNames((prev) => ({ ...prev, [id]: json.profile?.displayName ?? "quelqu'un" }));
        })
        .catch(() => setTargetNames((prev) => ({ ...prev, [id]: "quelqu'un" })));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events]);

  const visibleEvents = events.slice(0, MAX_EVENTS);

  if (!loading && visibleEvents.length === 0) return null;

  return (
    <section className="mb-12">
      <div className="flex items-end justify-between mb-6 mp3-fade-up">
        <h3 className="text-2xl font-light">Activite recente</h3>
      </div>

      <div className="rounded-3xl border border-white/8 bg-white/[0.03] divide-y divide-white/6">
        {loading ? (
          <div className="p-5 space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="h-9 w-9 shrink-0 rounded-full bg-white/5 animate-pulse" />
                <div className="h-3 w-2/3 rounded-full bg-white/5 animate-pulse" />
              </div>
            ))}
          </div>
        ) : (
          visibleEvents.map((event) => {
            const icon =
              event.type === "follow" ? (
                <UserPlus size={13} className="text-sky-300" />
              ) : event.type === "upload" ? (
                <Upload size={13} className="text-emerald-300" />
              ) : (
                <MessageCircle size={13} className="text-violet-300" />
              );

            const canPlay = (event.type === "upload" || event.type === "comment") && event.trackSrc;

            return (
              <div key={event.id} className="flex items-center gap-3 px-5 py-3.5">
                <Link href={getPublicProfileHref(event.actorUserId)} className="relative shrink-0">
                  <div className="relative h-9 w-9 rounded-full overflow-hidden bg-white/10 flex items-center justify-center text-[10px] font-semibold text-white/60">
                    {event.actorAvatarUrl ? (
                      <Image src={event.actorAvatarUrl} alt="" fill className="object-cover" sizes="36px" />
                    ) : (
                      event.actorDisplayName.slice(0, 2).toUpperCase()
                    )}
                  </div>
                  <span className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full bg-[#0d0d11] border border-white/10 flex items-center justify-center">
                    {icon}
                  </span>
                </Link>

                <div className="min-w-0 flex-1">
                  <p className="text-sm text-white/80 truncate">
                    <Link href={getPublicProfileHref(event.actorUserId)} className="font-medium text-white/90 hover:underline">
                      {event.actorDisplayName}
                    </Link>{" "}
                    {event.type === "follow" ? (
                      <>
                        a commence a suivre{" "}
                        {event.targetUserId ? (
                          <Link href={getPublicProfileHref(event.targetUserId)} className="hover:underline">
                            {targetNames[event.targetUserId] ?? "quelqu'un"}
                          </Link>
                        ) : (
                          "quelqu'un"
                        )}
                      </>
                    ) : event.type === "upload" ? (
                      <>
                        a ajoute <span className="text-white/90">{event.trackTitle}</span>
                      </>
                    ) : (
                      <>
                        a commente <span className="text-white/90">{event.trackTitle}</span>
                      </>
                    )}
                  </p>
                  <p className="text-xs text-white/25 mt-0.5">{formatRelativeTime(event.createdAt)}</p>
                </div>

                {canPlay && (
                  <button
                    type="button"
                    onClick={() =>
                      setQueueAndPlay(
                        [{ title: event.trackTitle ?? "", src: event.trackSrc as string, cover: event.trackCover ?? undefined }],
                        0
                      )
                    }
                    className="shrink-0 h-9 w-9 rounded-full overflow-hidden bg-white/5 flex items-center justify-center relative group"
                    aria-label={`Ecouter ${event.trackTitle}`}
                  >
                    {event.trackCover ? (
                      <Image src={event.trackCover} alt="" fill className="object-cover" sizes="36px" />
                    ) : null}
                    <span className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition">
                      <Play size={12} className="fill-white text-white" />
                    </span>
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
