import { NextResponse } from "next/server";
import { addCommentToTrack, deleteCommentFromTrack, getCommentsForTrack } from "@/lib/comments";
import { isAdminUser } from "@/lib/adminAccess";
import { isValidTrackSrc, listTracksForApi } from "@/lib/libraryRepository";
import { readAccountProfile } from "@/lib/accountData";
import { readAuthenticatedUser } from "@/lib/supabaseAuthServer";
import { pushNotification } from "@/lib/notificationData";
import { broadcastToUser } from "@/lib/realtimeBroadcast";
import { checkRateLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const COMMENT_LIMIT = 20;
const COMMENT_WINDOW_MS = 60 * 1000;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const src = searchParams.get("src") ?? "";
  if (!src || !isValidTrackSrc(src)) {
    return NextResponse.json({ ok: false, error: "src invalide" }, { status: 400 });
  }

  const comments = await getCommentsForTrack(src);
  return NextResponse.json({ ok: true, comments });
}

export async function POST(req: Request) {
  const auth = await readAuthenticatedUser(req);
  if (!auth.user) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  const rateLimit = checkRateLimit(`comment:${auth.user.id}`, COMMENT_LIMIT, COMMENT_WINDOW_MS);
  if (!rateLimit.allowed) {
    return NextResponse.json({ ok: false, error: "Trop de commentaires, patiente un instant." }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  const src = typeof body?.src === "string" ? body.src : "";
  const content = typeof body?.content === "string" ? body.content.trim() : "";

  if (!src || !isValidTrackSrc(src)) {
    return NextResponse.json({ ok: false, error: "src invalide" }, { status: 400 });
  }
  if (!content) {
    return NextResponse.json({ ok: false, error: "Commentaire vide" }, { status: 400 });
  }

  const rawName = auth.user.user_metadata?.display_name;
  const displayName =
    typeof rawName === "string" && rawName.trim() ? rawName.trim() : (auth.user.email?.trim() ?? "Anonyme");
  const profile = await readAccountProfile(auth.user.id).catch(() => null);

  const userId = auth.user.id;

  const comment = await addCommentToTrack(src, {
    userId,
    displayName,
    avatarUrl: profile?.avatarUrl ?? "",
    content,
  });

  if (!comment) {
    return NextResponse.json({ ok: false, error: "Impossible d'ajouter le commentaire" }, { status: 500 });
  }

  void (async () => {
    try {
      const tracks = await listTracksForApi();
      const track = tracks.find((t) => t.src === src);
      if (!track?.ownerId || track.ownerId === userId) return;

      const notifPayload = {
        type: "comment" as const,
        fromUserId: userId,
        fromDisplayName: displayName,
        fromAvatarUrl: profile?.avatarUrl ?? "",
        trackTitle: track.title,
        excerpt: content.slice(0, 140),
        createdAt: Date.now(),
      };
      await pushNotification(track.ownerId, notifPayload);
      await broadcastToUser(track.ownerId, "new_notification", { ...notifPayload, id: crypto.randomUUID(), read: false });
    } catch {}
  })();

  return NextResponse.json({ ok: true, comment });
}

export async function DELETE(req: Request) {
  const auth = await readAuthenticatedUser(req);
  if (!auth.user) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  const body = await req.json().catch(() => null);
  const src = typeof body?.src === "string" ? body.src : "";
  const id = typeof body?.id === "string" ? body.id : "";

  if (!src || !isValidTrackSrc(src) || !id) {
    return NextResponse.json({ ok: false, error: "Requete invalide" }, { status: 400 });
  }

  const result = await deleteCommentFromTrack(src, id, auth.user.id, isAdminUser(auth.user.id));
  if (result === "forbidden") {
    return NextResponse.json({ ok: false, error: "Action non autorisee" }, { status: 403 });
  }
  if (result === "not_found") {
    return NextResponse.json({ ok: false, error: "Commentaire introuvable" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
