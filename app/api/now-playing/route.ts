import { NextResponse } from "next/server";
import { readAuthenticatedUser } from "@/lib/supabaseAuthServer";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { broadcastToChannel } from "@/lib/realtimeBroadcast";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const BUCKET = "account-data";
const STALE_MS = 10 * 60 * 1000; // 10 min

function getPath(userId: string) {
  return `now-playing/${userId}.json`;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const userId = url.searchParams.get("userId");
  if (!userId) return NextResponse.json({ ok: true, nowPlaying: null });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ ok: true, nowPlaying: null });

  const { data, error } = await admin.client.storage.from(BUCKET).download(getPath(userId));
  if (error || !data) return NextResponse.json({ ok: true, nowPlaying: null });

  try {
    const json = JSON.parse(await data.text());
    if (!json?.title || !json?.src) return NextResponse.json({ ok: true, nowPlaying: null });
    if (Date.now() - (json.updatedAt ?? 0) > STALE_MS) return NextResponse.json({ ok: true, nowPlaying: null });
    return NextResponse.json({ ok: true, nowPlaying: json });
  } catch {
    return NextResponse.json({ ok: true, nowPlaying: null });
  }
}

export async function POST(req: Request) {
  const auth = await readAuthenticatedUser(req);
  if (!auth.user) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  const body = await req.json().catch(() => null);
  if (!body?.title || !body?.src) {
    return NextResponse.json({ ok: false, error: "title and src required" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ ok: false, error: "No admin" }, { status: 500 });

  const payload = {
    title: body.title,
    artist: body.artist ?? null,
    cover: body.cover ?? null,
    src: body.src,
    updatedAt: Date.now(),
  };

  const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
  await admin.client.storage
    .from(BUCKET)
    .upload(getPath(auth.user.id), blob, { upsert: true, contentType: "application/json" });

  void broadcastToChannel(`user:${auth.user.id}:np`, "now_playing", { track: payload }).catch(() => {});

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const auth = await readAuthenticatedUser(req);
  if (!auth.user) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ ok: false, error: "No admin" }, { status: 500 });

  await admin.client.storage.from(BUCKET).remove([getPath(auth.user.id)]);
  void broadcastToChannel(`user:${auth.user.id}:np`, "now_playing", { track: null }).catch(() => {});
  return NextResponse.json({ ok: true });
}
