import { NextResponse } from "next/server";
import { saveAccountProfile } from "@/lib/accountData";
import { getSupabaseAdmin, ensureSupabaseBucketReady } from "@/lib/supabaseAdmin";
import { readAuthenticatedUser } from "@/lib/supabaseAuthServer";
import { unexpectedErrorResponse } from "@/lib/apiError";

export const runtime = "nodejs";

function extractPublicUrl(data: unknown) {
  if (!data || typeof data !== "object") return "";
  if ("publicUrl" in data && typeof data.publicUrl === "string") return data.publicUrl;
  if ("publicURL" in data && typeof data.publicURL === "string") return data.publicURL;
  return "";
}

export async function POST(req: Request) {
  try {
  const auth = await readAuthenticatedUser(req);
  if (!auth.user) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ ok: false, error: "Storage non configuré." }, { status: 503 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "Requête invalide." }, { status: 400 });
  }

  const file = form.get("image");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ ok: false, error: "Image requise." }, { status: 400 });
  }

  const VALID_TYPES = ["image/jpeg", "image/png", "image/webp"];
  if (!VALID_TYPES.includes(file.type)) {
    return NextResponse.json({ ok: false, error: "Format accepté : jpg, png, webp." }, { status: 400 });
  }

  if (file.size > 5 * 1024 * 1024) {
    return NextResponse.json({ ok: false, error: "Image trop lourde (max 5 MB)." }, { status: 400 });
  }

  await ensureSupabaseBucketReady(admin.client, admin.bucket);

  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const avatarPath = `avatars/${auth.user.id}.${ext}`;

  const { error: uploadError } = await admin.client.storage
    .from(admin.bucket)
    .upload(avatarPath, await file.arrayBuffer(), {
      contentType: file.type,
      cacheControl: "3600",
      upsert: true,
    });

  if (uploadError) {
    return NextResponse.json({ ok: false, error: "Erreur lors de l'upload." }, { status: 500 });
  }

  const rawUrl = extractPublicUrl(
    admin.client.storage.from(admin.bucket).getPublicUrl(avatarPath).data
  );
  const avatarUrl = rawUrl ? `${rawUrl}?t=${Date.now()}` : "";

  await saveAccountProfile(auth.user.id, { avatarUrl });

  return NextResponse.json({ ok: true, avatarUrl });
  } catch {
    return unexpectedErrorResponse();
  }
}

export async function DELETE(req: Request) {
  try {
  const auth = await readAuthenticatedUser(req);
  if (!auth.user) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  await saveAccountProfile(auth.user.id, { avatarUrl: "" });
  return NextResponse.json({ ok: true });
  } catch {
    return unexpectedErrorResponse();
  }
}
