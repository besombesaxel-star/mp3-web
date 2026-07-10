import { NextResponse } from "next/server";
import { readRecentActivity } from "@/lib/activityFeed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const events = await readRecentActivity(30);
  return NextResponse.json({ ok: true, events });
}
