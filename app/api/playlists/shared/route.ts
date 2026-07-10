import { NextResponse } from "next/server";
import { readAuthenticatedUser } from "@/lib/supabaseAuthServer";
import { createSharedPlaylist, listSharedPlaylistsForUser } from "@/lib/sharedPlaylists";
import { checkRateLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CREATE_LIMIT = 20;
const CREATE_WINDOW_MS = 10 * 60 * 1000;

export async function GET(req: Request) {
  const auth = await readAuthenticatedUser(req);
  if (!auth.user) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  const playlists = await listSharedPlaylistsForUser(auth.user.id);
  return NextResponse.json({ ok: true, playlists });
}

export async function POST(req: Request) {
  const auth = await readAuthenticatedUser(req);
  if (!auth.user) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  const rateLimit = checkRateLimit(`shared-playlist-create:${auth.user.id}`, CREATE_LIMIT, CREATE_WINDOW_MS);
  if (!rateLimit.allowed) {
    return NextResponse.json({ ok: false, error: "Trop de creations recentes, reessaie dans quelques minutes." }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json({ ok: false, error: "Le nom ne peut pas etre vide." }, { status: 400 });
  }

  const playlist = await createSharedPlaylist(auth.user.id, name);
  return NextResponse.json({ ok: true, playlist });
}
