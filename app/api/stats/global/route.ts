import { NextResponse } from "next/server";
import { readAccountProfile } from "@/lib/accountData";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUCKET = "account-data";
const CACHE_TTL_MS = 5 * 60 * 1000;
const PERIODS = ["all", "week", "month"] as const;
type Period = (typeof PERIODS)[number];

type TrackEntry = {
  src: string;
  title: string;
  artist?: string;
  plays: number;
  seconds: number;
};

type ListenerEntry = {
  userId: string;
  displayName: string;
  avatarUrl: string;
  plays: number;
  seconds: number;
};

type ByTrackValue = {
  title?: string;
  artist?: string;
  plays?: number;
  seconds?: number;
};

type RecentPlay = {
  src?: string;
  playedAt?: number;
};

type StatsFile = {
  userId: string;
  byTrack?: Record<string, ByTrackValue>;
  recentPlays?: RecentPlay[];
};

type CachedResult = { top: TrackEntry[]; listeners: ListenerEntry[]; expiresAt: number };

const cache = new Map<Period, CachedResult>();

function periodCutoffMs(period: Period): number | null {
  if (period === "week") return Date.now() - 7 * 24 * 60 * 60 * 1000;
  if (period === "month") return Date.now() - 30 * 24 * 60 * 60 * 1000;
  return null;
}

function computeTopAllTime(files: StatsFile[]): TrackEntry[] {
  const aggregate = new Map<string, TrackEntry>();

  for (const json of files) {
    const byTrack = json?.byTrack;
    if (!byTrack || typeof byTrack !== "object") continue;

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
  }

  return [...aggregate.values()]
    .filter((e) => e.plays > 0)
    .sort((a, b) => b.plays - a.plays)
    .slice(0, 20);
}

function computeTopForWindow(files: StatsFile[], cutoff: number): TrackEntry[] {
  const aggregate = new Map<string, TrackEntry>();

  for (const json of files) {
    const byTrack = json?.byTrack && typeof json.byTrack === "object" ? json.byTrack : {};
    const recentPlays = Array.isArray(json?.recentPlays) ? json.recentPlays : [];

    for (const play of recentPlays) {
      if (!play || typeof play.src !== "string" || typeof play.playedAt !== "number") continue;
      if (play.playedAt < cutoff) continue;

      const meta = byTrack[play.src];
      const existing = aggregate.get(play.src);
      if (existing) {
        existing.plays += 1;
      } else {
        aggregate.set(play.src, {
          src: play.src,
          title: typeof meta?.title === "string" ? meta.title : play.src,
          artist: typeof meta?.artist === "string" ? meta.artist : undefined,
          plays: 1,
          seconds: 0,
        });
      }
    }
  }

  return [...aggregate.values()]
    .sort((a, b) => b.plays - a.plays)
    .slice(0, 20);
}

function computeListenersAllTime(files: StatsFile[]): Array<{ userId: string; plays: number; seconds: number }> {
  return files
    .map((f) => {
      let plays = 0;
      let seconds = 0;
      for (const entry of Object.values(f.byTrack ?? {})) {
        if (!entry || typeof entry !== "object") continue;
        plays += entry.plays ?? 0;
        seconds += entry.seconds ?? 0;
      }
      return { userId: f.userId, plays, seconds };
    })
    .filter((e) => e.plays > 0)
    .sort((a, b) => b.plays - a.plays)
    .slice(0, 20);
}

function computeListenersForWindow(
  files: StatsFile[],
  cutoff: number
): Array<{ userId: string; plays: number; seconds: number }> {
  return files
    .map((f) => {
      const recentPlays = Array.isArray(f.recentPlays) ? f.recentPlays : [];
      const plays = recentPlays.filter((p) => typeof p?.playedAt === "number" && p.playedAt >= cutoff).length;
      return { userId: f.userId, plays, seconds: 0 };
    })
    .filter((e) => e.plays > 0)
    .sort((a, b) => b.plays - a.plays)
    .slice(0, 20);
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const requested = searchParams.get("period");
  const period: Period = PERIODS.includes(requested as Period) ? (requested as Period) : "all";

  const cached = cache.get(period);
  if (cached && Date.now() < cached.expiresAt) {
    return NextResponse.json({ ok: true, top: cached.top, listeners: cached.listeners, period });
  }

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ ok: true, top: [], listeners: [], period });

  try {
    const { data: files, error } = await admin.client.storage
      .from(BUCKET)
      .list("stats", { limit: 1000 });

    if (error || !files?.length) return NextResponse.json({ ok: true, top: [], listeners: [], period });

    const parsedFiles: StatsFile[] = (
      await Promise.all(
        files.map(async (file) => {
          try {
            const { data, error: dlErr } = await admin.client.storage
              .from(BUCKET)
              .download(`stats/${file.name}`);
            if (dlErr || !data) return null;
            const parsed = JSON.parse(await data.text()) as Omit<StatsFile, "userId">;
            return { ...parsed, userId: file.name.replace(/\.json$/i, "") };
          } catch {
            return null;
          }
        })
      )
    ).filter((v): v is StatsFile => v !== null);

    const cutoff = periodCutoffMs(period);
    const top = cutoff === null ? computeTopAllTime(parsedFiles) : computeTopForWindow(parsedFiles, cutoff);
    const listenerCounts =
      cutoff === null ? computeListenersAllTime(parsedFiles) : computeListenersForWindow(parsedFiles, cutoff);

    const { data: usersData } = await admin.client.auth.admin.listUsers({ perPage: 1000 });
    const usersById = new Map((usersData?.users ?? []).map((u) => [u.id, u]));

    const listeners: ListenerEntry[] = await Promise.all(
      listenerCounts.map(async (entry) => {
        const user = usersById.get(entry.userId);
        const displayName =
          (typeof user?.user_metadata?.display_name === "string" && user.user_metadata.display_name.trim()) ||
          user?.email?.trim() ||
          "Membre mp3";

        const profile = await readAccountProfile(entry.userId).catch(() => null);

        return {
          userId: entry.userId,
          displayName,
          avatarUrl: profile?.avatarUrl ?? "",
          plays: entry.plays,
          seconds: entry.seconds,
        };
      })
    );

    cache.set(period, { top, listeners, expiresAt: Date.now() + CACHE_TTL_MS });

    return NextResponse.json({ ok: true, top, listeners, period });
  } catch {
    return NextResponse.json({ ok: false, top: [], listeners: [], period }, { status: 500 });
  }
}
