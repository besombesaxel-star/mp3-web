import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { checkRateLimit } from "@/lib/rateLimit";
import { DAY_MS, getDayKey } from "@/lib/streak";

const BUCKET = "account-data";
const RETENTION_DAYS = 90;
const DEDUPE_WINDOW_MS = 30 * 60 * 1000;

type ProfileViewsData = { total: number; byDay: Record<string, number> };

function getPath(userId: string): string {
  return `profile-views/${userId}.json`;
}

function normalize(raw: unknown): ProfileViewsData {
  if (!raw || typeof raw !== "object") return { total: 0, byDay: {} };
  const value = raw as Record<string, unknown>;

  const total = typeof value.total === "number" && Number.isFinite(value.total) ? Math.max(0, Math.round(value.total)) : 0;
  const byDayRaw = value.byDay && typeof value.byDay === "object" ? (value.byDay as Record<string, unknown>) : {};
  const byDay: Record<string, number> = {};
  for (const [day, count] of Object.entries(byDayRaw)) {
    if (typeof count === "number" && Number.isFinite(count) && count > 0) byDay[day] = Math.round(count);
  }

  return { total, byDay };
}

function pruneOldDays(byDay: Record<string, number>, now: number): Record<string, number> {
  const cutoffKey = getDayKey(now - RETENTION_DAYS * DAY_MS);
  const out: Record<string, number> = {};
  for (const [day, count] of Object.entries(byDay)) {
    if (day >= cutoffKey) out[day] = count;
  }
  return out;
}

async function readProfileViews(userId: string): Promise<ProfileViewsData> {
  const admin = getSupabaseAdmin();
  if (!admin) return { total: 0, byDay: {} };

  const { data, error } = await admin.client.storage.from(BUCKET).download(getPath(userId));
  if (error || !data) return { total: 0, byDay: {} };

  try {
    return normalize(JSON.parse(await data.text()));
  } catch {
    return { total: 0, byDay: {} };
  }
}

async function writeProfileViews(userId: string, data: ProfileViewsData): Promise<void> {
  const admin = getSupabaseAdmin();
  if (!admin) return;

  const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
  await admin.client.storage.from(BUCKET).upload(getPath(userId), blob, { upsert: true, contentType: "application/json" });
}

/**
 * Best-effort profile view counter, mirroring lib/trackPlays.ts: skips the
 * owner viewing their own profile, and de-dupes a signed-in viewer within a
 * 30-minute window via the shared in-memory rate limiter. Anonymous viewers
 * have no stable identity to key on, so they're never de-duped — this is an
 * approximate counter (like most link-in-bio view counts), not tamper-proof
 * analytics.
 */
export async function bumpProfileView(targetUserId: string, viewerId: string | null): Promise<void> {
  if (!targetUserId || viewerId === targetUserId) return;

  if (viewerId) {
    const result = checkRateLimit(`profile-view:${targetUserId}:${viewerId}`, 1, DEDUPE_WINDOW_MS);
    if (!result.allowed) return;
  }

  try {
    const current = await readProfileViews(targetUserId);
    const now = Date.now();
    const today = getDayKey(now);
    const byDay = pruneOldDays(current.byDay, now);
    byDay[today] = (byDay[today] ?? 0) + 1;

    await writeProfileViews(targetUserId, { total: current.total + 1, byDay });
  } catch {}
}

export async function getProfileViewStats(userId: string): Promise<{ total: number; last7Days: number }> {
  const data = await readProfileViews(userId);
  const now = Date.now();

  let last7Days = 0;
  for (let i = 0; i < 7; i += 1) {
    last7Days += data.byDay[getDayKey(now - i * DAY_MS)] ?? 0;
  }

  return { total: data.total, last7Days };
}
