import { NextResponse } from "next/server";
import { readAccountProfile } from "@/lib/accountData";
import { addGuestbookEntry, deleteGuestbookEntry, readGuestbook } from "@/lib/profileGuestbook";
import { pushNotification } from "@/lib/notificationData";
import { broadcastToUser } from "@/lib/realtimeBroadcast";
import { isAdminUser } from "@/lib/adminAccess";
import { checkRateLimit } from "@/lib/rateLimit";
import { readAuthenticatedUser, readOptionalAuthenticatedUser } from "@/lib/supabaseAuthServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ENTRY_LIMIT = 10;
const ENTRY_WINDOW_MS = 10 * 60 * 1000;

export async function GET(
  req: Request,
  context: { params: Promise<{ userId: string }> }
) {
  const { userId } = await context.params;
  const viewer = await readOptionalAuthenticatedUser(req);

  const targetProfile = await readAccountProfile(userId).catch(() => null);
  if (targetProfile?.isPrivate && viewer?.id !== userId) {
    return NextResponse.json({ ok: true, entries: [] });
  }

  const data = await readGuestbook(userId);
  return NextResponse.json({ ok: true, entries: data.entries });
}

export async function POST(
  req: Request,
  context: { params: Promise<{ userId: string }> }
) {
  const { userId } = await context.params;

  const auth = await readAuthenticatedUser(req);
  if (!auth.user) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }
  const currentUser = auth.user;

  const rateLimit = checkRateLimit(`guestbook:${currentUser.id}`, ENTRY_LIMIT, ENTRY_WINDOW_MS);
  if (!rateLimit.allowed) {
    return NextResponse.json({ ok: false, error: "Trop de messages recents, reessaie dans quelques minutes." }, { status: 429 });
  }

  const targetProfile = await readAccountProfile(userId).catch(() => null);
  if (targetProfile?.isPrivate && currentUser.id !== userId) {
    return NextResponse.json({ ok: false, error: "Ce profil est prive." }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text) {
    return NextResponse.json({ ok: false, error: "Le message ne peut pas etre vide." }, { status: 400 });
  }

  const rawName = currentUser.user_metadata?.display_name;
  const fromDisplayName =
    typeof rawName === "string" && rawName.trim() ? rawName.trim() : (currentUser.email?.trim() ?? "Quelqu'un");
  const authorProfile = await readAccountProfile(currentUser.id).catch(() => null);

  const entry = await addGuestbookEntry(userId, {
    authorId: currentUser.id,
    authorDisplayName: fromDisplayName,
    authorAvatarUrl: authorProfile?.avatarUrl ?? "",
    text,
  });

  if (userId !== currentUser.id) {
    void (async () => {
      try {
        const notifPayload = {
          type: "guestbook" as const,
          fromUserId: currentUser.id,
          fromDisplayName,
          fromAvatarUrl: authorProfile?.avatarUrl ?? "",
          excerpt: entry.text.slice(0, 140),
          createdAt: entry.createdAt,
        };
        await pushNotification(userId, notifPayload);
        await broadcastToUser(userId, "new_notification", { ...notifPayload, id: crypto.randomUUID(), read: false });
      } catch {}
    })();
  }

  return NextResponse.json({ ok: true, entry });
}

export async function DELETE(
  req: Request,
  context: { params: Promise<{ userId: string }> }
) {
  const { userId } = await context.params;

  const auth = await readAuthenticatedUser(req);
  if (!auth.user) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  const body = await req.json().catch(() => null);
  const entryId = typeof body?.entryId === "string" ? body.entryId : "";
  if (!entryId) {
    return NextResponse.json({ ok: false, error: "Requete invalide" }, { status: 400 });
  }

  const result = await deleteGuestbookEntry(userId, entryId, auth.user.id, isAdminUser(auth.user.id));
  if (result === "forbidden") {
    return NextResponse.json({ ok: false, error: "Tu ne peux pas supprimer ce message" }, { status: 403 });
  }
  if (result === "not_found") {
    return NextResponse.json({ ok: false, error: "Message introuvable" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
