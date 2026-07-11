import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { hashStringToHex } from "@/lib/publicLinks";
import { listTracksForApi } from "@/lib/libraryRepository";
import { pushNotification } from "@/lib/notificationData";
import { broadcastToUser } from "@/lib/realtimeBroadcast";

const BUCKET = "account-data";
const MILESTONES = [10, 50, 100, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000];

type TrackPlaysData = { count: number; milestonesNotified: number[] };

function getPath(src: string): string {
  return `track-plays/${hashStringToHex(src)}.json`;
}

function normalize(raw: unknown): TrackPlaysData {
  if (!raw || typeof raw !== "object") return { count: 0, milestonesNotified: [] };
  const value = raw as Record<string, unknown>;

  const count = typeof value.count === "number" && Number.isFinite(value.count) ? Math.max(0, Math.round(value.count)) : 0;
  const milestonesNotified = Array.isArray(value.milestonesNotified)
    ? value.milestonesNotified.filter((n): n is number => typeof n === "number")
    : [];

  return { count, milestonesNotified };
}

async function readTrackPlays(src: string): Promise<TrackPlaysData> {
  const admin = getSupabaseAdmin();
  if (!admin) return { count: 0, milestonesNotified: [] };

  const { data, error } = await admin.client.storage.from(BUCKET).download(getPath(src));
  if (error || !data) return { count: 0, milestonesNotified: [] };

  try {
    return normalize(JSON.parse(await data.text()));
  } catch {
    return { count: 0, milestonesNotified: [] };
  }
}

async function writeTrackPlays(src: string, data: TrackPlaysData): Promise<void> {
  const admin = getSupabaseAdmin();
  if (!admin) return;

  const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
  await admin.client.storage.from(BUCKET).upload(getPath(src), blob, { upsert: true, contentType: "application/json" });
}

/**
 * Bumps a track's durable, cross-user play counter by `delta` and notifies the
 * owner once when a milestone in MILESTONES is newly crossed. Best-effort: any
 * failure here must never break the caller's primary write (stats sync).
 */
export async function bumpTrackPlaysAndNotify(src: string, delta: number): Promise<void> {
  if (delta <= 0) return;

  const current = await readTrackPlays(src);
  const nextCount = current.count + delta;
  const newlyCrossed = MILESTONES.filter(
    (m) => nextCount >= m && current.count < m && !current.milestonesNotified.includes(m)
  );

  await writeTrackPlays(src, {
    count: nextCount,
    milestonesNotified: newlyCrossed.length ? [...current.milestonesNotified, ...newlyCrossed] : current.milestonesNotified,
  });

  if (newlyCrossed.length === 0) return;

  try {
    const tracks = await listTracksForApi();
    const track = tracks.find((t) => t.src === src);
    if (!track?.ownerId) return;

    const milestone = Math.max(...newlyCrossed);
    const ownerName = track.ownerDisplayName || track.ownerEmail || "Toi";

    const notifPayload = {
      type: "track_milestone" as const,
      fromUserId: track.ownerId,
      fromDisplayName: ownerName,
      fromAvatarUrl: "",
      trackTitle: track.title,
      trackSrc: track.src,
      trackCover: track.cover ?? undefined,
      excerpt: String(milestone),
      createdAt: Date.now(),
    };

    await pushNotification(track.ownerId, notifPayload);
    await broadcastToUser(track.ownerId, "new_notification", { ...notifPayload, id: crypto.randomUUID(), read: false });
  } catch {}
}
