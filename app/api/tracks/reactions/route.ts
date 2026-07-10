import { NextResponse } from "next/server";
import { isValidTrackSrc } from "@/lib/libraryRepository";
import { readAuthenticatedUser } from "@/lib/supabaseAuthServer";
import { ALLOWED_TRACK_REACTIONS, toggleTrackReaction } from "@/lib/trackComments";
import { checkRateLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REACTION_LIMIT = 30;
const REACTION_WINDOW_MS = 10 * 60 * 1000;

export async function POST(req: Request) {
  const auth = await readAuthenticatedUser(req);
  if (!auth.user) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  const rateLimit = checkRateLimit(`track-reaction:${auth.user.id}`, REACTION_LIMIT, REACTION_WINDOW_MS);
  if (!rateLimit.allowed) {
    return NextResponse.json({ ok: false, error: "Trop de reactions recentes, reessaie dans quelques minutes." }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  const src = typeof body?.src === "string" ? body.src : "";
  const emoji = typeof body?.emoji === "string" ? body.emoji : "";

  if (!isValidTrackSrc(src) || !ALLOWED_TRACK_REACTIONS.includes(emoji)) {
    return NextResponse.json({ ok: false, error: "Requete invalide" }, { status: 400 });
  }

  const updated = await toggleTrackReaction(src, emoji, auth.user.id);
  return NextResponse.json({ ok: true, reactions: updated.reactions });
}
