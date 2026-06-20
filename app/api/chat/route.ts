import { NextResponse } from "next/server";
import { getSupabaseAdmin, ensureSupabaseAccountBucketReady } from "@/lib/supabaseAdmin";
import { readAuthenticatedUser } from "@/lib/supabaseAuthServer";
import { readAccountProfile } from "@/lib/accountData";
import { isAdminUser } from "@/lib/adminAccess";
import { pushNotification } from "@/lib/notificationData";
import { broadcastToUser } from "@/lib/realtimeBroadcast";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const CHAT_PATH = "chat/history.json";
const MAX_MESSAGES = 100;
const MAX_CONTENT = 500;
const MIN_INTERVAL_MS = 1200;

const lastMessageAtByUser = new Map<string, number>();

export type ChatMessage = {
  id: string;
  user_id: string;
  display_name: string;
  avatar_url: string;
  content: string;
  created_at: string;
};

async function readHistory(admin: NonNullable<ReturnType<typeof getSupabaseAdmin>>): Promise<ChatMessage[]> {
  const { data, error } = await admin.client.storage
    .from(admin.accountBucket)
    .download(CHAT_PATH);

  if (error) return [];

  try {
    const text = data instanceof Blob ? await data.text() : "";
    const json = JSON.parse(text);
    return Array.isArray(json) ? json : [];
  } catch {
    return [];
  }
}

async function resolveMentions(
  content: string,
  admin: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  excludeUserId: string
): Promise<Array<{ id: string; displayName: string }>> {
  const { data, error } = await admin.client.auth.admin.listUsers({ perPage: 1000 });
  if (error || !data?.users) return [];

  const lowerContent = content.toLowerCase();

  const candidates = data.users
    .filter((u) => u.id !== excludeUserId)
    .map((u) => {
      const name =
        (u.user_metadata?.display_name as string | undefined)?.trim() || u.email?.trim() || "";
      return { id: u.id, displayName: name };
    })
    .filter((u) => u.displayName)
    .sort((a, b) => b.displayName.length - a.displayName.length);

  const matchedRanges: Array<[number, number]> = [];
  const mentioned: Array<{ id: string; displayName: string }> = [];

  for (const candidate of candidates) {
    const needle = `@${candidate.displayName.toLowerCase()}`;
    let searchFrom = 0;
    while (true) {
      const idx = lowerContent.indexOf(needle, searchFrom);
      if (idx === -1) break;
      const overlaps = matchedRanges.some(([s, e]) => idx < e && idx + needle.length > s);
      if (!overlaps) {
        matchedRanges.push([idx, idx + needle.length]);
        mentioned.push(candidate);
      }
      searchFrom = idx + needle.length;
    }
  }

  return mentioned;
}

async function saveHistory(admin: NonNullable<ReturnType<typeof getSupabaseAdmin>>, messages: ChatMessage[]) {
  await ensureSupabaseAccountBucketReady(admin.client, admin.accountBucket);
  const { error } = await admin.client.storage
    .from(admin.accountBucket)
    .upload(CHAT_PATH, JSON.stringify(messages.slice(-MAX_MESSAGES)), {
      contentType: "application/json",
      cacheControl: "0",
      upsert: true,
    });
  if (error) throw error;
}

export async function GET() {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ ok: false, error: "Non configure" }, { status: 503 });

  const messages = await readHistory(admin);
  return NextResponse.json({ ok: true, messages });
}

export async function POST(req: Request) {
  const auth = await readAuthenticatedUser(req);
  if (!auth.user) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  const lastSentAt = lastMessageAtByUser.get(auth.user.id) ?? 0;
  const now = Date.now();
  if (now - lastSentAt < MIN_INTERVAL_MS) {
    return NextResponse.json({ ok: false, error: "Tu envoies trop vite, patiente un instant." }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  const content = typeof body?.content === "string" ? body.content.trim().slice(0, MAX_CONTENT) : "";
  if (!content) return NextResponse.json({ ok: false, error: "Message vide" }, { status: 400 });

  lastMessageAtByUser.set(auth.user.id, now);

  const rawName = auth.user.user_metadata?.display_name;
  const displayName =
    typeof rawName === "string" && rawName.trim() ? rawName.trim() : (auth.user.email?.trim() ?? "Anonyme");

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ ok: false, error: "Non configure" }, { status: 503 });

  const profile = await readAccountProfile(auth.user.id).catch(() => null);

  const message: ChatMessage = {
    id: crypto.randomUUID(),
    user_id: auth.user.id,
    display_name: displayName,
    avatar_url: profile?.avatarUrl ?? "",
    content,
    created_at: new Date().toISOString(),
  };

  const history = await readHistory(admin);
  await saveHistory(admin, [...history, message]);

  const mentioned = await resolveMentions(content, admin, auth.user.id).catch(() => []);
  for (const target of mentioned) {
    const notifPayload = {
      type: "mention" as const,
      fromUserId: auth.user.id,
      fromDisplayName: displayName,
      fromAvatarUrl: profile?.avatarUrl ?? "",
      excerpt: content.slice(0, 140),
      createdAt: Date.now(),
    };
    void pushNotification(target.id, notifPayload).catch(() => {});
    void broadcastToUser(target.id, "new_notification", { ...notifPayload, id: crypto.randomUUID(), read: false }).catch(() => {});
  }

  return NextResponse.json({ ok: true, message });
}

export async function DELETE(req: Request) {
  const auth = await readAuthenticatedUser(req);
  if (!auth.user) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  const body = await req.json().catch(() => null);
  const id = typeof body?.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ ok: false, error: "Message invalide" }, { status: 400 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ ok: false, error: "Non configure" }, { status: 503 });

  const history = await readHistory(admin);
  const target = history.find((m) => m.id === id);
  if (!target) return NextResponse.json({ ok: false, error: "Message introuvable" }, { status: 404 });

  if (target.user_id !== auth.user.id && !isAdminUser(auth.user.id)) {
    return NextResponse.json({ ok: false, error: "Action non autorisee" }, { status: 403 });
  }

  await saveHistory(admin, history.filter((m) => m.id !== id));
  return NextResponse.json({ ok: true });
}
