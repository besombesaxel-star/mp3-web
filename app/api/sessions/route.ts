import { NextResponse } from "next/server";
import { readAuthenticatedUser } from "@/lib/supabaseAuthServer";
import { forgetDeviceSession, listDeviceSessions, touchDeviceSession } from "@/lib/deviceSessions";
import { logActivity } from "@/lib/activityLog";
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

  const sessions = await listDeviceSessions(auth.user.id);
  return NextResponse.json({ ok: true, sessions });
  } catch {
    return unexpectedErrorResponse();
  }
}

export async function POST(req: Request) {
  try {
  const auth = await readAuthenticatedUser(req);
  if (!auth.user) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  const body = await req.json().catch(() => null);
  const deviceId = typeof body?.deviceId === "string" ? body.deviceId.trim() : "";
  const deviceLabel = typeof body?.deviceLabel === "string" ? body.deviceLabel.trim().slice(0, 80) : "Appareil";
  if (!deviceId) {
    return NextResponse.json({ ok: false, error: "deviceId requis" }, { status: 400 });
  }

  const sessions = await touchDeviceSession(auth.user.id, deviceId, deviceLabel);
  return NextResponse.json({ ok: true, sessions });
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

  const body = await req.json().catch(() => null);
  const deviceId = typeof body?.deviceId === "string" ? body.deviceId.trim() : "";
  if (!deviceId) {
    return NextResponse.json({ ok: false, error: "deviceId requis" }, { status: 400 });
  }

  const sessions = await forgetDeviceSession(auth.user.id, deviceId);
  void logActivity(auth.user.id, "device_forgotten").catch(() => {});
  return NextResponse.json({ ok: true, sessions });
  } catch {
    return unexpectedErrorResponse();
  }
}
