import { NextResponse } from "next/server";
import { getLibraryBackendMode, isValidTrackSrc, saveTrackMetaForApi } from "@/lib/libraryRepository";
import { readLocalMeta } from "@/lib/localLibrary";
import { readAuthenticatedUser } from "@/lib/supabaseAuthServer";

export const runtime = "nodejs";

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export async function GET() {
  const meta = await readLocalMeta();
  return NextResponse.json({ storage: getLibraryBackendMode(), meta });
}

export async function POST(req: Request) {
  try {
    const auth = await readAuthenticatedUser(req);
    if (!auth.user) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const body = await req.json().catch(() => null);

    const src = body?.src;
    const title = body?.title;
    const artist = body?.artist;

    if (typeof src !== "string" || !isValidTrackSrc(src)) {
      return NextResponse.json({ ok: false, error: "src invalide" }, { status: 400 });
    }

    if (typeof title !== "string" || typeof artist !== "string") {
      return NextResponse.json({ ok: false, error: "title/artist invalides" }, { status: 400 });
    }

    const cleanTitle = title.trim();
    const cleanArtist = artist.trim();

    if (!cleanTitle) {
      return NextResponse.json({ ok: false, error: "Le titre ne peut pas etre vide" }, { status: 400 });
    }

    const result = await saveTrackMetaForApi(src, cleanTitle, cleanArtist, auth.user.id);
    if (result === "forbidden") {
      return NextResponse.json({ ok: false, error: "Seul le proprietaire peut modifier ce son" }, { status: 403 });
    }

    if (result !== "ok") {
      return NextResponse.json({ ok: false, error: "Track introuvable" }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (errorValue: unknown) {
    return NextResponse.json(
      { ok: false, error: "Meta update failed", details: getErrorMessage(errorValue) },
      { status: 500 }
    );
  }
}
