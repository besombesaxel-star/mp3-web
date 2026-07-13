import { NextResponse } from "next/server";
import { readAuthenticatedUser } from "@/lib/supabaseAuthServer";
import { addCollaborator, readSharedPlaylist, removeCollaborator } from "@/lib/sharedPlaylists";
import { readAccountProfile } from "@/lib/accountData";
import { pushNotification } from "@/lib/notificationData";
import { broadcastToUser } from "@/lib/realtimeBroadcast";
import { checkRateLimit } from "@/lib/rateLimit";
import { unexpectedErrorResponse } from "@/lib/apiError";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const INVITE_LIMIT = 20;
const INVITE_WINDOW_MS = 10 * 60 * 1000;

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  try {
  const auth = await readAuthenticatedUser(req);
  if (!auth.user) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }
  const currentUser = auth.user;

  const rateLimit = checkRateLimit(`playlist-invite:${currentUser.id}`, INVITE_LIMIT, INVITE_WINDOW_MS);
  if (!rateLimit.allowed) {
    return NextResponse.json({ ok: false, error: "Trop d'invitations recentes, reessaie dans quelques minutes." }, { status: 429 });
  }

  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  const targetUserId = typeof body?.userId === "string" ? body.userId.trim() : "";

  if (!targetUserId) {
    return NextResponse.json({ ok: false, error: "Identifiant utilisateur manquant" }, { status: 400 });
  }
  if (targetUserId === currentUser.id) {
    return NextResponse.json({ ok: false, error: "Tu ne peux pas t'inviter toi-meme" }, { status: 400 });
  }

  const result = await addCollaborator(id, targetUserId, currentUser.id);
  if (result === "not_found") {
    return NextResponse.json({ ok: false, error: "Playlist introuvable" }, { status: 404 });
  }
  if (result === "forbidden") {
    return NextResponse.json({ ok: false, error: "Seul le proprietaire peut inviter" }, { status: 403 });
  }
  if (result === "full") {
    return NextResponse.json({ ok: false, error: "Nombre maximum de contributeurs atteint" }, { status: 400 });
  }

  const playlist = await readSharedPlaylist(id);

  void (async () => {
    try {
      const rawName = currentUser.user_metadata?.display_name;
      const fromDisplayName =
        typeof rawName === "string" && rawName.trim() ? rawName.trim() : (currentUser.email?.trim() ?? "Quelqu'un");
      const profile = await readAccountProfile(currentUser.id).catch(() => null);

      const notifPayload = {
        type: "playlist_invite" as const,
        fromUserId: currentUser.id,
        fromDisplayName,
        fromAvatarUrl: profile?.avatarUrl ?? "",
        playlistId: id,
        playlistName: playlist?.name ?? "Playlist",
        createdAt: Date.now(),
      };
      await pushNotification(targetUserId, notifPayload);
      await broadcastToUser(targetUserId, "new_notification", { ...notifPayload, id: crypto.randomUUID(), read: false });
    } catch {}
  })();

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
  const body = await req.json().catch(() => null);
  const targetUserId = typeof body?.userId === "string" ? body.userId.trim() : "";

  if (!targetUserId) {
    return NextResponse.json({ ok: false, error: "Identifiant utilisateur manquant" }, { status: 400 });
  }

  const result = await removeCollaborator(id, targetUserId, auth.user.id);
  if (result === "not_found") {
    return NextResponse.json({ ok: false, error: "Playlist introuvable" }, { status: 404 });
  }
  if (result === "forbidden") {
    return NextResponse.json({ ok: false, error: "Action non autorisee" }, { status: 403 });
  }

  const playlist = await readSharedPlaylist(id);
  return NextResponse.json({ ok: true, playlist });
  } catch {
    return unexpectedErrorResponse();
  }
}
