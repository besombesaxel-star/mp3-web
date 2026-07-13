import { NextResponse } from "next/server";
import { getPublicUserProfileData } from "@/lib/publicCatalog";
import { bumpProfileView } from "@/lib/profileViews";
import { readOptionalAuthenticatedUser } from "@/lib/supabaseAuthServer";
import { unexpectedErrorResponse } from "@/lib/apiError";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(
  req: Request,
  context: { params: Promise<{ userId: string }> }
) {
  try {
  const { userId } = await context.params;
  const viewer = await readOptionalAuthenticatedUser(req);
  const profile = await getPublicUserProfileData(userId, viewer?.id ?? null);

  if (!profile) {
    return NextResponse.json({ ok: false, error: "Profil introuvable" }, { status: 404 });
  }

  void bumpProfileView(userId, viewer?.id ?? null);

  return NextResponse.json({
    ok: true,
    profile,
  });
  } catch {
    return unexpectedErrorResponse();
  }
}
