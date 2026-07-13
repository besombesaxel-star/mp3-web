import { NextResponse } from "next/server";
import { readAuthenticatedUser } from "@/lib/supabaseAuthServer";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { bumpTrackPlaysAndNotify } from "@/lib/trackPlays";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const BUCKET = "account-data";

function getPath(userId: string) {
  return `stats/${userId}.json`;
}

export async function GET(req: Request) {
  const auth = await readAuthenticatedUser(req);
  if (!auth.user) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ ok: false, stats: null }, { status: 503 });

  const { data, error } = await admin.client.storage.from(BUCKET).download(getPath(auth.user.id));
  if (error || !data) return NextResponse.json({ ok: true, stats: null });

  try {
    const stats = JSON.parse(await data.text());
    return NextResponse.json({ ok: true, stats });
  } catch {
    return NextResponse.json({ ok: true, stats: null });
  }
}

export async function PUT(req: Request) {
  const auth = await readAuthenticatedUser(req);
  if (!auth.user) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ ok: false, error: "No body" }, { status: 400 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ ok: false, error: "No admin" }, { status: 500 });

  const { data: previousData } = await admin.client.storage.from(BUCKET).download(getPath(auth.user.id));

  const blob = new Blob([JSON.stringify(body)], { type: "application/json" });
  await admin.client.storage
    .from(BUCKET)
    .upload(getPath(auth.user.id), blob, { upsert: true, contentType: "application/json" });

  void (async () => {
    try {
      const previous = previousData ? JSON.parse(await previousData.text()) : null;
      const previousByTrack = previous?.byTrack && typeof previous.byTrack === "object" ? previous.byTrack : {};
      const nextByTrack = body?.byTrack && typeof body.byTrack === "object" ? body.byTrack : {};

      await Promise.all(
        Object.entries(nextByTrack as Record<string, { plays?: unknown }>).map(([src, entry]) => {
          const nextPlays = typeof entry?.plays === "number" && Number.isFinite(entry.plays) ? entry.plays : 0;
          const prevPlays =
            typeof previousByTrack[src]?.plays === "number" && Number.isFinite(previousByTrack[src].plays)
              ? previousByTrack[src].plays
              : 0;
          const delta = Math.round(nextPlays) - Math.round(prevPlays);
          if (delta <= 0) return Promise.resolve();
          return bumpTrackPlaysAndNotify(src, delta).catch(() => {});
        })
      );
    } catch {}
  })();

  return NextResponse.json({ ok: true });
}
