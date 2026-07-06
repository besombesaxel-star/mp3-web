import { NextResponse } from "next/server";
import { readAuthenticatedUser } from "@/lib/supabaseAuthServer";
import { logActivity, readActivityLog, type ActivityEventType } from "@/lib/activityLog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const CLIENT_REPORTABLE: ActivityEventType[] = ["sign_in", "password_changed", "sign_out_others"];

export async function GET(req: Request) {
  const auth = await readAuthenticatedUser(req);
  if (!auth.user) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  const events = await readActivityLog(auth.user.id);
  return NextResponse.json({ ok: true, events });
}

export async function POST(req: Request) {
  const auth = await readAuthenticatedUser(req);
  if (!auth.user) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  const body = await req.json().catch(() => null);
  const type = typeof body?.type === "string" ? (body.type as ActivityEventType) : null;
  if (!type || !CLIENT_REPORTABLE.includes(type)) {
    return NextResponse.json({ ok: false, error: "Type invalide" }, { status: 400 });
  }

  const meta = typeof body?.meta === "string" ? body.meta.slice(0, 200) : undefined;
  await logActivity(auth.user.id, type, meta);
  return NextResponse.json({ ok: true });
}
