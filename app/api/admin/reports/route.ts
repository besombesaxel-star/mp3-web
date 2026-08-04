import { NextResponse } from "next/server";
import { listReports, updateReportStatus } from "@/lib/reports";
import { isAdminUser } from "@/lib/adminAccess";
import { readAuthenticatedUser } from "@/lib/supabaseAuthServer";
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
    if (!isAdminUser(auth.user.id)) {
      return NextResponse.json({ ok: false, error: "Acces refuse" }, { status: 403 });
    }

    const reports = await listReports();
    return NextResponse.json({ ok: true, reports });
  } catch {
    return unexpectedErrorResponse();
  }
}

export async function PATCH(req: Request) {
  try {
    const auth = await readAuthenticatedUser(req);
    if (!auth.user) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }
    if (!isAdminUser(auth.user.id)) {
      return NextResponse.json({ ok: false, error: "Acces refuse" }, { status: 403 });
    }

    const body = await req.json().catch(() => null);
    const reportId = typeof body?.reportId === "string" ? body.reportId : "";
    const status = body?.status === "resolved" || body?.status === "dismissed" ? body.status : null;

    if (!reportId || !status) {
      return NextResponse.json({ ok: false, error: "Requete invalide" }, { status: 400 });
    }

    const result = await updateReportStatus(reportId, status, auth.user.id);
    if (result === "not_found") {
      return NextResponse.json({ ok: false, error: "Signalement introuvable" }, { status: 404 });
    }

    const reports = await listReports();
    return NextResponse.json({ ok: true, reports });
  } catch {
    return unexpectedErrorResponse();
  }
}
