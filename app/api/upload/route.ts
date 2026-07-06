import { NextResponse } from "next/server";
import { isValidAudioUpload, isValidCoverUpload, uploadTrackForApi } from "@/lib/libraryRepository";
import { readAuthenticatedUser } from "@/lib/supabaseAuthServer";
import { readAccountProfile } from "@/lib/accountData";
import { notifyAllUsersOfUpload } from "@/lib/notificationData";
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

    const form = await req.formData();
    const audio = form.get("audio");
    const cover = form.get("cover");

    if (!(audio instanceof File)) {
      return NextResponse.json({ ok: false, error: "Tu dois envoyer un fichier audio." }, { status: 400 });
    }

    if (!isValidAudioUpload(audio)) {
      return NextResponse.json({ ok: false, error: "Formats acceptes: MP3, FLAC, WAV." }, { status: 400 });
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

    const uploaderId = auth.user.id;
    const uploaderName =
      (auth.user.user_metadata?.display_name as string | undefined)?.trim() || "Quelqu'un";
    void (async () => {
      try {
        const profile = await readAccountProfile(uploaderId);
        await notifyAllUsersOfUpload({
          uploaderUserId: uploaderId,
          uploaderDisplayName: uploaderName,
          uploaderAvatarUrl: profile.avatarUrl ?? "",
          trackTitle: track.title,
          trackSrc: track.src,
          trackCover: track.cover ?? null,
        });
      } catch {}
    })();

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
