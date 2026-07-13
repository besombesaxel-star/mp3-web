import { NextResponse } from "next/server";
import { readAuthenticatedUser } from "@/lib/supabaseAuthServer";
import { readNotifications, markAllNotificationsRead } from "@/lib/notificationData";
import { unexpectedErrorResponse } from "@/lib/apiError";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request) {
  try {
  const auth = await readAuthenticatedUser(req);
  if (!auth.user) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  const notifications = await readNotifications(auth.user.id);
  return NextResponse.json({ ok: true, notifications });
  } catch {
    return unexpectedErrorResponse();
  }
}

export async function PUT(req: Request) {
  try {
  const auth = await readAuthenticatedUser(req);
  if (!auth.user) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  await markAllNotificationsRead(auth.user.id);
  return NextResponse.json({ ok: true });
  } catch {
    return unexpectedErrorResponse();
  }
}
