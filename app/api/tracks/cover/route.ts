import { NextResponse } from "next/server";
import { isValidCoverUpload, isValidTrackSrc, saveTrackCoverForApi } from "@/lib/libraryRepository";
import { readAuthenticatedUser } from "@/lib/supabaseAuthServer";
import { checkRateLimit } from "@/lib/rateLimit";
import { getErrorMessage } from "@/lib/errorMessage";

export const runtime = "nodejs";

const COVER_LIMIT = 20;
const COVER_WINDOW_MS = 10 * 60 * 1000;

export async function POST(req: Request) {
  try {
    const auth = await readAuthenticatedUser(req);
    if (!auth.user) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const rateLimit = checkRateLimit(`cover:${auth.user.id}`, COVER_LIMIT, COVER_WINDOW_MS);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { ok: false, error: "Trop de modifications recentes, reessaie dans quelques minutes." },
        { status: 429 }
      );
    }

    const form = await req.formData();
    const src = form.get("src");
    const cover = form.get("cover");

    if (typeof src !== "string" || !isValidTrackSrc(src)) {
      return NextResponse.json({ ok: false, error: "src invalide" }, { status: 400 });
    }

    if (!(cover instanceof File) || cover.size === 0) {
      return NextResponse.json({ ok: false, error: "Tu dois envoyer une image." }, { status: 400 });
    }

    if (!isValidCoverUpload(cover)) {
      return NextResponse.json({ ok: false, error: "La cover doit etre une image (jpg/png/webp)." }, { status: 400 });
    }

    const result = await saveTrackCoverForApi(src, cover, auth.user.id);
    if (result === "forbidden") {
      return NextResponse.json({ ok: false, error: "Seul le proprietaire peut modifier ce son" }, { status: 403 });
    }

    if (result !== "ok") {
      return NextResponse.json({ ok: false, error: "Track introuvable" }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (errorValue: unknown) {
    return NextResponse.json(
      { ok: false, error: "Cover update failed", details: getErrorMessage(errorValue) },
      { status: 500 }
    );
  }
}
