import { NextResponse } from "next/server";
import { getSupabaseAdmin, ensureSupabaseAccountBucketReady } from "@/lib/supabaseAdmin";
import { readAuthenticatedUser } from "@/lib/supabaseAuthServer";
import { readAccountProfile } from "@/lib/accountData";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const CHAT_PATH = "chat/history.json";
const MAX_MESSAGES = 100;
const MAX_CONTENT = 500;

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

  const body = await req.json().catch(() => null);
  const content = typeof body?.content === "string" ? body.content.trim().slice(0, MAX_CONTENT) : "";
  if (!content) return NextResponse.json({ ok: false, error: "Message vide" }, { status: 400 });

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

  return NextResponse.json({ ok: true, message });
}
