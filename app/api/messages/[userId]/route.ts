import { NextResponse } from "next/server";
import { readAuthenticatedUser } from "@/lib/supabaseAuthServer";
import { appendMessage, getConversationId, readConversation } from "@/lib/directMessages";
import { readAccountProfile } from "@/lib/accountData";
import { pushNotification } from "@/lib/notificationData";
import { broadcastToChannel, broadcastToUser } from "@/lib/realtimeBroadcast";
import { checkRateLimit } from "@/lib/rateLimit";
import { unexpectedErrorResponse } from "@/lib/apiError";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const MAX_CONTENT = 1000;
const DM_LIMIT = 20;
const DM_WINDOW_MS = 60 * 1000;

type Ctx = { params: Promise<{ userId: string }> };

export async function GET(req: Request, ctx: Ctx) {
  try {
  const auth = await readAuthenticatedUser(req);
  if (!auth.user) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  const { userId: otherId } = await ctx.params;
  if (!otherId || otherId === auth.user.id) {
    return NextResponse.json({ ok: false, error: "Cible invalide" }, { status: 400 });
  }

  const conversationId = getConversationId(auth.user.id, otherId);
  const messages = await readConversation(conversationId);
  return NextResponse.json({ ok: true, messages });
  } catch {
    return unexpectedErrorResponse();
  }
}

export async function POST(req: Request, ctx: Ctx) {
  try {
  const auth = await readAuthenticatedUser(req);
  if (!auth.user) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  const { userId: otherId } = await ctx.params;
  if (!otherId || otherId === auth.user.id) {
    return NextResponse.json({ ok: false, error: "Cible invalide" }, { status: 400 });
  }

  const rateLimit = checkRateLimit(`dm:${auth.user.id}`, DM_LIMIT, DM_WINDOW_MS);
  if (!rateLimit.allowed) {
    return NextResponse.json({ ok: false, error: "Trop de messages, patiente un instant." }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  const content = typeof body?.content === "string" ? body.content.trim().slice(0, MAX_CONTENT) : "";
  if (!content) return NextResponse.json({ ok: false, error: "Message vide" }, { status: 400 });

  const conversationId = getConversationId(auth.user.id, otherId);
  const message = {
    id: crypto.randomUUID(),
    senderId: auth.user.id,
    content,
    createdAt: Date.now(),
  };

  const messages = await appendMessage(conversationId, message);

  // Do not put message content on the realtime broadcast: that channel is reachable by anyone
  // holding the public anon key who knows/derives the topic name. Send an empty ping only -
  // recipients re-fetch the conversation through the authenticated GET endpoint above.
  void broadcastToChannel(`dm:${conversationId}`, "dm_message", {}).catch(() => {});

  const profile = await readAccountProfile(auth.user.id).catch(() => null);
  const fromDisplayName =
    (auth.user.user_metadata?.display_name as string | undefined)?.trim() ||
    auth.user.email?.trim() ||
    "Quelqu'un";

  const notifPayload = {
    type: "message" as const,
    fromUserId: auth.user.id,
    fromDisplayName,
    fromAvatarUrl: profile?.avatarUrl ?? "",
    excerpt: content.slice(0, 140),
    createdAt: Date.now(),
  };
  void pushNotification(otherId, notifPayload).catch(() => {});
  // Same reasoning: the broadcast payload must not carry the excerpt or sender identity.
  // The full notification is safely persisted above and read back via the authenticated
  // /api/notifications endpoint; this ping just tells the client to go fetch it.
  void broadcastToUser(otherId, "new_notification", { type: "message", id: crypto.randomUUID() }).catch(() => {});

  return NextResponse.json({ ok: true, messages });
  } catch {
    return unexpectedErrorResponse();
  }
}
