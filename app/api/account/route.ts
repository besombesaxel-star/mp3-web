import { NextResponse } from "next/server";
import { readAccountProfile, saveAccountProfile, type AccountPlaylist, type EqGains, type EqPreset, type ProfileLink } from "@/lib/accountData";
import { logActivity } from "@/lib/activityLog";
import { isAchievementId } from "@/lib/cosmetics";

const EQ_PRESETS: EqPreset[] = ["off", "bass", "vocal", "night", "custom"];
import { listTracksForApi } from "@/lib/libraryRepository";
import { readAuthenticatedUser } from "@/lib/supabaseAuthServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function serializeTrack(track: Awaited<ReturnType<typeof listTracksForApi>>[number]) {
  return {
    artist: track.artist,
    cover: track.cover,
    createdAt: track.createdAt,
    ownerDisplayName: track.ownerDisplayName ?? null,
    ownerId: track.ownerId ?? null,
    src: track.src,
    title: track.title,
  };
}

export async function GET(req: Request) {
  const auth = await readAuthenticatedUser(req);
  if (!auth.user) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }
  const user = auth.user;

  const [profile, tracks] = await Promise.all([readAccountProfile(user.id), listTracksForApi()]);
  const trackBySrc = new Map(tracks.map((t) => [t.src, t]));
  const favoriteTracks = profile.favoriteSrcs
    .map((src) => trackBySrc.get(src))
    .filter((t): t is Awaited<ReturnType<typeof listTracksForApi>>[number] => Boolean(t));
  const uploads = tracks.filter((t) => t.ownerId === user.id);
  const pinnedTracks = profile.pinnedTrackSrcs
    .map((src) => trackBySrc.get(src))
    .filter((t): t is Awaited<ReturnType<typeof listTracksForApi>>[number] => Boolean(t));

  return NextResponse.json({
    ok: true,
    avatarFrame: profile.avatarFrame ?? null,
    avatarUrl: profile.avatarUrl ?? "",
    customEqGains: profile.customEqGains ?? null,
    eqPreset: profile.eqPreset ?? null,
    favoriteSrcs: profile.favoriteSrcs,
    favoriteTracks: favoriteTracks.map(serializeTrack),
    followersCount: profile.followersCount ?? 0,
    following: profile.following ?? [],
    links: profile.links ?? [],
    pinnedTrackSrcs: profile.pinnedTrackSrcs ?? [],
    pinnedTracks: pinnedTracks.map(serializeTrack),
    playlists: profile.playlists ?? [],
    publicBio: profile.publicBio,
    themeHue: profile.themeHue ?? null,
    isPrivate: Boolean(profile.isPrivate),
    uploads: uploads.map(serializeTrack),
    uploadsCount: uploads.length,
  });
}

export async function PUT(req: Request) {
  const auth = await readAuthenticatedUser(req);
  if (!auth.user) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }
  const user = auth.user;

  const body = await req.json().catch(() => null);
  const favoriteSrcs = Array.isArray(body?.favoriteSrcs)
    ? body.favoriteSrcs.filter((v: unknown): v is string => typeof v === "string")
    : undefined;
  const publicBio = typeof body?.publicBio === "string" ? body.publicBio : undefined;
  const avatarUrl = typeof body?.avatarUrl === "string" ? body.avatarUrl : undefined;
  const links = Array.isArray(body?.links) ? (body.links as ProfileLink[]) : undefined;
  const pinnedTrackSrcs = Array.isArray(body?.pinnedTrackSrcs)
    ? body.pinnedTrackSrcs.filter((v: unknown): v is string => typeof v === "string")
    : undefined;
  const playlists = Array.isArray(body?.playlists) ? (body.playlists as AccountPlaylist[]) : undefined;
  const eqPreset =
    body?.eqPreset === null
      ? null
      : typeof body?.eqPreset === "string" && EQ_PRESETS.includes(body.eqPreset as EqPreset)
        ? (body.eqPreset as EqPreset)
        : undefined;
  const customEqGains =
    body?.customEqGains === null
      ? null
      : Array.isArray(body?.customEqGains) && body.customEqGains.length === 5
        ? (body.customEqGains as EqGains)
        : undefined;
  const themeHue = body?.themeHue === null ? null : typeof body?.themeHue === "number" ? body.themeHue : undefined;
  const isPrivate = typeof body?.isPrivate === "boolean" ? body.isPrivate : undefined;
  const avatarFrame =
    body?.avatarFrame === null ? null : isAchievementId(body?.avatarFrame) ? body.avatarFrame : undefined;

  if (
    [favoriteSrcs, publicBio, avatarUrl, links, pinnedTrackSrcs, playlists, eqPreset, customEqGains, themeHue, isPrivate, avatarFrame].every(
      (v) => v === undefined
    )
  ) {
    return NextResponse.json({ ok: false, error: "Aucune mise a jour fournie" }, { status: 400 });
  }

  await saveAccountProfile(user.id, {
    avatarFrame,
    avatarUrl,
    customEqGains,
    eqPreset,
    favoriteSrcs,
    links,
    pinnedTrackSrcs,
    playlists,
    publicBio,
    themeHue,
    isPrivate,
  });

  if (isPrivate !== undefined) {
    void logActivity(user.id, "profile_privacy_changed", isPrivate ? "prive" : "public").catch(() => {});
  }

  return NextResponse.json({ ok: true });
}
