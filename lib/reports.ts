import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export type ReportType = "track" | "chat_message" | "user";
export type ReportStatus = "open" | "resolved" | "dismissed";

export type Report = {
  id: string;
  type: ReportType;
  targetId: string;
  targetLabel: string;
  reporterId: string;
  reporterDisplayName: string;
  reason: string;
  createdAt: number;
  status: ReportStatus;
  resolvedAt?: number;
  resolvedBy?: string;
};

type ReportsData = {
  reports: Report[];
};

const MAX_REPORTS = 500;
const MAX_REASON_LENGTH = 300;
const PATH = "moderation/reports.json";

function emptyData(): ReportsData {
  return { reports: [] };
}

function normalizeData(raw: unknown): ReportsData {
  if (!raw || typeof raw !== "object") return emptyData();
  const value = raw as { reports?: unknown };

  const reports: Report[] = Array.isArray(value.reports)
    ? value.reports.filter((r): r is Report =>
        Boolean(
          r &&
            typeof r === "object" &&
            typeof (r as Report).id === "string" &&
            typeof (r as Report).targetId === "string" &&
            typeof (r as Report).reporterId === "string" &&
            typeof (r as Report).status === "string"
        )
      )
    : [];

  return { reports };
}

async function readReports(): Promise<ReportsData> {
  const admin = getSupabaseAdmin();
  if (!admin) return emptyData();

  const { data, error } = await admin.client.storage.from(admin.accountBucket).download(PATH);
  if (error || !data) return emptyData();

  try {
    return normalizeData(JSON.parse(await data.text()));
  } catch {
    return emptyData();
  }
}

async function writeReports(data: ReportsData): Promise<void> {
  const admin = getSupabaseAdmin();
  if (!admin) return;

  const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
  await admin.client.storage.from(admin.accountBucket).upload(PATH, blob, { upsert: true, contentType: "application/json" });
}

export async function createReport(input: {
  type: ReportType;
  targetId: string;
  targetLabel: string;
  reporterId: string;
  reporterDisplayName: string;
  reason: string;
}): Promise<Report> {
  const report: Report = {
    id: crypto.randomUUID(),
    type: input.type,
    targetId: input.targetId,
    targetLabel: input.targetLabel.slice(0, 200),
    reporterId: input.reporterId,
    reporterDisplayName: input.reporterDisplayName,
    reason: input.reason.trim().slice(0, MAX_REASON_LENGTH),
    createdAt: Date.now(),
    status: "open",
  };

  const current = await readReports();
  const updated: ReportsData = { reports: [...current.reports, report].slice(-MAX_REPORTS) };
  await writeReports(updated);

  return report;
}

export async function listReports(): Promise<Report[]> {
  const data = await readReports();
  return [...data.reports].sort((a, b) => b.createdAt - a.createdAt);
}

export async function updateReportStatus(
  reportId: string,
  status: Exclude<ReportStatus, "open">,
  actorUserId: string
): Promise<"ok" | "not_found"> {
  const current = await readReports();
  const target = current.reports.find((r) => r.id === reportId);
  if (!target) return "not_found";

  target.status = status;
  target.resolvedAt = Date.now();
  target.resolvedBy = actorUserId;

  await writeReports(current);
  return "ok";
}
