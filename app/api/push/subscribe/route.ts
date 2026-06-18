import { NextResponse } from "next/server";
import { addPushSubscription, removePushSubscription } from "@/lib/pushSubscriptions";
import { readAuthenticatedUser } from "@/lib/supabaseAuthServer";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const auth = await readAuthenticatedUser(req);
  if (!auth.user) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  const body = await req.json().catch(() => null);
  if (!body?.subscription) {
    return NextResponse.json({ ok: false, error: "Abonnement manquant" }, { status: 400 });
  }

  await addPushSubscription(auth.user.id, body.subscription);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const auth = await readAuthenticatedUser(req);
  if (!auth.user) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  const body = await req.json().catch(() => null);
  const endpoint = typeof body?.endpoint === "string" ? body.endpoint : "";
  if (!endpoint) {
    return NextResponse.json({ ok: false, error: "Endpoint manquant" }, { status: 400 });
  }

  await removePushSubscription(auth.user.id, endpoint);
  return NextResponse.json({ ok: true });
}
