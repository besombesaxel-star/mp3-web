import { NextResponse } from "next/server";
import { readAuthenticatedUser } from "@/lib/supabaseAuthServer";
import { getOtherParticipant, listConversationIdsForUser, readConversation } from "@/lib/directMessages";
import { getPublicUserProfileData } from "@/lib/publicCatalog";
import { unexpectedErrorResponse } from "@/lib/apiError";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request) {
  try {
  const auth = await readAuthenticatedUser(req);
  if (!auth.user) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  const userId = auth.user.id;
  const conversationIds = await listConversationIdsForUser(userId);

  const previews = await Promise.all(
    conversationIds.map(async (conversationId) => {
      const otherId = getOtherParticipant(conversationId, userId);
      if (!otherId) return null;

      const [messages, profile] = await Promise.all([
        readConversation(conversationId),
        getPublicUserProfileData(otherId).catch(() => null),
      ]);

      const last = messages[messages.length - 1];
      if (!last) return null;

      return {
        userId: otherId,
        displayName: profile?.displayName || "Membre mp3",
        avatarUrl: profile?.avatarUrl ?? "",
        lastMessage: last.content,
        lastFromMe: last.senderId === userId,
        updatedAt: last.createdAt,
      };
    })
  );

  const conversations = previews
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .sort((a, b) => b.updatedAt - a.updatedAt);

  return NextResponse.json({ ok: true, conversations });
  } catch {
    return unexpectedErrorResponse();
  }
}
