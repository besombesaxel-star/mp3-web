import { NextResponse } from "next/server";
import { readAuthenticatedUser } from "@/lib/supabaseAuthServer";
import { readAccountProfile } from "@/lib/accountData";
import { pushNotification } from "@/lib/notificationData";
import { broadcastToUser } from "@/lib/realtimeBroadcast";
import { checkRateLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";

const SUGGEST_LIMIT = 10;
const SUGGEST_WINDOW_MS = 60 * 1000;

export async function POST(req: Request) {
  const auth = await readAuthenticatedUser(req);
  if (!auth.user) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  const rateLimit = checkRateLimit(`queue-suggest:${auth.user.id}`, SUGGEST_LIMIT, SUGGEST_WINDOW_MS);
  if (!rateLimit.allowed) {
    return NextResponse.json({ ok: false, error: "Patiente un instant avant de suggerer a nouveau." }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  const targetUserId = typeof body?.targetUserId === "string" ? body.targetUserId : "";
  const trackTitle = typeof body?.trackTitle === "string" ? body.trackTitle.trim().slice(0, 200) : "";
  const trackArtist = typeof body?.trackArtist === "string" ? body.trackArtist.trim().slice(0, 200) : "";
  const trackSrc = typeof body?.trackSrc === "string" ? body.trackSrc.trim().slice(0, 500) : "";
  const trackCover = typeof body?.trackCover === "string" ? body.trackCover.trim().slice(0, 500) : "";

  if (!targetUserId || !trackTitle || !trackSrc) {
    return NextResponse.json({ ok: false, error: "Requete invalide" }, { status: 400 });
  }
  if (targetUserId === auth.user.id) {
    return NextResponse.json({ ok: false, error: "Action non autorisee" }, { status: 400 });
  }

  const rawName = auth.user.user_metadata?.display_name;
  const fromDisplayName =
    typeof rawName === "string" && rawName.trim() ? rawName.trim() : (auth.user.email?.trim() ?? "Quelqu'un");
  const profile = await readAccountProfile(auth.user.id).catch(() => null);
  const fromAvatarUrl = profile?.avatarUrl ?? "";

  const notifPayload = {
    type: "queue_suggestion" as const,
    fromUserId: auth.user.id,
    fromDisplayName,
    fromAvatarUrl,
    trackTitle,
    trackSrc,
    trackCover: trackCover || undefined,
    createdAt: Date.now(),
  };

  void pushNotification(targetUserId, notifPayload).catch(() => {});
  void broadcastToUser(targetUserId, "new_notification", { ...notifPayload, id: crypto.randomUUID(), read: false }).catch(() => {});
  void broadcastToUser(targetUserId, "queue_suggestion", {
    id: crypto.randomUUID(),
    fromUserId: auth.user.id,
    fromDisplayName,
    fromAvatarUrl,
    track: {
      title: trackTitle,
      artist: trackArtist || undefined,
      src: trackSrc,
      cover: trackCover || undefined,
    },
  }).catch(() => {});

  return NextResponse.json({ ok: true });
}
