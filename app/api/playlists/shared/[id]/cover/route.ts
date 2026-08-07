import { NextResponse } from "next/server";
import { readAuthenticatedUser } from "@/lib/supabaseAuthServer";
import { readSharedPlaylist, updateSharedPlaylist } from "@/lib/sharedPlaylists";
import { getR2Admin, putR2Object, getR2PublicUrl } from "@/lib/r2Storage";
import { getSupabaseAdmin, ensureSupabaseBucketReady } from "@/lib/supabaseAdmin";
import { checkRateLimit } from "@/lib/rateLimit";
import { unexpectedErrorResponse } from "@/lib/apiError";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COVER_LIMIT = 20;
const COVER_WINDOW_MS = 10 * 60 * 1000;

type Ctx = { params: Promise<{ id: string }> };

function isMember(playlist: { ownerId: string; collaboratorIds: string[] }, userId: string) {
  return playlist.ownerId === userId || playlist.collaboratorIds.includes(userId);
}

export async function POST(req: Request, ctx: Ctx) {
  try {
    const auth = await readAuthenticatedUser(req);
    if (!auth.user) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const { id } = await ctx.params;
    const playlist = await readSharedPlaylist(id);
    if (!playlist || !isMember(playlist, auth.user.id)) {
      return NextResponse.json({ ok: false, error: "Playlist introuvable" }, { status: 404 });
    }

    const rateLimit = checkRateLimit(`shared-playlist-cover:${auth.user.id}`, COVER_LIMIT, COVER_WINDOW_MS);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { ok: false, error: "Trop de modifications recentes, reessaie dans quelques minutes." },
        { status: 429 }
      );
    }

    const r2Admin = getR2Admin();
    const supabaseAdmin = r2Admin ? null : getSupabaseAdmin();
    if (!r2Admin && !supabaseAdmin) {
      return NextResponse.json({ ok: false, error: "Storage non configure." }, { status: 503 });
    }

    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return NextResponse.json({ ok: false, error: "Requete invalide." }, { status: 400 });
    }

    const file = form.get("image");
    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ ok: false, error: "Image requise." }, { status: 400 });
    }

    const VALID_TYPES = ["image/jpeg", "image/png", "image/webp"];
    if (!VALID_TYPES.includes(file.type)) {
      return NextResponse.json({ ok: false, error: "Format accepte : jpg, png, webp." }, { status: 400 });
    }

    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ ok: false, error: "Image trop lourde (max 5 MB)." }, { status: 400 });
    }

    const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const coverPath = `shared-playlist-covers/${id}.${ext}`;

    let coverUrl: string;

    if (r2Admin) {
      try {
        await putR2Object(r2Admin, coverPath, Buffer.from(await file.arrayBuffer()), file.type, {
          cacheControl: "max-age=3600",
        });
      } catch {
        return NextResponse.json({ ok: false, error: "Erreur lors de l'upload." }, { status: 500 });
      }
      coverUrl = `${getR2PublicUrl(r2Admin, coverPath)}?t=${Date.now()}`;
    } else {
      await ensureSupabaseBucketReady(supabaseAdmin!.client, supabaseAdmin!.bucket);
      const { error: uploadError } = await supabaseAdmin!.client.storage
        .from(supabaseAdmin!.bucket)
        .upload(coverPath, await file.arrayBuffer(), { contentType: file.type, cacheControl: "3600", upsert: true });

      if (uploadError) {
        return NextResponse.json({ ok: false, error: "Erreur lors de l'upload." }, { status: 500 });
      }

      const { data } = supabaseAdmin!.client.storage.from(supabaseAdmin!.bucket).getPublicUrl(coverPath);
      coverUrl = data.publicUrl ? `${data.publicUrl}?t=${Date.now()}` : "";
    }

    await updateSharedPlaylist(id, { coverUrl }, auth.user.id);
    const updated = await readSharedPlaylist(id);

    return NextResponse.json({ ok: true, playlist: updated });
  } catch {
    return unexpectedErrorResponse();
  }
}

export async function DELETE(req: Request, ctx: Ctx) {
  try {
    const auth = await readAuthenticatedUser(req);
    if (!auth.user) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const { id } = await ctx.params;
    const playlist = await readSharedPlaylist(id);
    if (!playlist || !isMember(playlist, auth.user.id)) {
      return NextResponse.json({ ok: false, error: "Playlist introuvable" }, { status: 404 });
    }

    await updateSharedPlaylist(id, { coverUrl: null }, auth.user.id);
    const updated = await readSharedPlaylist(id);

    return NextResponse.json({ ok: true, playlist: updated });
  } catch {
    return unexpectedErrorResponse();
  }
}
