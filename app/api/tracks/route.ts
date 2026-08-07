import { NextResponse } from "next/server";
import { deleteTrackForApi, getLibraryBackendMode, isValidTrackSrc, listTracksForApi } from "@/lib/libraryRepository";
import { readAuthenticatedUser, readOptionalAuthenticatedUser } from "@/lib/supabaseAuthServer";
import { unexpectedErrorResponse } from "@/lib/apiError";
import { trackMatchesQuery } from "@/lib/trackSearch";
import type { LibraryTrack } from "@/lib/libraryTypes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const MAX_LIMIT = 200;

/**
 * limit/offset/q/ownerIds are all optional and additive: a request with
 * none of them behaves exactly as before (the full catalog, unpaginated) so
 * every existing caller that needs the whole list for its own aggregation
 * (artist/user grouping, duplicate detection, upload dedup-check, feed
 * following-filter) keeps working untouched. Paginated/filtered callers are
 * new, opt-in call sites.
 */
export async function GET(req: Request) {
  try {
  const allTracks = await listTracksForApi();
  const viewer = await readOptionalAuthenticatedUser(req);
  const viewerId = viewer?.id ?? null;

  const visibleTracks = allTracks.filter((t) => !t.private || t.ownerId === viewerId);

  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim() ?? "";
  const artist = url.searchParams.get("artist")?.trim() ?? "";
  const ownerIdsParam = url.searchParams.get("ownerIds")?.trim() ?? "";
  const ownerIds = ownerIdsParam ? new Set(ownerIdsParam.split(",").filter(Boolean)) : null;
  const limitParam = url.searchParams.get("limit");
  const offsetParam = url.searchParams.get("offset");
  const paginated = limitParam !== null || offsetParam !== null || q || artist || ownerIds;

  let filtered: LibraryTrack[] = visibleTracks;
  if (q) filtered = filtered.filter((t) => trackMatchesQuery(t.title, t.artist, q));
  if (artist) filtered = filtered.filter((t) => t.artist?.trim() === artist);
  if (ownerIds) filtered = filtered.filter((t) => t.ownerId && ownerIds.has(t.ownerId));

  const offset = Math.max(0, Number(offsetParam) || 0);
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(limitParam) || MAX_LIMIT));
  const page = paginated ? filtered.slice(offset, offset + limit) : filtered;

  return NextResponse.json(
    {
      storage: getLibraryBackendMode(),
      total: filtered.length,
      hasMore: paginated ? offset + page.length < filtered.length : false,
      tracks: page.map((track) => ({
        title: track.title,
        artist: track.artist,
        src: track.src,
        cover: track.cover,
        isLegacyShared: (track.backend === "supabase" || track.backend === "r2") && !track.ownerId,
        isOwnedByViewer: Boolean(viewerId && track.ownerId && track.ownerId === viewerId),
        ownerDisplayName: track.ownerDisplayName ?? null,
        ownerId: track.ownerId ?? null,
        ownerLabel: track.ownerDisplayName ?? track.ownerEmail ?? null,
        credits: track.credits ?? null,
        private: Boolean(track.private),
      })),
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      },
    }
  );
  } catch {
    return unexpectedErrorResponse();
  }
}

export async function DELETE(req: Request) {
  try {
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
  } catch {
    return unexpectedErrorResponse();
  }
}
