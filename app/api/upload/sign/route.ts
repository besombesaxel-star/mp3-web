import { NextResponse } from "next/server";
import { createUploadTargetsForApi } from "@/lib/libraryRepository";
import { readAuthenticatedUser } from "@/lib/supabaseAuthServer";
import { checkRateLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";

const UPLOAD_LIMIT = 20;
const UPLOAD_WINDOW_MS = 10 * 60 * 1000;

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export async function POST(req: Request) {
  try {
    const auth = await readAuthenticatedUser(req);
    if (!auth.user) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const rateLimit = checkRateLimit(`upload:${auth.user.id}`, UPLOAD_LIMIT, UPLOAD_WINDOW_MS);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { ok: false, error: "Trop d'uploads recents, reessaie dans quelques minutes." },
        { status: 429 }
      );
    }

    const body = await req.json().catch(() => null);
    const audioName = typeof body?.audioName === "string" ? body.audioName : "";
    const audioSize = typeof body?.audioSize === "number" ? body.audioSize : 0;
    const coverName = typeof body?.coverName === "string" ? body.coverName : null;

    if (!audioName.toLowerCase().endsWith(".mp3")) {
      return NextResponse.json({ ok: false, error: "Seuls les fichiers .mp3 sont acceptes." }, { status: 400 });
    }

    const maxBytes = 80 * 1024 * 1024;
    if (audioSize > maxBytes) {
      return NextResponse.json({ ok: false, error: "Fichier trop lourd (max 80MB)." }, { status: 400 });
    }

    const targets = await createUploadTargetsForApi(audioName, coverName);
    return NextResponse.json({ ok: true, ...targets });
  } catch (errorValue: unknown) {
    return NextResponse.json({ ok: false, error: getErrorMessage(errorValue) }, { status: 500 });
  }
}
