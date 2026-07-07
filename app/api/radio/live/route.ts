import { NextResponse } from "next/server";
import { getRadioNowPlaying } from "@/lib/radioStation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const nowPlaying = await getRadioNowPlaying();

  if (!nowPlaying) {
    return NextResponse.json({ ok: false, error: "Aucun morceau disponible pour la radio." }, { status: 404 });
  }

  return NextResponse.json(
    { ok: true, ...nowPlaying },
    { headers: { "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate" } }
  );
}
