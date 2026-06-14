import { NextResponse } from "next/server";
import { getPublicUserProfileData } from "@/lib/publicCatalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(
  _req: Request,
  context: { params: Promise<{ userId: string }> }
) {
  const { userId } = await context.params;
  const profile = await getPublicUserProfileData(userId);

  if (!profile) {
    return NextResponse.json({ ok: false, error: "Profil introuvable" }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    profile,
  });
}
