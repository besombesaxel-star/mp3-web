import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export type ActivityEventType =
  | "sign_in"
  | "password_changed"
  | "sign_out_others"
  | "device_forgotten"
  | "profile_privacy_changed";

export type ActivityEvent = {
  id: string;
  type: ActivityEventType;
  createdAt: number;
  meta?: string;
};

const BUCKET = "account-data";
const MAX_EVENTS = 100;

function getPath(userId: string) {
  return `activity/${userId}.json`;
}

export async function readActivityLog(userId: string): Promise<ActivityEvent[]> {
  const admin = getSupabaseAdmin();
  if (!admin) return [];

  const { data, error } = await admin.client.storage.from(BUCKET).download(getPath(userId));
  if (error || !data) return [];

  try {
    const json = JSON.parse(await data.text());
    return Array.isArray(json) ? (json as ActivityEvent[]) : [];
  } catch {
    return [];
  }
}

export async function logActivity(userId: string, type: ActivityEventType, meta?: string): Promise<void> {
  const admin = getSupabaseAdmin();
  if (!admin) return;

  const current = await readActivityLog(userId);
  const event: ActivityEvent = { id: crypto.randomUUID(), type, createdAt: Date.now(), meta };
  const updated = [event, ...current].slice(0, MAX_EVENTS);

  const blob = new Blob([JSON.stringify(updated)], { type: "application/json" });
  await admin.client.storage
    .from(BUCKET)
    .upload(getPath(userId), blob, { upsert: true, contentType: "application/json" });
}
