import { NextResponse } from "next/server";
import { deleteTrackForApi, getLibraryBackendMode, isValidTrackSrc, listTracksForApi } from "@/lib/libraryRepository";
import { readAuthenticatedUser, readOptionalAuthenticatedUser } from "@/lib/supabaseAuthServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request) {
  const tracks = await listTracksForApi();
  const viewer = await readOptionalAuthenticatedUser(req);
  const viewerId = viewer?.id ?? null;

  return NextResponse.json(
    {
      storage: getLibraryBackendMode(),
      tracks: tracks.map((track) => ({
        title: track.title,
        artist: track.artist,
        src: track.src,
        cover: track.cover,
        isLegacyShared: track.backend === "supabase" && !track.ownerId,
        isOwnedByViewer: Boolean(viewerId && track.ownerId && track.ownerId === viewerId),
        ownerDisplayName: track.ownerDisplayName ?? null,
        ownerId: track.ownerId ?? null,
        ownerLabel: track.ownerDisplayName ?? track.ownerEmail ?? null,
      })),
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      },
    }
  );
}

export async function DELETE(req: Request) {
  const auth = await readAuthenticatedUser(req);
  if (!auth.user) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  const body = await req.json().catch(() => null);
  const src = body?.src;

  if (typeof src !== "string" || !isValidTrackSrc(src)) {
    return NextResponse.json({ ok: false, error: "src invalide" }, { status: 400 });
  }

  const result = await deleteTrackForApi(src, auth.user.id);
  if (result === "forbidden") {
    return NextResponse.json({ ok: false, error: "Seul le proprietaire peut supprimer ce son" }, { status: 403 });
  }

  if (result === "unsupported") {
    return NextResponse.json({ ok: false, error: "Suppression non disponible pour cette source" }, { status: 400 });
  }

  if (result !== "ok") {
    return NextResponse.json({ ok: false, error: "Track introuvable" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
