import { NextResponse } from "next/server";
import { isValidTrackSrc, listTracksForApi } from "@/lib/libraryRepository";
import { readAuthenticatedUser } from "@/lib/supabaseAuthServer";
import { readTrackLyrics, writeTrackLyrics, deleteTrackLyrics } from "@/lib/trackLyrics";
import { isAdminUser } from "@/lib/adminAccess";
import { checkRateLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LYRICS_LIMIT = 10;
const LYRICS_WINDOW_MS = 10 * 60 * 1000;

async function checkOwnership(
  req: Request,
  src: string
): Promise<{ ok: true; userId: string } | { ok: false; response: NextResponse }> {
  const auth = await readAuthenticatedUser(req);
  if (!auth.user) {
    return { ok: false, response: NextResponse.json({ ok: false, error: auth.error }, { status: auth.status }) };
  }

  const tracks = await listTracksForApi();
  const track = tracks.find((t) => t.src === src);
  if (!track) {
    return { ok: false, response: NextResponse.json({ ok: false, error: "Son introuvable" }, { status: 404 }) };
  }

  if (track.ownerId !== auth.user.id && !isAdminUser(auth.user.id)) {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, error: "Seul le proprietaire peut modifier les paroles" },
        { status: 403 }
      ),
    };
  }

  return { ok: true, userId: auth.user.id };
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const src = searchParams.get("src") ?? "";

  if (!isValidTrackSrc(src)) {
    return NextResponse.json({ ok: false, error: "src invalide" }, { status: 400 });
  }

  const lyrics = await readTrackLyrics(src);
  return NextResponse.json({ ok: true, lyrics });
}

export async function PUT(req: Request) {
  const body = await req.json().catch(() => null);
  const src = typeof body?.src === "string" ? body.src : "";
  const text = typeof body?.text === "string" ? body.text : "";

  if (!isValidTrackSrc(src)) {
    return NextResponse.json({ ok: false, error: "src invalide" }, { status: 400 });
  }
  if (!text.trim()) {
    return NextResponse.json({ ok: false, error: "Les paroles ne peuvent pas etre vides." }, { status: 400 });
  }

  const check = await checkOwnership(req, src);
  if (!check.ok) return check.response;

  const rateLimit = checkRateLimit(`lyrics:${check.userId}`, LYRICS_LIMIT, LYRICS_WINDOW_MS);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { ok: false, error: "Trop de modifications recentes, reessaie dans quelques minutes." },
      { status: 429 }
    );
  }

  const lyrics = await writeTrackLyrics(src, text, check.userId);
  return NextResponse.json({ ok: true, lyrics });
}

export async function DELETE(req: Request) {
  const body = await req.json().catch(() => null);
  const src = typeof body?.src === "string" ? body.src : "";

  if (!isValidTrackSrc(src)) {
    return NextResponse.json({ ok: false, error: "src invalide" }, { status: 400 });
  }

  const check = await checkOwnership(req, src);
  if (!check.ok) return check.response;

  await deleteTrackLyrics(src);
  return NextResponse.json({ ok: true });
}
