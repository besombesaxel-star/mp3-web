import { NextResponse } from "next/server";
import { readAccountProfile, saveAccountProfile } from "@/lib/accountData";
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
  const trackBySrc = new Map(tracks.map((track) => [track.src, track]));
  const favoriteTracks = profile.favoriteSrcs
    .map((src) => trackBySrc.get(src))
    .filter((track): track is Awaited<ReturnType<typeof listTracksForApi>>[number] => Boolean(track));
  const uploads = tracks.filter((track) => track.ownerId === user.id);

  return NextResponse.json({
    ok: true,
    favoriteSrcs: profile.favoriteSrcs,
    favoriteTracks: favoriteTracks.map((track) => serializeTrack(track)),
    publicBio: profile.publicBio,
    uploads: uploads.map((track) => serializeTrack(track)),
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
    ? body.favoriteSrcs.filter((value: unknown): value is string => typeof value === "string")
    : undefined;
  const publicBio = typeof body?.publicBio === "string" ? body.publicBio : undefined;

  if (favoriteSrcs === undefined && publicBio === undefined) {
    return NextResponse.json({ ok: false, error: "Aucune mise a jour fournie" }, { status: 400 });
  }

  await saveAccountProfile(user.id, {
    favoriteSrcs,
    publicBio,
  });
  return NextResponse.json({ ok: true });
}
