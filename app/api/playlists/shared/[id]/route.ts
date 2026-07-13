import { NextResponse } from "next/server";
import { readAuthenticatedUser } from "@/lib/supabaseAuthServer";
import { deleteSharedPlaylist, readSharedPlaylist, updateSharedPlaylist } from "@/lib/sharedPlaylists";
import { unexpectedErrorResponse } from "@/lib/apiError";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

function isMember(playlist: { ownerId: string; collaboratorIds: string[] }, userId: string) {
  return playlist.ownerId === userId || playlist.collaboratorIds.includes(userId);
}

export async function GET(req: Request, ctx: Ctx) {
  try {
  const auth = await readAuthenticatedUser(req);
  if (!auth.user) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  const { id } = await ctx.params;
  const playlist = await readSharedPlaylist(id);
  if (!playlist || !isMember(playlist, auth.user.id)) {
    return NextResponse.json({ ok: false, error: "Playlist introuvable" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, playlist });
  } catch {
    return unexpectedErrorResponse();
  }
}

export async function PATCH(req: Request, ctx: Ctx) {
  try {
  const auth = await readAuthenticatedUser(req);
  if (!auth.user) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name : undefined;
  const trackSrcs = Array.isArray(body?.trackSrcs)
    ? body.trackSrcs.filter((v: unknown): v is string => typeof v === "string")
    : undefined;

  if (name === undefined && trackSrcs === undefined) {
    return NextResponse.json({ ok: false, error: "Aucune mise a jour fournie" }, { status: 400 });
  }

  const result = await updateSharedPlaylist(id, { name, trackSrcs }, auth.user.id);
  if (result === "not_found") {
    return NextResponse.json({ ok: false, error: "Playlist introuvable" }, { status: 404 });
  }
  if (result === "forbidden") {
    return NextResponse.json({ ok: false, error: "Tu dois etre membre de cette playlist" }, { status: 403 });
  }

  const playlist = await readSharedPlaylist(id);
  return NextResponse.json({ ok: true, playlist });
  } catch {
    return unexpectedErrorResponse();
  }
}

export async function DELETE(req: Request, ctx: Ctx) {
  try {
  const auth = await readAuthenticatedUser(req);
  if (!auth.user) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  const { id } = await ctx.params;
  const result = await deleteSharedPlaylist(id, auth.user.id);
  if (result === "not_found") {
    return NextResponse.json({ ok: false, error: "Playlist introuvable" }, { status: 404 });
  }
  if (result === "forbidden") {
    return NextResponse.json({ ok: false, error: "Seul le proprietaire peut supprimer cette playlist" }, { status: 403 });
  }

  return NextResponse.json({ ok: true });
  } catch {
    return unexpectedErrorResponse();
  }
}
