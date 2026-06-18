import webpush from "web-push";
import { ensureSupabaseAccountBucketReady, getSupabaseAdmin } from "@/lib/supabaseAdmin";

export type StoredPushSubscription = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

const MAX_SUBSCRIPTIONS = 10;

function getSubscriptionsPath(userId: string) {
  return `push-subscriptions/${userId}.json`;
}

function isValidSubscription(value: unknown): value is StoredPushSubscription {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  if (typeof v.endpoint !== "string" || !v.endpoint) return false;
  if (!v.keys || typeof v.keys !== "object") return false;
  const keys = v.keys as Record<string, unknown>;
  return typeof keys.p256dh === "string" && typeof keys.auth === "string";
}

export async function getPushSubscriptions(userId: string): Promise<StoredPushSubscription[]> {
  const admin = getSupabaseAdmin();
  if (!admin) return [];

  const { data, error } = await admin.client.storage.from(admin.accountBucket).download(getSubscriptionsPath(userId));
  if (error || !data) return [];

  try {
    const json = JSON.parse(await data.text());
    return Array.isArray(json) ? json.filter(isValidSubscription) : [];
  } catch {
    return [];
  }
}

async function writeSubscriptions(userId: string, subscriptions: StoredPushSubscription[]) {
  const admin = getSupabaseAdmin();
  if (!admin) return;

  await ensureSupabaseAccountBucketReady(admin.client, admin.accountBucket);
  const blob = new Blob([JSON.stringify(subscriptions)], { type: "application/json" });
  await admin.client.storage
    .from(admin.accountBucket)
    .upload(getSubscriptionsPath(userId), blob, { upsert: true, contentType: "application/json" });
}

export async function addPushSubscription(userId: string, subscription: unknown) {
  if (!isValidSubscription(subscription)) return;

  const current = await getPushSubscriptions(userId);
  const next = [subscription, ...current.filter((s) => s.endpoint !== subscription.endpoint)].slice(
    0,
    MAX_SUBSCRIPTIONS
  );
  await writeSubscriptions(userId, next);
}

export async function removePushSubscription(userId: string, endpoint: string) {
  const current = await getPushSubscriptions(userId);
  const next = current.filter((s) => s.endpoint !== endpoint);
  if (next.length === current.length) return;
  await writeSubscriptions(userId, next);
}

function getVapidConfig() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  if (!publicKey || !privateKey) return null;
  return { publicKey, privateKey };
}

export async function sendPushToUser(
  userId: string,
  payload: { title: string; body: string; url?: string }
): Promise<void> {
  const vapid = getVapidConfig();
  if (!vapid) return;

  const subscriptions = await getPushSubscriptions(userId);
  if (subscriptions.length === 0) return;

  webpush.setVapidDetails("mailto:contact@mp3-web.app", vapid.publicKey, vapid.privateKey);

  const body = JSON.stringify(payload);

  await Promise.all(
    subscriptions.map(async (subscription) => {
      try {
        await webpush.sendNotification(subscription, body);
      } catch (error) {
        const statusCode = (error as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await removePushSubscription(userId, subscription.endpoint);
        }
      }
    })
  );
}
