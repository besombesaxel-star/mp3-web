import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { broadcastToChannel } from "@/lib/realtimeBroadcast";
import { getDayKey } from "@/lib/streak";

export type ActivityEvent = {
  id: string;
  type: "follow" | "upload" | "comment";
  actorUserId: string;
  actorDisplayName: string;
  actorAvatarUrl: string;
  targetUserId?: string;
  targetDisplayName?: string;
  trackTitle?: string;
  trackSrc?: string;
  trackCover?: string | null;
  createdAt: number;
};

const BUCKET = "account-data";
const MAX_PER_DAY = 300;
const BROADCAST_CHANNEL = "global-activity";
const DAY_MS = 24 * 60 * 60 * 1000;

function getShardPath(dayKey: string) {
  return `activity-feed/${dayKey}.json`;
}

function isActivityEvent(value: unknown): value is ActivityEvent {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof (value as ActivityEvent).id === "string" &&
      typeof (value as ActivityEvent).type === "string" &&
      typeof (value as ActivityEvent).createdAt === "number"
  );
}

async function readShard(dayKey: string): Promise<ActivityEvent[]> {
  const admin = getSupabaseAdmin();
  if (!admin) return [];

  const { data, error } = await admin.client.storage.from(BUCKET).download(getShardPath(dayKey));
  if (error || !data) return [];

  try {
    const parsed = JSON.parse(await data.text());
    return Array.isArray(parsed) ? parsed.filter(isActivityEvent) : [];
  } catch {
    return [];
  }
}

export async function pushActivityEvent(event: Omit<ActivityEvent, "id">): Promise<void> {
  const admin = getSupabaseAdmin();
  if (!admin) return;

  const dayKey = getDayKey(event.createdAt);
  const current = await readShard(dayKey);
  const newEvent: ActivityEvent = { ...event, id: crypto.randomUUID() };
  const updated = [newEvent, ...current].slice(0, MAX_PER_DAY);

  const blob = new Blob([JSON.stringify(updated)], { type: "application/json" });
  await admin.client.storage
    .from(BUCKET)
    .upload(getShardPath(dayKey), blob, { upsert: true, contentType: "application/json" });

  void broadcastToChannel(BROADCAST_CHANNEL, "new_event", newEvent);
}

export async function readRecentActivity(limit = 30): Promise<ActivityEvent[]> {
  const now = Date.now();
  const todayKey = getDayKey(now);
  const yesterdayKey = getDayKey(now - DAY_MS);

  const [today, yesterday] = await Promise.all([readShard(todayKey), readShard(yesterdayKey)]);
  return [...today, ...yesterday].sort((a, b) => b.createdAt - a.createdAt).slice(0, limit);
}
