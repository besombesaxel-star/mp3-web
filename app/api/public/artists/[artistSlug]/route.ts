import { NextResponse } from "next/server";
import { getPublicArtistPageData } from "@/lib/publicCatalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(
  _req: Request,
  context: { params: Promise<{ artistSlug: string }> }
) {
  const { artistSlug } = await context.params;
  const artist = await getPublicArtistPageData(artistSlug);

  if (!artist) {
    return NextResponse.json({ ok: false, error: "Artiste introuvable" }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    artist,
  });
}
