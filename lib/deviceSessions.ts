import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export type DeviceSession = {
  deviceId: string;
  deviceLabel: string;
  firstSeenAt: number;
  lastActiveAt: number;
};

const BUCKET = "account-data";
const MAX_SESSIONS = 20;
const STALE_MS = 90 * 24 * 60 * 60 * 1000; // prune entries not seen in 90 days

function getPath(userId: string) {
  return `sessions/${userId}.json`;
}

export async function listDeviceSessions(userId: string): Promise<DeviceSession[]> {
  const admin = getSupabaseAdmin();
  if (!admin) return [];

  const { data, error } = await admin.client.storage.from(BUCKET).download(getPath(userId));
  if (error || !data) return [];

  try {
    const json = JSON.parse(await data.text());
    return Array.isArray(json) ? (json as DeviceSession[]) : [];
  } catch {
    return [];
  }
}

async function saveDeviceSessions(userId: string, sessions: DeviceSession[]) {
  const admin = getSupabaseAdmin();
  if (!admin) return;

  const blob = new Blob([JSON.stringify(sessions)], { type: "application/json" });
  await admin.client.storage
    .from(BUCKET)
    .upload(getPath(userId), blob, { upsert: true, contentType: "application/json" });
}

export async function touchDeviceSession(
  userId: string,
  deviceId: string,
  deviceLabel: string
): Promise<DeviceSession[]> {
  const now = Date.now();
  const cutoff = now - STALE_MS;
  const pruned = (await listDeviceSessions(userId)).filter((s) => s.lastActiveAt >= cutoff);

  const existingIdx = pruned.findIndex((s) => s.deviceId === deviceId);
  if (existingIdx >= 0) {
    pruned[existingIdx] = { ...pruned[existingIdx], deviceLabel, lastActiveAt: now };
  } else {
    pruned.push({ deviceId, deviceLabel, firstSeenAt: now, lastActiveAt: now });
  }

  pruned.sort((a, b) => b.lastActiveAt - a.lastActiveAt);
  const trimmed = pruned.slice(0, MAX_SESSIONS);
  await saveDeviceSessions(userId, trimmed);
  return trimmed;
}

export async function forgetDeviceSession(userId: string, deviceId: string): Promise<DeviceSession[]> {
  const next = (await listDeviceSessions(userId)).filter((s) => s.deviceId !== deviceId);
  await saveDeviceSessions(userId, next);
  return next;
}
