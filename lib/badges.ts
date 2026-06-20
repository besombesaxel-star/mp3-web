import { ensureSupabaseAccountBucketReady, getSupabaseAdmin } from "@/lib/supabaseAdmin";

export type BadgeKey = "admin" | "co-founder" | "early-member";

export const BADGE_LABELS: Record<BadgeKey, string> = {
  admin: "Admin",
  "co-founder": "Co-Founder",
  "early-member": "Early Member",
};

// Badges an admin can grant/revoke by hand via /admin/badges.
// "early-member" is computed automatically from account creation order instead.
export const MANUAL_BADGE_KEYS: BadgeKey[] = ["admin", "co-founder"];

const BADGE_KEYS: BadgeKey[] = ["admin", "co-founder", "early-member"];
const BADGES_PATH = "badges/assignments.json";
const EARLY_MEMBER_COUNT = 10;

const DEFAULT_ASSIGNMENTS: Record<string, BadgeKey[]> = {
  "b793a3a7-45f8-4711-90b9-a1f0ac5fb8b9": ["admin"],
  "3de5eafa-673f-4f05-b925-a84cf31c1ecb": ["co-founder"],
};

function isBadgeKey(value: unknown): value is BadgeKey {
  return typeof value === "string" && BADGE_KEYS.includes(value as BadgeKey);
}

function normalizeAssignments(value: unknown): Record<string, BadgeKey[]> {
  if (!value || typeof value !== "object") return {};
  const out: Record<string, BadgeKey[]> = {};

  for (const [userId, badges] of Object.entries(value as Record<string, unknown>)) {
    if (!userId || !Array.isArray(badges)) continue;
    const valid = [...new Set(badges.filter(isBadgeKey))];
    if (valid.length > 0) out[userId] = valid;
  }

  return out;
}

export async function getAllBadgeAssignments(): Promise<Record<string, BadgeKey[]>> {
  const admin = getSupabaseAdmin();
  if (!admin) return DEFAULT_ASSIGNMENTS;

  const { data, error } = await admin.client.storage.from(admin.accountBucket).download(BADGES_PATH);
  if (error || !data) return DEFAULT_ASSIGNMENTS;

  try {
    return normalizeAssignments(JSON.parse(await data.text()));
  } catch {
    return DEFAULT_ASSIGNMENTS;
  }
}

export async function setBadgesForUser(userId: string, badges: BadgeKey[]): Promise<void> {
  const admin = getSupabaseAdmin();
  if (!admin) return;

  const current = await getAllBadgeAssignments();
  const valid = [...new Set(badges.filter(isBadgeKey))];

  const next = { ...current };
  if (valid.length > 0) next[userId] = valid;
  else delete next[userId];

  await ensureSupabaseAccountBucketReady(admin.client, admin.accountBucket);
  const blob = new Blob([JSON.stringify(next)], { type: "application/json" });
  await admin.client.storage
    .from(admin.accountBucket)
    .upload(BADGES_PATH, blob, { upsert: true, contentType: "application/json" });
}

async function getEarlyMemberIds(): Promise<Set<string>> {
  const admin = getSupabaseAdmin();
  if (!admin) return new Set();

  const { data, error } = await admin.client.auth.admin.listUsers({ perPage: 1000 });
  if (error || !data?.users) return new Set();

  const sorted = [...data.users].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  return new Set(sorted.slice(0, EARLY_MEMBER_COUNT).map((u) => u.id));
}

export async function getBadgesForUser(userId: string): Promise<BadgeKey[]> {
  const [all, earlyMemberIds] = await Promise.all([getAllBadgeAssignments(), getEarlyMemberIds()]);
  const badges = new Set(all[userId] ?? []);
  if (earlyMemberIds.has(userId)) badges.add("early-member");
  return [...badges];
}
