import { NextResponse } from "next/server";
import { createReport, type ReportType } from "@/lib/reports";
import { readAuthenticatedUser } from "@/lib/supabaseAuthServer";
import { checkRateLimit } from "@/lib/rateLimit";
import { unexpectedErrorResponse } from "@/lib/apiError";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const REPORT_LIMIT = 10;
const REPORT_WINDOW_MS = 10 * 60 * 1000;
const VALID_TYPES: ReportType[] = ["track", "chat_message", "user"];

export async function POST(req: Request) {
  try {
    const auth = await readAuthenticatedUser(req);
    if (!auth.user) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const rateLimit = checkRateLimit(`report:${auth.user.id}`, REPORT_LIMIT, REPORT_WINDOW_MS);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { ok: false, error: "Trop de signalements recents, reessaie dans quelques minutes." },
        { status: 429 }
      );
    }

    const body = await req.json().catch(() => null);
    const type = typeof body?.type === "string" ? (body.type as ReportType) : null;
    const targetId = typeof body?.targetId === "string" ? body.targetId.trim() : "";
    const targetLabel = typeof body?.targetLabel === "string" ? body.targetLabel.trim() : "";
    const reason = typeof body?.reason === "string" ? body.reason.trim() : "";

    if (!type || !VALID_TYPES.includes(type) || !targetId) {
      return NextResponse.json({ ok: false, error: "Requete invalide" }, { status: 400 });
    }

    const rawName = auth.user.user_metadata?.display_name;
    const reporterDisplayName =
      typeof rawName === "string" && rawName.trim() ? rawName.trim() : (auth.user.email?.trim() ?? "Anonyme");

    const report = await createReport({
      type,
      targetId,
      targetLabel: targetLabel || targetId,
      reporterId: auth.user.id,
      reporterDisplayName,
      reason,
    });

    return NextResponse.json({ ok: true, report });
  } catch {
    return unexpectedErrorResponse();
  }
}
