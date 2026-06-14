import { NextResponse } from "next/server";
import { isValidAudioUpload, isValidCoverUpload, uploadTrackForApi } from "@/lib/libraryRepository";
import { readAuthenticatedUser } from "@/lib/supabaseAuthServer";

export const runtime = "nodejs";

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export async function POST(req: Request) {
  try {
    const auth = await readAuthenticatedUser(req);
    if (!auth.user) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const form = await req.formData();
    const audio = form.get("audio");
    const cover = form.get("cover");

    if (!(audio instanceof File)) {
      return NextResponse.json({ ok: false, error: "Tu dois envoyer un fichier MP3 (audio)." }, { status: 400 });
    }

    if (!isValidAudioUpload(audio)) {
      return NextResponse.json({ ok: false, error: "Seuls les fichiers .mp3 sont acceptes." }, { status: 400 });
    }

    const maxBytes = 80 * 1024 * 1024;
    if (audio.size > maxBytes) {
      return NextResponse.json({ ok: false, error: "Fichier trop lourd (max 80MB)." }, { status: 400 });
    }

    if (cover instanceof File && cover.size > 0 && !isValidCoverUpload(cover)) {
      return NextResponse.json({ ok: false, error: "La cover doit etre une image (jpg/png/webp)." }, { status: 400 });
    }

    const track = await uploadTrackForApi(audio, cover instanceof File ? cover : null, {
      displayName: auth.user.user_metadata?.display_name,
      email: auth.user.email ?? null,
      id: auth.user.id,
    });

    return NextResponse.json({
      ok: true,
      track: {
        title: track.title,
        artist: track.artist,
        src: track.src,
        cover: track.cover,
        ownerDisplayName: track.ownerDisplayName ?? null,
        ownerId: track.ownerId ?? null,
      },
    });
  } catch (errorValue: unknown) {
    return NextResponse.json(
      { ok: false, error: "Upload failed", details: getErrorMessage(errorValue) },
      { status: 500 }
    );
  }
}
