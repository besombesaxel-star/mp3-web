import { NextResponse } from "next/server";
import { isValidTrackSrc, setTrackPrivacyForApi } from "@/lib/libraryRepository";
import { readAuthenticatedUser } from "@/lib/supabaseAuthServer";
import { checkRateLimit } from "@/lib/rateLimit";
import { getErrorMessage } from "@/lib/errorMessage";

export const runtime = "nodejs";

const PRIVACY_LIMIT = 20;
const PRIVACY_WINDOW_MS = 10 * 60 * 1000;

export async function POST(req: Request) {
  try {
    const auth = await readAuthenticatedUser(req);
    if (!auth.user) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const rateLimit = checkRateLimit(`privacy:${auth.user.id}`, PRIVACY_LIMIT, PRIVACY_WINDOW_MS);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { ok: false, error: "Trop de modifications recentes, reessaie dans quelques minutes." },
        { status: 429 }
      );
    }

    const body = await req.json().catch(() => null);
    const src = body?.src;
    const isPrivate = body?.private;

    if (typeof src !== "string" || !isValidTrackSrc(src)) {
      return NextResponse.json({ ok: false, error: "src invalide" }, { status: 400 });
    }

    if (typeof isPrivate !== "boolean") {
      return NextResponse.json({ ok: false, error: "private invalide" }, { status: 400 });
    }

    const result = await setTrackPrivacyForApi(src, isPrivate, auth.user.id);
    if (result === "forbidden") {
      return NextResponse.json({ ok: false, error: "Seul le proprietaire peut modifier ce son" }, { status: 403 });
    }

    if (result === "unsupported") {
      return NextResponse.json({ ok: false, error: "Non disponible pour cette source" }, { status: 400 });
    }

    if (result !== "ok") {
      return NextResponse.json({ ok: false, error: "Track introuvable" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, private: isPrivate });
  } catch (errorValue: unknown) {
    return NextResponse.json(
      { ok: false, error: "Mise a jour impossible", details: getErrorMessage(errorValue) },
      { status: 500 }
    );
  }
}
