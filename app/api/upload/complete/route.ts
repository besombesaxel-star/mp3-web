import { NextResponse } from "next/server";
import { finalizeUploadForApi } from "@/lib/libraryRepository";
import { readAuthenticatedUser } from "@/lib/supabaseAuthServer";
import { readAccountProfile } from "@/lib/accountData";
import { notifyAllUsersOfUpload } from "@/lib/notificationData";

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

    const body = await req.json().catch(() => null);
    const audioPath = typeof body?.audioPath === "string" ? body.audioPath : "";
    const coverPath = typeof body?.coverPath === "string" ? body.coverPath : null;

    if (!audioPath) {
      return NextResponse.json({ ok: false, error: "Chemin audio manquant." }, { status: 400 });
    }

    const track = await finalizeUploadForApi(audioPath, coverPath, {
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
