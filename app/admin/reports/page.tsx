"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Flag, Music, MessageCircle, User as UserIcon } from "lucide-react";
import { useAuth } from "@/app/AuthProvider";
import { createAuthorizedHeaders } from "@/lib/clientAuth";
import { isAdminUser } from "@/lib/adminAccess";
import { getErrorMessage } from "@/lib/errorMessage";
import type { Report, ReportStatus, ReportType } from "@/lib/reports";

const TYPE_ICON: Record<ReportType, typeof Music> = {
  track: Music,
  chat_message: MessageCircle,
  user: UserIcon,
};

const TYPE_LABEL: Record<ReportType, string> = {
  track: "Son",
  chat_message: "Message de chat",
  user: "Utilisateur",
};

function formatDate(ts: number) {
  return new Date(ts).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function AdminReportsPage() {
  const { accessToken, isAuthenticated, loading, user } = useAuth();
  const [reports, setReports] = useState<Report[]>([]);
  const [fetched, setFetched] = useState(false);
  const [error, setError] = useState("");
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<ReportStatus>("open");

  const isAdmin = isAdminUser(user?.id);

  const load = useCallback(() => {
    if (!isAdmin || !accessToken) return;
    fetch("/api/admin/reports", { cache: "no-store", headers: createAuthorizedHeaders(accessToken) })
      .then((r) => r.json())
      .then((json: { ok?: boolean; reports?: Report[]; error?: string }) => {
        if (json.ok && json.reports) setReports(json.reports);
        else setError(json.error ?? "Erreur de chargement");
      })
      .catch((e) => setError(getErrorMessage(e, "Erreur de chargement")))
      .finally(() => setFetched(true));
  }, [isAdmin, accessToken]);

  useEffect(() => {
    load();
  }, [load]);

  async function updateStatus(reportId: string, status: "resolved" | "dismissed") {
    if (!accessToken || updatingId) return;
    setUpdatingId(reportId);
    try {
      const res = await fetch("/api/admin/reports", {
        method: "PATCH",
        headers: createAuthorizedHeaders(accessToken, { "Content-Type": "application/json" }),
        body: JSON.stringify({ reportId, status }),
      });
      const json = (await res.json()) as { ok?: boolean; reports?: Report[]; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Echec de la mise a jour");
      if (json.reports) setReports(json.reports);
    } catch (e) {
      setError(getErrorMessage(e, "Echec de la mise a jour"));
    } finally {
      setUpdatingId(null);
    }
  }

  if (loading) {
    return <div className="max-w-2xl mx-auto pb-[calc(7rem+env(safe-area-inset-bottom))] sm:pb-40 pt-20 text-center text-white/35 text-sm">Chargement…</div>;
  }

  if (!isAuthenticated || !isAdmin) {
    return (
      <div className="max-w-2xl mx-auto pb-[calc(7rem+env(safe-area-inset-bottom))] sm:pb-40 pt-20 text-center">
        <p className="text-sm text-white/45">Accès réservé à l&apos;administrateur.</p>
        <Link href="/" className="mt-3 inline-block text-sm text-white/70 underline underline-offset-4">
          Retour à l&apos;accueil
        </Link>
      </div>
    );
  }

  const visible = reports.filter((r) => r.status === filter);

  return (
    <div className="max-w-2xl mx-auto pb-[calc(7rem+env(safe-area-inset-bottom))] sm:pb-40">
      <div className="flex items-center justify-between mb-8 mp3-fade-up">
        <h2 className="text-3xl font-light">Signalements</h2>
        <div className="flex items-center gap-3">
          <Link href="/admin/badges" className="text-sm text-white/45 hover:text-white/80 transition underline underline-offset-4">
            Badges
          </Link>
          <Link href="/admin/storage" className="text-sm text-white/45 hover:text-white/80 transition underline underline-offset-4">
            Stockage
          </Link>
        </div>
      </div>

      {error && (
        <div className="mb-5 rounded-2xl border border-red-400/20 bg-red-400/8 px-4 py-3 text-sm text-red-300 mp3-fade-up">
          {error}
        </div>
      )}

      <div className="flex items-center gap-1.5 mb-5 mp3-fade-up">
        {(["open", "resolved", "dismissed"] as ReportStatus[]).map((status) => (
          <button
            key={status}
            type="button"
            onClick={() => setFilter(status)}
            className={[
              "h-8 px-3.5 rounded-full text-xs font-medium transition",
              filter === status ? "bg-white text-black" : "bg-white/8 text-white/60 hover:bg-white/12",
            ].join(" ")}
          >
            {status === "open" ? "Ouverts" : status === "resolved" ? "Resolus" : "Ignores"}
            {" "}
            ({reports.filter((r) => r.status === status).length})
          </button>
        ))}
      </div>

      {!fetched ? (
        <p className="text-sm text-white/35">Chargement…</p>
      ) : visible.length === 0 ? (
        <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-8 text-center mp3-fade-up">
          <Flag size={24} className="mx-auto mb-3 text-white/15" />
          <p className="text-sm text-white/40">Aucun signalement {filter === "open" ? "en attente" : filter === "resolved" ? "resolu" : "ignore"}.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {visible.map((report, i) => {
            const Icon = TYPE_ICON[report.type];
            return (
              <div
                key={report.id}
                className="rounded-2xl border border-white/5 bg-white/[0.02] p-4 mp3-fade-up"
                style={{ animationDelay: `${Math.min(i, 9) * 30}ms` }}
              >
                <div className="flex items-start gap-3">
                  <div className="h-9 w-9 shrink-0 rounded-xl bg-white/8 flex items-center justify-center text-white/50">
                    <Icon size={15} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] uppercase tracking-wide text-white/30">{TYPE_LABEL[report.type]}</span>
                      <span className="text-[10px] text-white/25">{formatDate(report.createdAt)}</span>
                    </div>
                    <p className="text-sm text-white/85 truncate mt-0.5">{report.targetLabel}</p>
                    {report.reason ? <p className="text-xs text-white/50 mt-1">{report.reason}</p> : null}
                    <p className="text-[11px] text-white/30 mt-1.5">Signale par {report.reporterDisplayName}</p>
                  </div>
                </div>

                {report.status === "open" ? (
                  <div className="flex items-center justify-end gap-2 mt-3">
                    <button
                      type="button"
                      onClick={() => void updateStatus(report.id, "dismissed")}
                      disabled={updatingId === report.id}
                      className="h-8 px-3 rounded-lg bg-white/8 text-white/60 text-xs hover:bg-white/12 hover:text-white transition disabled:opacity-50"
                    >
                      Ignorer
                    </button>
                    <button
                      type="button"
                      onClick={() => void updateStatus(report.id, "resolved")}
                      disabled={updatingId === report.id}
                      className="h-8 px-3 rounded-lg bg-white text-black text-xs font-medium hover:opacity-90 transition disabled:opacity-50"
                    >
                      Marquer resolu
                    </button>
                  </div>
                ) : (
                  <p className="text-[11px] text-white/25 mt-2 text-right">
                    {report.status === "resolved" ? "Resolu" : "Ignore"} le {report.resolvedAt ? formatDate(report.resolvedAt) : ""}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
