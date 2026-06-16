"use client";

import Image from "next/image";
import Link from "next/link";
import { Bell } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/app/AuthProvider";
import { createAuthorizedHeaders } from "@/lib/clientAuth";
import { getSupabaseBrowserAuthClient } from "@/lib/supabaseAuth";

type AppNotification = {
  id: string;
  type: "follow" | "upload";
  fromUserId: string;
  fromDisplayName: string;
  fromAvatarUrl: string;
  trackTitle?: string;
  trackSrc?: string;
  createdAt: number;
  read: boolean;
};

function NotifRow({ notif, onClose }: { notif: AppNotification; onClose: () => void }) {
  const initials = (notif.fromDisplayName || "?").slice(0, 2).toUpperCase();
  const dateLabel = new Date(notif.createdAt).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
  });

  return (
    <div className={`flex items-start gap-3 px-4 py-3 ${!notif.read ? "bg-white/5" : ""}`}>
      <Link href={`/users/${notif.fromUserId}`} onClick={onClose} className="shrink-0 mt-0.5">
        <div className="w-8 h-8 rounded-full overflow-hidden bg-white/10 flex items-center justify-center text-xs font-semibold text-white/60">
          {notif.fromAvatarUrl ? (
            <Image
              src={notif.fromAvatarUrl}
              alt={initials}
              width={32}
              height={32}
              className="object-cover w-full h-full"
            />
          ) : (
            initials
          )}
        </div>
      </Link>

      <div className="flex-1 min-w-0">
        <p className="text-sm text-white/75 leading-snug">
          <Link
            href={`/users/${notif.fromUserId}`}
            onClick={onClose}
            className="font-semibold text-white/90 hover:underline"
          >
            {notif.fromDisplayName}
          </Link>{" "}
          {notif.type === "follow" ? (
            "a commencé à vous suivre"
          ) : (
            <>
              a uploadé{" "}
              <span className="font-medium text-white/90">{notif.trackTitle}</span>
            </>
          )}
        </p>
        <p className="text-xs text-white/30 mt-0.5">{dateLabel}</p>
      </div>

      {!notif.read && (
        <span className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0 mt-1.5" />
      )}
    </div>
  );
}

export default function NotificationBell() {
  const { accessToken, isAuthenticated, user } = useAuth();
  const [open, setOpen] = useState(false);
  const [notifs, setNotifs] = useState<AppNotification[]>([]);
  const [loaded, setLoaded] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const unread = notifs.filter((n) => !n.read).length;

  // Realtime: listen for new notifications via Supabase Broadcast
  useEffect(() => {
    if (!isAuthenticated || !user?.id) return;
    const supabase = getSupabaseBrowserAuthClient();
    if (!supabase) return;

    const channel = supabase
      .channel(`user:${user.id}`)
      .on("broadcast", { event: "new_notification" }, ({ payload }) => {
        const notif = payload as AppNotification;
        setNotifs((prev) => {
          if (prev.some((n) => n.id === notif.id)) return prev;
          return [notif, ...prev];
        });
      })
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [isAuthenticated, user?.id]);

  useEffect(() => {
    if (!isAuthenticated || !accessToken) return;
    fetch("/api/notifications", {
      cache: "no-store",
      headers: createAuthorizedHeaders(accessToken),
    })
      .then((r) => r.json())
      .then((data: { notifications?: AppNotification[] }) => {
        setNotifs(Array.isArray(data.notifications) ? data.notifications : []);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [isAuthenticated, accessToken]);

  useEffect(() => {
    if (!open || !isAuthenticated || !accessToken || unread === 0) return;
    fetch("/api/notifications", {
      method: "PUT",
      headers: createAuthorizedHeaders(accessToken),
    })
      .then(() => setNotifs((prev) => prev.map((n) => ({ ...n, read: true }))))
      .catch(() => {});
  }, [open, isAuthenticated, accessToken, unread]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  if (!isAuthenticated) return null;

  return (
    <div
      ref={panelRef}
      className="fixed top-[11px] right-[6.75rem] z-[55] md:top-4 md:right-16"
    >
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Notifications"
        className="relative w-9 h-9 md:w-10 md:h-10 flex items-center justify-center rounded-full border border-white/15 bg-black/70 backdrop-blur text-white/70 hover:text-white hover:border-white/30 hover:bg-white/10 transition shadow-lg"
      >
        <Bell size={15} />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-4 flex items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white px-0.5 leading-none">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute top-11 right-0 w-[320px] max-h-[440px] overflow-y-auto rounded-2xl bg-zinc-900/95 border border-white/10 shadow-2xl backdrop-blur-sm">
          <div className="px-4 py-3 border-b border-white/10">
            <h3 className="text-sm font-semibold text-white/90">Notifications</h3>
          </div>

          {!loaded ? (
            <div className="py-10 text-center text-white/35 text-sm">Chargement…</div>
          ) : notifs.length === 0 ? (
            <div className="py-10 text-center text-white/35 text-sm">Aucune notification</div>
          ) : (
            <div className="divide-y divide-white/5">
              {notifs.map((n) => (
                <NotifRow key={n.id} notif={n} onClose={() => setOpen(false)} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
