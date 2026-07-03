"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/app/AuthProvider";
import { createAuthorizedHeaders } from "@/lib/clientAuth";
import { isAdminUser } from "@/lib/adminAccess";
import { BADGE_LABELS, MANUAL_BADGE_KEYS, type BadgeKey } from "@/lib/badges";

type Assignments = Record<string, BadgeKey[]>;

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export default function AdminBadgesPage() {
  const { accessToken, isAuthenticated, loading, user } = useAuth();
  const [assignments, setAssignments] = useState<Assignments>({});
  const [fetched, setFetched] = useState(false);
  const [error, setError] = useState("");
  const [userId, setUserId] = useState("");
  const [selectedBadges, setSelectedBadges] = useState<Set<BadgeKey>>(new Set());
  const [displayNames, setDisplayNames] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const isAdmin = isAdminUser(user?.id);

  useEffect(() => {
    if (!isAdmin || !accessToken) return;
    fetch("/api/admin/badges", { cache: "no-store", headers: createAuthorizedHeaders(accessToken) })
      .then((r) => r.json())
      .then((json: { ok?: boolean; assignments?: Assignments; error?: string }) => {
        if (json.ok && json.assignments) setAssignments(json.assignments);
        else setError(json.error ?? "Erreur de chargement");
      })
      .catch((e) => setError(getErrorMessage(e, "Erreur de chargement")))
      .finally(() => setFetched(true));
  }, [isAdmin, accessToken]);

  useEffect(() => {
    const ids = Object.keys(assignments).filter((id) => !(id in displayNames));
    if (ids.length === 0) return;

    ids.forEach((id) => {
      fetch(`/api/public/users/${encodeURIComponent(id)}`, { cache: "no-store" })
        .then((r) => r.json())
        .then((json: { ok?: boolean; profile?: { displayName?: string } }) => {
          setDisplayNames((prev) => ({ ...prev, [id]: json.profile?.displayName ?? id }));
        })
        .catch(() => setDisplayNames((prev) => ({ ...prev, [id]: id })));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignments]);

  function toggleBadge(key: BadgeKey) {
    setSelectedBadges((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function save() {
    const targetId = userId.trim();
    if (!targetId || !accessToken || saving) return;

    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/admin/badges", {
        method: "PUT",
        headers: createAuthorizedHeaders(accessToken, { "Content-Type": "application/json" }),
        body: JSON.stringify({ userId: targetId, badges: [...selectedBadges] }),
      });
      const json = (await res.json()) as { ok?: boolean; assignments?: Assignments; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Echec de l'enregistrement");

      if (json.assignments) setAssignments(json.assignments);
      setUserId("");
      setSelectedBadges(new Set());
    } catch (e) {
      setError(getErrorMessage(e, "Echec de l'enregistrement"));
    } finally {
      setSaving(false);
    }
  }

  async function clearUser(targetId: string) {
    if (!accessToken) return;
    try {
      const res = await fetch("/api/admin/badges", {
        method: "PUT",
        headers: createAuthorizedHeaders(accessToken, { "Content-Type": "application/json" }),
        body: JSON.stringify({ userId: targetId, badges: [] }),
      });
      const json = (await res.json()) as { ok?: boolean; assignments?: Assignments; error?: string };
      if (res.ok && json.ok && json.assignments) setAssignments(json.assignments);
    } catch {
      /* silent */
    }
  }

  if (loading) {
    return <div className="max-w-2xl mx-auto pb-[calc(11rem+env(safe-area-inset-bottom))] sm:pb-40 pt-20 text-center text-white/35 text-sm">Chargement…</div>;
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

  return (
    <div className="max-w-2xl mx-auto pb-[calc(11rem+env(safe-area-inset-bottom))] sm:pb-40">
      <div className="flex items-center justify-between mb-8 mp3-fade-up">
        <h2 className="text-3xl font-light">Badges</h2>
        <Link href="/admin/storage" className="text-sm text-white/45 hover:text-white/80 transition underline underline-offset-4">
          Stockage
        </Link>
      </div>

      {error && (
        <div className="mb-5 rounded-2xl border border-red-400/20 bg-red-400/8 px-4 py-3 text-sm text-red-300 mp3-fade-up">
          {error}
        </div>
      )}

      <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-5 mb-6 mp3-fade-up mp3-d-1">
        <p className="text-xs uppercase tracking-[0.22em] text-white/25 mb-4">Attribuer un badge</p>

        <input
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          placeholder="ID utilisateur (UUID)"
          className="w-full rounded-2xl bg-[#111118] border border-white/5 px-3 py-2.5 text-base sm:text-sm text-white/90 outline-none placeholder:text-white/35 mb-3"
        />

        <div className="flex items-center gap-2 mb-4">
          {MANUAL_BADGE_KEYS.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => toggleBadge(key)}
              aria-pressed={selectedBadges.has(key)}
              className={[
                "h-9 px-4 rounded-full text-sm transition",
                selectedBadges.has(key)
                  ? "bg-white text-black font-medium"
                  : "bg-white/8 text-white/60 hover:bg-white/12",
              ].join(" ")}
            >
              {BADGE_LABELS[key]}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => void save()}
          disabled={!userId.trim() || saving}
          className="h-10 px-5 rounded-full bg-white text-black text-sm font-medium hover:opacity-90 transition disabled:opacity-50"
        >
          {saving ? "Enregistrement…" : "Enregistrer"}
        </button>
      </section>

      <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-5 mp3-fade-up mp3-d-2">
        <p className="text-xs uppercase tracking-[0.22em] text-white/25 mb-4">Attributions actuelles</p>

        {!fetched ? (
          <p className="text-sm text-white/35">Chargement…</p>
        ) : Object.keys(assignments).length === 0 ? (
          <p className="text-sm text-white/35">Aucun badge attribué.</p>
        ) : (
          <div className="space-y-2.5">
            {Object.entries(assignments).map(([id, badges], i) => (
              <div
                key={id}
                className="flex items-center justify-between gap-3 rounded-2xl border border-white/5 bg-white/[0.02] px-4 py-3 mp3-fade-up"
                style={{ animationDelay: `${Math.min(i, 9) * 30}ms` }}
              >
                <div className="min-w-0">
                  <Link href={`/users/${id}`} className="text-sm text-white/85 hover:underline underline-offset-4 truncate block">
                    {displayNames[id] ?? id}
                  </Link>
                  <p className="text-xs text-white/35 mt-0.5">
                    {badges.map((b) => BADGE_LABELS[b]).join(", ")}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void clearUser(id)}
                  className="shrink-0 h-8 px-3 rounded-lg bg-white/8 text-white/60 text-xs hover:bg-white/12 hover:text-white transition"
                >
                  Retirer
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
