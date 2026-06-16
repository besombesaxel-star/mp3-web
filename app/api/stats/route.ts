import { NextResponse } from "next/server";
import { readAuthenticatedUser } from "@/lib/supabaseAuthServer";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const BUCKET = "account-data";

function getPath(userId: string) {
  return `stats/${userId}.json`;
}

export async function GET(req: Request) {
  const auth = await readAuthenticatedUser(req);
  if (!auth.user) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ ok: false, stats: null });

  const { data, error } = await admin.client.storage.from(BUCKET).download(getPath(auth.user.id));
  if (error || !data) return NextResponse.json({ ok: true, stats: null });

  try {
    const stats = JSON.parse(await data.text());
    return NextResponse.json({ ok: true, stats });
  } catch {
    return NextResponse.json({ ok: true, stats: null });
  }
}

export async function PUT(req: Request) {
  const auth = await readAuthenticatedUser(req);
  if (!auth.user) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ ok: false, error: "No body" }, { status: 400 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ ok: false, error: "No admin" }, { status: 500 });

  const blob = new Blob([JSON.stringify(body)], { type: "application/json" });
  await admin.client.storage
    .from(BUCKET)
    .upload(getPath(auth.user.id), blob, { upsert: true, contentType: "application/json" });

  return NextResponse.json({ ok: true });
}
