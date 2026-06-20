import { NextResponse } from "next/server";
import { getAllBadgeAssignments, setBadgesForUser, MANUAL_BADGE_KEYS, type BadgeKey } from "@/lib/badges";
import { isAdminUser } from "@/lib/adminAccess";
import { readAuthenticatedUser } from "@/lib/supabaseAuthServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request) {
  const auth = await readAuthenticatedUser(req);
  if (!auth.user) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }
  if (!isAdminUser(auth.user.id)) {
    return NextResponse.json({ ok: false, error: "Acces refuse" }, { status: 403 });
  }

  const assignments = await getAllBadgeAssignments();
  return NextResponse.json({ ok: true, assignments });
}

export async function PUT(req: Request) {
  const auth = await readAuthenticatedUser(req);
  if (!auth.user) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }
  if (!isAdminUser(auth.user.id)) {
    return NextResponse.json({ ok: false, error: "Acces refuse" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const userId = typeof body?.userId === "string" ? body.userId.trim() : "";
  const badges = Array.isArray(body?.badges)
    ? body.badges.filter((b: unknown): b is BadgeKey => typeof b === "string" && MANUAL_BADGE_KEYS.includes(b as BadgeKey))
    : [];

  if (!userId) {
    return NextResponse.json({ ok: false, error: "userId manquant" }, { status: 400 });
  }

  await setBadgesForUser(userId, badges);
  const assignments = await getAllBadgeAssignments();
  return NextResponse.json({ ok: true, assignments });
}
