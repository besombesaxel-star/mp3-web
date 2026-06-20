import { NextResponse } from "next/server";
import { readAuthenticatedUser } from "@/lib/supabaseAuthServer";
import { readAccountProfile } from "@/lib/accountData";
import { pushNotification } from "@/lib/notificationData";
import { broadcastToUser } from "@/lib/realtimeBroadcast";

export const runtime = "nodejs";

const ALLOWED_EMOJIS = ["🔥", "❤️", "😍", "🎧", "👏"];
const MIN_INTERVAL_MS = 3000;

const lastReactionAtByUser = new Map<string, number>();

export async function POST(req: Request) {
  const auth = await readAuthenticatedUser(req);
  if (!auth.user) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  const lastSentAt = lastReactionAtByUser.get(auth.user.id) ?? 0;
  const now = Date.now();
  if (now - lastSentAt < MIN_INTERVAL_MS) {
    return NextResponse.json({ ok: false, error: "Patiente un instant avant de reagir a nouveau." }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  const targetUserId = typeof body?.targetUserId === "string" ? body.targetUserId : "";
  const emoji = typeof body?.emoji === "string" ? body.emoji : "";
  const trackTitle = typeof body?.trackTitle === "string" ? body.trackTitle.slice(0, 200) : "";

  if (!targetUserId || !ALLOWED_EMOJIS.includes(emoji)) {
    return NextResponse.json({ ok: false, error: "Requete invalide" }, { status: 400 });
  }
  if (targetUserId === auth.user.id) {
    return NextResponse.json({ ok: false, error: "Action non autorisee" }, { status: 400 });
  }

  lastReactionAtByUser.set(auth.user.id, now);

  const rawName = auth.user.user_metadata?.display_name;
  const fromDisplayName =
    typeof rawName === "string" && rawName.trim() ? rawName.trim() : (auth.user.email?.trim() ?? "Quelqu'un");
  const profile = await readAccountProfile(auth.user.id).catch(() => null);

  const notifPayload = {
    type: "reaction" as const,
    fromUserId: auth.user.id,
    fromDisplayName,
    fromAvatarUrl: profile?.avatarUrl ?? "",
    emoji,
    trackTitle,
    createdAt: now,
  };

  void pushNotification(targetUserId, notifPayload).catch(() => {});
  void broadcastToUser(targetUserId, "new_notification", { ...notifPayload, id: crypto.randomUUID(), read: false }).catch(() => {});

  return NextResponse.json({ ok: true });
}
