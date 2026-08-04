import { createAuthorizedHeaders } from "@/lib/clientAuth";
import type { ReportType } from "@/lib/reports";

export async function reportContent(
  accessToken: string,
  input: { type: ReportType; targetId: string; targetLabel: string; reason?: string }
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch("/api/reports", {
      method: "POST",
      headers: createAuthorizedHeaders(accessToken, { "Content-Type": "application/json" }),
      body: JSON.stringify({ ...input, reason: input.reason ?? "" }),
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!res.ok || !json.ok) return { ok: false, error: json.error ?? `HTTP ${res.status}` };
    return { ok: true };
  } catch {
    return { ok: false, error: "Erreur reseau" };
  }
}
