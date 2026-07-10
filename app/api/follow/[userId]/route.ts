import { NextResponse } from "next/server";
import { readAuthenticatedUser } from "@/lib/supabaseAuthServer";
import { readAccountProfile, saveAccountProfile } from "@/lib/accountData";
import { pushNotification } from "@/lib/notificationData";
import { broadcastToUser } from "@/lib/realtimeBroadcast";
import { checkRateLimit } from "@/lib/rateLimit";
import { pushActivityEvent } from "@/lib/activityFeed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FOLLOW_LIMIT = 15;
const FOLLOW_WINDOW_MS = 60 * 1000;

type Ctx = { params: Promise<{ userId: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const auth = await readAuthenticatedUser(req);
  if (!auth.user) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  const rateLimit = checkRateLimit(`follow:${auth.user.id}`, FOLLOW_LIMIT, FOLLOW_WINDOW_MS);
  if (!rateLimit.allowed) {
    return NextResponse.json({ ok: false, error: "Trop d'actions, patiente un instant." }, { status: 429 });
  }

  const { userId: targetId } = await ctx.params;
  if (!targetId || targetId === auth.user.id) {
    return NextResponse.json({ ok: false, error: "Cible invalide" }, { status: 400 });
  }

  // Add target to follower's following list
  const followerProfile = await readAccountProfile(auth.user.id);
  if (followerProfile.following.includes(targetId)) {
    return NextResponse.json({ ok: true, followersCount: null });
  }

  // Increment target's followers count
  const [, targetProfile] = await Promise.all([
    saveAccountProfile(auth.user.id, {
      following: [...followerProfile.following, targetId],
    }),
    readAccountProfile(targetId),
  ]);

  const newCount = targetProfile.followersCount + 1;
  await saveAccountProfile(targetId, { followersCount: newCount });

  const fromDisplayName =
    (auth.user.user_metadata?.display_name as string | undefined)?.trim() || "Quelqu'un";
  const fromAvatarUrl = followerProfile.avatarUrl ?? "";

  const notifPayload = {
    type: "follow" as const,
    fromUserId: auth.user.id,
    fromDisplayName,
    fromAvatarUrl,
    createdAt: Date.now(),
  };

  void pushNotification(targetId, notifPayload).catch(() => {});
  void broadcastToUser(targetId, "new_notification", { ...notifPayload, id: crypto.randomUUID(), read: false }).catch(() => {});
  void pushActivityEvent({
    type: "follow",
    actorUserId: auth.user.id,
    actorDisplayName: fromDisplayName,
    actorAvatarUrl: fromAvatarUrl,
    targetUserId: targetId,
    createdAt: notifPayload.createdAt,
  }).catch(() => {});

  return NextResponse.json({ ok: true, followersCount: newCount });
}

export async function DELETE(req: Request, ctx: Ctx) {
  const auth = await readAuthenticatedUser(req);
  if (!auth.user) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  const { userId: targetId } = await ctx.params;
  if (!targetId || targetId === auth.user.id) {
    return NextResponse.json({ ok: false, error: "Cible invalide" }, { status: 400 });
  }

  const followerProfile = await readAccountProfile(auth.user.id);
  if (!followerProfile.following.includes(targetId)) {
    return NextResponse.json({ ok: true, followersCount: null });
  }

  const targetProfile = await readAccountProfile(targetId);
  const newCount = Math.max(0, targetProfile.followersCount - 1);

  await Promise.all([
    saveAccountProfile(auth.user.id, {
      following: followerProfile.following.filter((id) => id !== targetId),
    }),
    saveAccountProfile(targetId, { followersCount: newCount }),
  ]);

  return NextResponse.json({ ok: true, followersCount: newCount });
}
