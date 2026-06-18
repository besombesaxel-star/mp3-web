import { NextResponse } from "next/server";
import { recordHeartbeat } from "@/lib/launcherHeartbeat";

export const runtime = "nodejs";

export async function POST() {
  recordHeartbeat();
  return new NextResponse(null, { status: 204 });
}
