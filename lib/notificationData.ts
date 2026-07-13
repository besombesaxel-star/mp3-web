import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { sendPushToUser } from "@/lib/pushSubscriptions";

export type AppNotification = {
  id: string;
  type:
    | "follow"
    | "upload"
    | "reaction"
    | "mention"
    | "queue_suggestion"
    | "message"
    | "comment"
    | "playlist_invite"
    | "track_milestone"
    | "guestbook";
  fromUserId: string;
  fromDisplayName: string;
  fromAvatarUrl: string;
  trackTitle?: string;
  trackSrc?: string;
  trackCover?: string;
  emoji?: string;
  excerpt?: string;
  playlistId?: string;
  playlistName?: string;
  createdAt: number;
  read: boolean;
};

const MAX_NOTIFS = 50;
const BUCKET = "account-data";

function getNotifPath(userId: string) {
  return `notifications/${userId}.json`;
}

export async function readNotifications(userId: string): Promise<AppNotification[]> {
  const admin = getSupabaseAdmin();
  if (!admin) return [];

  const { data, error } = await admin.client.storage.from(BUCKET).download(getNotifPath(userId));
  if (error || !data) return [];

  try {
    const json = JSON.parse(await data.text());
    return Array.isArray(json) ? (json as AppNotification[]) : [];
  } catch {
    return [];
  }
}

export async function pushNotification(
  userId: string,
  notif: Omit<AppNotification, "id" | "read">
): Promise<void> {
  const admin = getSupabaseAdmin();
  if (!admin) return;

  const current = await readNotifications(userId);
  const newNotif: AppNotification = { ...notif, id: crypto.randomUUID(), read: false };
  const updated = [newNotif, ...current].slice(0, MAX_NOTIFS);

  const blob = new Blob([JSON.stringify(updated)], { type: "application/json" });
  await admin.client.storage
    .from(BUCKET)
    .upload(getNotifPath(userId), blob, { upsert: true, contentType: "application/json" });

  const pushBody =
    notif.type === "follow"
      ? `${notif.fromDisplayName} a commence a vous suivre`
      : notif.type === "reaction"
        ? `${notif.fromDisplayName} a reagi ${notif.emoji ?? ""} a votre ecoute`
        : notif.type === "mention"
          ? `${notif.fromDisplayName} vous a mentionne dans le chat`
          : notif.type === "queue_suggestion"
            ? `${notif.fromDisplayName} vous a suggere "${notif.trackTitle}"`
            : notif.type === "message"
              ? `${notif.fromDisplayName} vous a envoye un message`
              : notif.type === "comment"
                ? `${notif.fromDisplayName} a commente "${notif.trackTitle}"`
                : notif.type === "playlist_invite"
                  ? `${notif.fromDisplayName} vous a invite sur la playlist "${notif.playlistName}"`
                  : notif.type === "track_milestone"
                    ? `"${notif.trackTitle}" a depasse ${notif.excerpt} ecoutes !`
                    : notif.type === "guestbook"
                      ? `${notif.fromDisplayName} a laisse un mot sur votre profil`
                      : `${notif.fromDisplayName} a partage "${notif.trackTitle}"`;

  void sendPushToUser(userId, {
    title: ".mp3",
    body: pushBody,
    url:
      notif.type === "upload" || notif.type === "track_milestone"
        ? "/library"
        : notif.type === "message"
          ? `/messages/${notif.fromUserId}`
          : notif.type === "playlist_invite"
            ? "/playlists"
            : `/users/${notif.fromUserId}`,
  });
}

export async function notifyAllUsersOfUpload(params: {
  uploaderUserId: string;
  uploaderDisplayName: string;
  uploaderAvatarUrl: string;
  trackTitle: string;
  trackSrc: string;
  trackCover: string | null;
}): Promise<void> {
  const admin = getSupabaseAdmin();
  if (!admin) return;

  const { data, error } = await admin.client.auth.admin.listUsers({ perPage: 1000 });
  if (error || !data?.users) return;

  const createdAt = Date.now();
  const targets = data.users.filter((u) => u.id !== params.uploaderUserId);

  await Promise.all(
    targets.map((u) =>
      pushNotification(u.id, {
        type: "upload",
        fromUserId: params.uploaderUserId,
        fromDisplayName: params.uploaderDisplayName,
        fromAvatarUrl: params.uploaderAvatarUrl,
        trackTitle: params.trackTitle,
        trackSrc: params.trackSrc,
        trackCover: params.trackCover ?? undefined,
        createdAt,
      })
    )
  );
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  const admin = getSupabaseAdmin();
  if (!admin) return;

  const current = await readNotifications(userId);
  if (current.every((n) => n.read)) return;

  const updated = current.map((n) => ({ ...n, read: true }));
  const blob = new Blob([JSON.stringify(updated)], { type: "application/json" });
  await admin.client.storage
    .from(BUCKET)
    .upload(getNotifPath(userId), blob, { upsert: true, contentType: "application/json" });
}
