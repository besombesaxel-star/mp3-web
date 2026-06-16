import { NextResponse } from "next/server";
import { readAccountProfile } from "@/lib/accountData";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

// Returns { [userId]: { avatarUrl, displayName } } for a list of user IDs
export async function GET(req: Request) {
  const url = new URL(req.url);
  const raw = url.searchParams.get("ids") ?? "";
  const ids = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 20);

  if (ids.length === 0) {
    return NextResponse.json({});
  }

  const admin = getSupabaseAdmin();

  const entries = await Promise.all(
    ids.map(async (userId) => {
      const [profile, userMeta] = await Promise.all([
        readAccountProfile(userId).catch(() => null),
        admin
          ? admin.client.auth.admin.getUserById(userId).then((r) => r.data?.user ?? null).catch(() => null)
          : Promise.resolve(null),
      ]);

      const displayName =
        typeof userMeta?.user_metadata?.display_name === "string"
          ? userMeta.user_metadata.display_name.trim()
          : (userMeta?.email?.trim() ?? "");

      return [userId, { avatarUrl: profile?.avatarUrl ?? "", displayName }] as const;
    })
  );

  return NextResponse.json(Object.fromEntries(entries));
}
