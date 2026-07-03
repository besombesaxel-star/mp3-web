import { NextResponse } from "next/server";
import { readAuthenticatedUser } from "@/lib/supabaseAuthServer";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { broadcastToChannel } from "@/lib/realtimeBroadcast";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const BUCKET = "account-data";
const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24h: beyond this, not worth offering a resume prompt

function getPath(userId: string) {
  return `playback-session/${userId}.json`;
}

export async function GET(req: Request) {
  const auth = await readAuthenticatedUser(req);
  if (!auth.user) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ ok: true, session: null });

  const { data, error } = await admin.client.storage.from(BUCKET).download(getPath(auth.user.id));
  if (error || !data) return NextResponse.json({ ok: true, session: null });

  try {
    const json = JSON.parse(await data.text());
    if (!json?.track?.title || !json?.track?.src) return NextResponse.json({ ok: true, session: null });
    if (Date.now() - (json.updatedAt ?? 0) > MAX_AGE_MS) return NextResponse.json({ ok: true, session: null });
    return NextResponse.json({ ok: true, session: json });
  } catch {
    return NextResponse.json({ ok: true, session: null });
  }
}

export async function PUT(req: Request) {
  const auth = await readAuthenticatedUser(req);
  if (!auth.user) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  const body = await req.json().catch(() => null);
  if (!body?.track?.title || !body?.track?.src || !body?.deviceId) {
    return NextResponse.json({ ok: false, error: "track and deviceId required" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ ok: false, error: "No admin" }, { status: 500 });

  const payload = {
    track: {
      title: body.track.title,
      artist: body.track.artist ?? null,
      cover: body.track.cover ?? null,
      src: body.track.src,
    },
    position: typeof body.position === "number" ? body.position : 0,
    duration: typeof body.duration === "number" ? body.duration : 0,
    deviceId: body.deviceId,
    deviceLabel: typeof body.deviceLabel === "string" ? body.deviceLabel : "Appareil",
    updatedAt: Date.now(),
  };

  const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
  await admin.client.storage
    .from(BUCKET)
    .upload(getPath(auth.user.id), blob, { upsert: true, contentType: "application/json" });

  void broadcastToChannel(`user:${auth.user.id}`, "session_update", { session: payload }).catch(() => {});
  if (body.takeover) {
    void broadcastToChannel(`user:${auth.user.id}`, "session_takeover", { deviceId: body.deviceId }).catch(() => {});
  }

  return NextResponse.json({ ok: true });
}
