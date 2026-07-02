import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUCKET = "account-data";

type TrackEntry = {
  src: string;
  title: string;
  artist?: string;
  plays: number;
  seconds: number;
};

type ByTrackValue = {
  title?: string;
  artist?: string;
  plays?: number;
  seconds?: number;
};

let cachedTop: TrackEntry[] | null = null;
let cacheExpiresAt = 0;

export async function GET() {
  if (cachedTop && Date.now() < cacheExpiresAt) {
    return NextResponse.json({ ok: true, top: cachedTop });
  }

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ ok: true, top: [] });

  try {
    const { data: files, error } = await admin.client.storage
      .from(BUCKET)
      .list("stats", { limit: 1000 });

    if (error || !files?.length) return NextResponse.json({ ok: true, top: [] });

    const aggregate = new Map<string, TrackEntry>();

    await Promise.all(
      files.map(async (file) => {
        try {
          const { data, error: dlErr } = await admin.client.storage
            .from(BUCKET)
            .download(`stats/${file.name}`);
          if (dlErr || !data) return;

          const json = JSON.parse(await data.text()) as {
            byTrack?: Record<string, ByTrackValue>;
          };
          const byTrack = json?.byTrack;
          if (!byTrack || typeof byTrack !== "object") return;

          for (const [src, entry] of Object.entries(byTrack)) {
            if (!src || typeof entry !== "object" || !entry) continue;
            const plays = entry.plays ?? 0;
            const seconds = entry.seconds ?? 0;
            const existing = aggregate.get(src);
            if (existing) {
              existing.plays += plays;
              existing.seconds += seconds;
            } else {
              aggregate.set(src, {
                src,
                title: typeof entry.title === "string" ? entry.title : src,
                artist: typeof entry.artist === "string" ? entry.artist : undefined,
                plays,
                seconds,
              });
            }
          }
        } catch {}
      })
    );

    const top = [...aggregate.values()]
      .filter((e) => e.plays > 0)
      .sort((a, b) => b.plays - a.plays)
      .slice(0, 20);

    cachedTop = top;
    cacheExpiresAt = Date.now() + 5 * 60 * 1000;

    return NextResponse.json({ ok: true, top });
  } catch {
    return NextResponse.json({ ok: false, top: [] });
  }
}
