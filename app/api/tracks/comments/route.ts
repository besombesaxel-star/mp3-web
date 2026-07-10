import { NextResponse } from "next/server";
import { isValidTrackSrc, listTracksForApi } from "@/lib/libraryRepository";
import { readAuthenticatedUser } from "@/lib/supabaseAuthServer";
import { readAccountProfile } from "@/lib/accountData";
import { addTrackComment, deleteTrackComment, readTrackComments } from "@/lib/trackComments";
import { pushNotification } from "@/lib/notificationData";
import { broadcastToUser } from "@/lib/realtimeBroadcast";
import { isAdminUser } from "@/lib/adminAccess";
import { checkRateLimit } from "@/lib/rateLimit";
import { pushActivityEvent } from "@/lib/activityFeed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COMMENT_LIMIT = 20;
const COMMENT_WINDOW_MS = 10 * 60 * 1000;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const src = searchParams.get("src") ?? "";

  if (!isValidTrackSrc(src)) {
    return NextResponse.json({ ok: false, error: "src invalide" }, { status: 400 });
  }

  const data = await readTrackComments(src);
  return NextResponse.json({ ok: true, comments: data.comments, reactions: data.reactions });
}

export async function POST(req: Request) {
  const auth = await readAuthenticatedUser(req);
  if (!auth.user) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }
  const currentUser = auth.user;

  const rateLimit = checkRateLimit(`comment:${currentUser.id}`, COMMENT_LIMIT, COMMENT_WINDOW_MS);
  if (!rateLimit.allowed) {
    return NextResponse.json({ ok: false, error: "Trop de commentaires recents, reessaie dans quelques minutes." }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  const src = typeof body?.src === "string" ? body.src : "";
  const text = typeof body?.text === "string" ? body.text.trim() : "";

  if (!isValidTrackSrc(src)) {
    return NextResponse.json({ ok: false, error: "src invalide" }, { status: 400 });
  }
  if (!text) {
    return NextResponse.json({ ok: false, error: "Le commentaire ne peut pas etre vide." }, { status: 400 });
  }

  const rawName = currentUser.user_metadata?.display_name;
  const fromDisplayName =
    typeof rawName === "string" && rawName.trim() ? rawName.trim() : (currentUser.email?.trim() ?? "Quelqu'un");
  const profile = await readAccountProfile(currentUser.id).catch(() => null);

  const comment = await addTrackComment(src, {
    userId: currentUser.id,
    displayName: fromDisplayName,
    avatarUrl: profile?.avatarUrl ?? "",
    text,
  });

  void (async () => {
    try {
      const tracks = await listTracksForApi();
      const track = tracks.find((t) => t.src === src);
      if (!track) return;

      if (track.ownerId && track.ownerId !== currentUser.id) {
        const notifPayload = {
          type: "comment" as const,
          fromUserId: currentUser.id,
          fromDisplayName,
          fromAvatarUrl: profile?.avatarUrl ?? "",
          trackTitle: track.title,
          trackSrc: src,
          excerpt: comment.text.slice(0, 140),
          createdAt: comment.createdAt,
        };
        await pushNotification(track.ownerId, notifPayload);
        await broadcastToUser(track.ownerId, "new_notification", { ...notifPayload, id: crypto.randomUUID(), read: false });
      }

      await pushActivityEvent({
        type: "comment",
        actorUserId: currentUser.id,
        actorDisplayName: fromDisplayName,
        actorAvatarUrl: profile?.avatarUrl ?? "",
        trackTitle: track.title,
        trackSrc: src,
        trackCover: track.cover ?? null,
        createdAt: comment.createdAt,
      });
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
  const commentId = typeof body?.commentId === "string" ? body.commentId : "";

  if (!isValidTrackSrc(src) || !commentId) {
    return NextResponse.json({ ok: false, error: "Requete invalide" }, { status: 400 });
  }

  const result = await deleteTrackComment(src, commentId, auth.user.id, isAdminUser(auth.user.id));
  if (result === "forbidden") {
    return NextResponse.json({ ok: false, error: "Seul l'auteur peut supprimer ce commentaire" }, { status: 403 });
  }
  if (result === "not_found") {
    return NextResponse.json({ ok: false, error: "Commentaire introuvable" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
