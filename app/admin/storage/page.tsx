"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { HardDrive, Music, Image as ImageIcon, Database } from "lucide-react";
import { useAuth } from "@/app/AuthProvider";
import { createAuthorizedHeaders } from "@/lib/clientAuth";
import { isAdminUser } from "@/lib/adminAccess";

type TopUser = {
  ownerId: string;
  displayName: string;
  bytes: number;
  trackCount: number;
};

type StorageResponse = {
  ok?: boolean;
  configured?: boolean;
  error?: string;
  media?: {
    audioBytes: number;
    audioCount: number;
    coverBytes: number;
    coverCount: number;
  };
  accountData?: {
    bytes: number;
    count: number;
  };
  topUsers?: TopUser[];
};

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 Mo";
  const units = ["o", "Ko", "Mo", "Go", "To"];
  const exponent = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / Math.pow(1024, exponent);
  return `${value.toFixed(value >= 10 || exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}

function StatCard({
  icon, label, value, sub, delay = 0,
}: { icon: React.ReactNode; label: string; value: string; sub?: string; delay?: number }) {
  return (
    <div
      className="rounded-3xl border border-white/10 bg-white/[0.03] p-5 mp3-fade-up"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="h-9 w-9 rounded-xl bg-white/8 flex items-center justify-center text-white/70 mb-3">
        {icon}
      </div>
      <p className="text-2xl font-light text-white/90 tabular-nums">{value}</p>
      <p className="text-sm text-white/50 mt-0.5">{label}</p>
      {sub ? <p className="text-xs text-white/30 mt-1">{sub}</p> : null}
    </div>
  );
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export default function AdminStoragePage() {
  const { accessToken, isAuthenticated, loading, user } = useAuth();
  const [data, setData] = useState<StorageResponse | null>(null);
  const [fetched, setFetched] = useState(false);
  const [error, setError] = useState("");

  const isAdmin = isAdminUser(user?.id);

  useEffect(() => {
    if (!isAdmin || !accessToken) return;
    fetch("/api/admin/storage", { cache: "no-store", headers: createAuthorizedHeaders(accessToken) })
      .then((r) => r.json())
      .then((json: StorageResponse) => {
        if (json.ok) setData(json);
        else setError(json.error ?? "Erreur de chargement");
      })
      .catch((e) => setError(getErrorMessage(e, "Erreur de chargement")))
      .finally(() => setFetched(true));
  }, [isAdmin, accessToken]);

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto pb-[calc(11rem+env(safe-area-inset-bottom))] sm:pb-40 pt-20 text-center text-white/35 text-sm">
        Chargement…
      </div>
    );
  }

  if (!isAuthenticated || !isAdmin) {
    return (
      <div className="max-w-2xl mx-auto pb-[calc(11rem+env(safe-area-inset-bottom))] sm:pb-40 pt-20 text-center">
        <p className="text-sm text-white/45">Accès réservé à l&apos;administrateur.</p>
        <Link href="/" className="mt-3 inline-block text-sm text-white/70 underline underline-offset-4">
          Retour à l&apos;accueil
        </Link>
      </div>
    );
  }

  const totalBytes = (data?.media?.audioBytes ?? 0) + (data?.media?.coverBytes ?? 0) + (data?.accountData?.bytes ?? 0);
  const maxUserBytes = data?.topUsers?.[0]?.bytes ?? 0;

  return (
    <div className="max-w-2xl mx-auto pb-[calc(11rem+env(safe-area-inset-bottom))] sm:pb-40">
      <div className="flex items-center justify-between mb-8 mp3-fade-up">
        <h2 className="text-3xl font-light">Stockage</h2>
        <Link href="/admin/badges" className="text-sm text-white/45 hover:text-white/80 transition underline underline-offset-4">
          Badges
        </Link>
      </div>

      {error && (
        <div className="mb-5 rounded-2xl border border-red-400/20 bg-red-400/8 px-4 py-3 text-sm text-red-300 mp3-fade-up">
          {error}
        </div>
      )}

      {!fetched ? (
        <p className="text-sm text-white/35">Chargement…</p>
      ) : data?.configured === false ? (
        <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 text-center mp3-fade-up">
          <p className="text-sm text-white/60">Backend Supabase non configure.</p>
          <p className="text-xs text-white/30 mt-1">Le stockage local ne peut pas etre mesure ici.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 mb-6">
            <StatCard
              icon={<HardDrive size={16} />}
              label="Stockage total"
              value={formatBytes(totalBytes)}
              delay={0}
            />
            <StatCard
              icon={<Music size={16} />}
              label="Audio"
              value={formatBytes(data?.media?.audioBytes ?? 0)}
              sub={`${data?.media?.audioCount ?? 0} fichier${(data?.media?.audioCount ?? 0) > 1 ? "s" : ""}`}
              delay={40}
            />
            <StatCard
              icon={<ImageIcon size={16} />}
              label="Covers"
              value={formatBytes(data?.media?.coverBytes ?? 0)}
              sub={`${data?.media?.coverCount ?? 0} fichier${(data?.media?.coverCount ?? 0) > 1 ? "s" : ""}`}
              delay={80}
            />
            <StatCard
              icon={<Database size={16} />}
              label="Donnees de compte"
              value={formatBytes(data?.accountData?.bytes ?? 0)}
              sub={`${data?.accountData?.count ?? 0} fichier${(data?.accountData?.count ?? 0) > 1 ? "s" : ""}`}
              delay={120}
            />
          </div>

          <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-5 mp3-fade-up" style={{ animationDelay: "160ms" }}>
            <p className="text-xs uppercase tracking-[0.22em] text-white/25 mb-4">Utilisateurs par espace utilise (audio)</p>

            {!data?.topUsers || data.topUsers.length === 0 ? (
              <p className="text-sm text-white/35">Aucune donnee disponible.</p>
            ) : (
              <div className="space-y-3">
                {data.topUsers.map((u, i) => (
                  <div
                    key={u.ownerId}
                    className="mp3-fade-up"
                    style={{ animationDelay: `${Math.min(i, 10) * 30}ms` }}
                  >
                    <div className="flex items-center justify-between gap-3 mb-1.5">
                      <Link
                        href={`/users/${u.ownerId}`}
                        className="text-sm text-white/85 hover:underline underline-offset-4 truncate"
                      >
                        {u.displayName}
                      </Link>
                      <span className="text-xs text-white/45 tabular-nums shrink-0">
                        {formatBytes(u.bytes)} · {u.trackCount} son{u.trackCount > 1 ? "s" : ""}
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-white/25 transition-[width] duration-500"
                        style={{ width: `${maxUserBytes > 0 ? Math.max(2, (u.bytes / maxUserBytes) * 100) : 0}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
